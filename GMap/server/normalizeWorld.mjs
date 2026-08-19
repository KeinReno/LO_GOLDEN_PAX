/**
 * Soft-normalize WorldState for live table (P0.4).
 * Does not strip unknown fields — only fills safe defaults.
 *
 * Note (B2): faction eco.roleScores lives in ledger.json, not WorldState.
 * Migration/init is ledger.ensureFactionEco → roleScores.ensureRoleScores (8 keys).
 *
 * Orchestrator only — normalization logic per sub-area lives in
 * ./normalizeWorld/*.mjs. Kept as the stable import path so existing
 * `from "./normalizeWorld.mjs"` call sites don't need to change.
 */
import { syncNpcPassiveEffects } from "./courtGovernance.mjs";
import { normalizeGmPegMultipliers } from "./currencyPeg.mjs";
import { getContent } from "./contentLoader.mjs";
import { loadAliases, resolveAlias, normalizePlayerOrder } from "./normalizeWorld/helpers.mjs";
import { normalizeSystems } from "./normalizeWorld/systems.mjs";
import { normalizeFleets, normalizeLegions } from "./normalizeWorld/forces.mjs";
import { normalizeRaces, normalizeFactions, stampFactionPrimaryRaces } from "./normalizeWorld/factions.mjs";
// NOTE: do not import orderEngine here — it pulls tableStore and causes DATA_DIR TDZ.
// Order migration helpers are inlined (kept in sync with orderEngine.normalizePlayerOrder).

export { loadAliases, resolveAlias };

export function normalizeWorld(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("normalizeWorld: expected object");
  }
  const aliases = loadAliases();
  const content = getContent();
  const meta = {
    schemaVersion: raw.meta?.schemaVersion ?? 9,
    name: raw.meta?.name ?? "Кампания",
    turn: raw.meta?.turn ?? 0,
    createdAt: raw.meta?.createdAt ?? new Date().toISOString(),
    updatedAt: raw.meta?.updatedAt ?? new Date().toISOString(),
    width: raw.meta?.width ?? 4000,
    height: raw.meta?.height ?? 3000,
    tableRevision: raw.meta?.tableRevision ?? 0,
    contentPacks: raw.meta?.contentPacks ?? ["core"],
    yearlyQuestRolls:
      raw.meta?.yearlyQuestRolls && typeof raw.meta.yearlyQuestRolls === "object"
        ? raw.meta.yearlyQuestRolls
        : {},
    gmPegMultipliers: normalizeGmPegMultipliers(raw.meta?.gmPegMultipliers),
  };

  const systems = normalizeSystems(raw, content);
  const fleets = normalizeFleets(raw);
  const legions = normalizeLegions(raw);
  const races = normalizeRaces(raw);
  const diplomacyEdges = Array.isArray(raw.diplomacy) ? raw.diplomacy : [];
  const factions = normalizeFactions(raw, meta, diplomacyEdges);

  // Stub faction for leftover revolt legions (stabilityRevolt.mjs also mints rebel.<planet>.<turn>).
  const REBEL_FACTION_ID = "faction_rebels";
  const hasRebelForces =
    fleets.some((f) => f.factionId === REBEL_FACTION_ID) ||
    legions.some((l) => l.factionId === REBEL_FACTION_ID);
  const factionsOut =
    hasRebelForces && !factions.some((f) => f.id === REBEL_FACTION_ID)
      ? [
          ...factions,
          {
            id: REBEL_FACTION_ID,
            name: "Мятежники",
            color: "#6b2b2b",
            kind: "neutral",
            capitalSystemId: null,
            primaryRaceId: null,
            traits: [],
            activeEffects: [],
            diplomacy: { opinions: {}, treaties: [], history: [] },
            npcs: [],
            defaultCultureId: "culture.baseline",
            primaryFaith: "faith.secular",
            fxCurrencyId: null,
            treasuryPeg: null,
          },
        ]
      : factions;

  const out = {
    ...raw,
    meta,
    systems,
    links: raw.links ?? [],
    sectors: raw.sectors ?? [],
    factions: factionsOut,
    races,
    fleets,
    legions,
    diplomacy: diplomacyEdges,
    orders: (raw.orders ?? []).map((o) =>
      normalizePlayerOrder(o, meta.turn ?? 0),
    ),
    turnHistory: raw.turnHistory ?? [],
    caravans: raw.caravans ?? [],
    quests: (raw.quests ?? []).map((q) => ({
      ...q,
      type: q.type || "side",
      history: Array.isArray(q.history) ? q.history : [],
      sourceNpcId: q.sourceNpcId ?? null,
      sourceFactionId: q.sourceFactionId ?? null,
      sourceSystemId: q.sourceSystemId ?? q.systemId ?? null,
      expiresTurn: q.expiresTurn ?? null,
      catalogId: q.catalogId ?? null,
    })),
    courtEvents: Array.isArray(raw.courtEvents) ? raw.courtEvents : [],
    loyaltyMatrix:
      raw.loyaltyMatrix && typeof raw.loyaltyMatrix === "object"
        ? raw.loyaltyMatrix
        : {},
    _aliasesVersion: aliases.version ?? 1,
  };

  try {
    stampFactionPrimaryRaces(out, getContent().races);
  } catch {
    stampFactionPrimaryRaces(out);
  }
  try {
    syncNpcPassiveEffects(out);
  } catch {
    // content may be unavailable in some CLI contexts
  }

  return out;
}

/**
 * Soft-normalize a persisted engagement (A6 migration).
 */
export function normalizeEngagement(raw) {
  if (!raw || typeof raw !== "object") return raw;
  const status =
    raw.status === "commit" || raw.status === "contact"
      ? "active"
      : raw.status || "active";
  return {
    ...raw,
    status,
    startedTurn: raw.startedTurn ?? raw.turnCreated ?? 0,
    roundsElapsed: raw.roundsElapsed ?? 0,
    maxRounds: raw.maxRounds ?? 3,
    requiresPlayerInput:
      raw.requiresPlayerInput != null ? raw.requiresPlayerInput : true,
    mode: raw.mode || "auto",
    cardBattleRequests: Array.isArray(raw.cardBattleRequests)
      ? raw.cardBattleRequests
      : [],
    phase: raw.phase ?? (raw.theater === "assault" ? "bombard" : undefined),
    sides: (raw.sides || []).map((s) => ({
      ...s,
      locked: s.locked === true,
      stance: s.stance || "hold",
    })),
  };
}
