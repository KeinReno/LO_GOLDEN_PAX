/**
 * Engagement store I/O + creation. Base module — no dependency on the other
 * engagements submodules. Extracted from ../engagements.mjs.
 */
import path from "node:path";
import { DATA_DIR, readJson, writeJson, ensureDataDir } from "../tableStore.mjs";
import { isNormalizedStoreActive } from "../db/storeAdapter.mjs";
import { readEngagementRows, writeEngagementRows } from "../db/campaignDb.mjs";
import { buildDefenseLayers, ASSAULT_PHASES } from "../combatResolve.mjs";
import { getContent } from "../contentLoader.mjs";

export const ENGAGEMENTS_PATH = path.join(DATA_DIR, "engagements.json");

export const OPEN_ENGAGEMENT_STATUSES = new Set([
  "active",
  "commit",
  "contact",
]);

export function isOpenEngagement(eng) {
  return eng && OPEN_ENGAGEMENT_STATUSES.has(eng.status);
}

export { cancelEngagementsMissingForces } from "../engagementReconcile.mjs";

export function readEngagements() {
  ensureDataDir();
  const raw = isNormalizedStoreActive()
    ? readEngagementRows()
    : readJson(ENGAGEMENTS_PATH, null);
  const list = Array.isArray(raw) ? raw : [];
  // Lazy import to avoid circular deps at module load
  return list.map((e) => {
    try {
      // inline soft-normalize (mirror normalizeEngagement)
      const status =
        e.status === "commit" || e.status === "contact" ? "active" : e.status;
      return {
        ...e,
        status: status || "active",
        startedTurn: e.startedTurn ?? e.turnCreated ?? 0,
        roundsElapsed: e.roundsElapsed ?? 0,
        maxRounds: e.maxRounds ?? 3,
        requiresPlayerInput:
          e.requiresPlayerInput != null ? e.requiresPlayerInput : true,
        mode: e.mode || "auto",
        cardBattleRequests: Array.isArray(e.cardBattleRequests)
          ? e.cardBattleRequests
          : [],
        sides: (e.sides || []).map((s) => ({
          ...s,
          locked: !!s.locked,
          stance: s.stance || "hold",
        })),
      };
    } catch {
      return e;
    }
  });
}

export function writeEngagements(list) {
  if (isNormalizedStoreActive()) {
    writeEngagementRows(list);
    return;
  }
  writeJson(ENGAGEMENTS_PATH, list);
}

export function engagementRules() {
  const content = getContent();
  return (
    content.rules?.engagement || {
      maxRounds: 3,
      requiresPlayerInput: true,
      assaultPhases: ASSAULT_PHASES,
    }
  );
}

export function createEngagement({
  theater,
  systemId,
  planetId,
  sideA,
  sideB,
  turn,
  source,
  world,
}) {
  const rules = engagementRules();
  const th = theater || "space";
  const eng = {
    id: `eng_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    theater: th,
    systemId,
    planetId: planetId || null,
    turnCreated: turn ?? 0,
    startedTurn: turn ?? 0,
    status: "active",
    source: source || "contact",
    roundsElapsed: 0,
    maxRounds: rules.maxRounds ?? 3,
    requiresPlayerInput: rules.requiresPlayerInput !== false,
    mode: "auto",
    cardBattleRequests: [],
    cardBattleOffer: false,
    cardBattle: null,
    gmForceCard: false,
    sides: [
      {
        factionId: sideA.factionId,
        fleetIds: sideA.fleetIds || [],
        legionIds: sideA.legionIds || [],
        stance: sideA.stance || "assault",
        locked: false,
      },
      {
        factionId: sideB.factionId,
        fleetIds: sideB.fleetIds || [],
        legionIds: sideB.legionIds || [],
        stance: sideB.stance || "hold",
        locked: false,
      },
    ],
    result: null,
  };

  if (th === "assault") {
    eng.phase = "bombard";
    eng.orbitalControl = "defender";
    eng.defenseLayers = world
      ? buildDefenseLayers(world, eng)
      : {
          orbital: { guns: 0, shields: 0 },
          surface: { guns: 0, bunkers: 0 },
          garrison: { unitIds: [], fortBonus: 0 },
        };
  }

  return eng;
}
