/**
 * Engagement store + contact/resolve pipeline (P5 / A6).
 * Engagements live between ticks until stances lock or maxRounds.
 */
import path from "node:path";
import { DATA_DIR, readJson, writeJson, ensureDataDir } from "./tableStore.mjs";
import {
  resolveEngagementFight,
  resolveAssaultPhase,
  cleanupEmptyComposition,
  buildDefenseLayers,
  ASSAULT_PHASES,
} from "./combatResolve.mjs";
import {
  prepareCardBattle,
  playCardRound,
  passCardRound,
  finalizeCardBattle,
  shouldOfferCardBattle,
  drawFromDeck,
} from "./cardBattle.mjs";
import { getContent } from "./contentLoader.mjs";
import { spawnRefugees } from "./narrative.mjs";

export const ENGAGEMENTS_PATH = path.join(DATA_DIR, "engagements.json");

export const OPEN_ENGAGEMENT_STATUSES = new Set([
  "active",
  "commit",
  "contact",
]);

export function isOpenEngagement(eng) {
  return eng && OPEN_ENGAGEMENT_STATUSES.has(eng.status);
}

export function readEngagements() {
  ensureDataDir();
  const raw = readJson(ENGAGEMENTS_PATH, null);
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
  writeJson(ENGAGEMENTS_PATH, list);
}

function atWar(world, aId, bId) {
  if (!aId || !bId || aId === bId) return false;
  return (world.diplomacy ?? []).some((e) => {
    if (e.relation !== "war") return false;
    return (
      (e.aId === aId && e.bId === bId) || (e.aId === bId && e.bId === aId)
    );
  });
}

function engagementRules() {
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

function retreatFleet(world, fleetId, fromSystemId) {
  const fleet = (world.fleets ?? []).find((f) => f.id === fleetId);
  if (!fleet) return;
  const routeBack = (fleet.route || [])[0];
  if (routeBack && routeBack !== fromSystemId) {
    fleet.systemId = routeBack;
    fleet.route = [];
    fleet.stance = "move";
    return;
  }
  const neighbors = (world.links ?? [])
    .filter((l) => l.fromId === fromSystemId || l.toId === fromSystemId)
    .map((l) => (l.fromId === fromSystemId ? l.toId : l.fromId));
  const dest = neighbors[0];
  if (dest) {
    fleet.systemId = dest;
    fleet.stance = "move";
  }
}

function applyOccupationEffects(world, eng, journal) {
  const sys = (world.systems ?? []).find((s) => s.id === eng.systemId);
  if (!sys) return;
  const a = eng.sides[0];
  const planets = (sys.planets || []).filter((p) =>
    eng.planetId ? p.id === eng.planetId : true,
  );
  for (const p of planets) {
    p.ownerFactionId = a.factionId;
    if (typeof p.stability === "number") {
      p.stability = Math.max(0, p.stability - 3);
    } else {
      p.stability = Math.max(0, 50 - 3);
    }
    if (typeof p.loyalty === "number") {
      p.loyalty = Math.max(0, p.loyalty - 8);
    }
  }
  let popHit = 0;
  for (const p of planets) {
    if ((p.population || 0) > 0) {
      const loss = Math.max(1, Math.floor(p.population * 0.08));
      p.population = Math.max(0, p.population - loss);
      popHit += loss;
    }
  }
  if (popHit > 0) spawnRefugees(world, eng.systemId, popHit, journal);
  sys.contested = false;
  sys.ownerFactionId = a.factionId;
}

function applyAftermath(world, eng, fight, journal) {
  const sys = (world.systems ?? []).find((s) => s.id === eng.systemId);
  if (sys) {
    sys.activity = "battle";
    const objs = new Set(sys.spaceObjects || []);
    objs.add("debris");
    sys.spaceObjects = [...objs];
    if (!sys.poiType || sys.poiType === "none") sys.poiType = "debris";
  }

  const a = eng.sides[0];
  const b = eng.sides[1];

  if (fight.outcome === "retreat_a" || fight.retreated === a.factionId) {
    for (const fid of a.fleetIds || []) retreatFleet(world, fid, eng.systemId);
  }
  if (fight.outcome === "retreat_b" || fight.retreated === b.factionId) {
    for (const fid of b.fleetIds || []) retreatFleet(world, fid, eng.systemId);
  }

  if (
    (eng.theater === "assault" || fight.phase === "occupation") &&
    fight.outcome === "win_a" &&
    sys
  ) {
    const prev = sys.ownerFactionId;
    if (prev && prev !== a.factionId) {
      sys.contested = true;
      sys.coOwnerFactionIds = Array.from(
        new Set([...(sys.coOwnerFactionIds || []), a.factionId, prev]),
      );
    } else {
      sys.ownerFactionId = a.factionId;
    }
    if (fight.phase === "occupation" || eng.phase === "occupation") {
      applyOccupationEffects(world, eng, journal);
    } else {
      let popHit = 0;
      for (const p of sys.planets || []) {
        if ((p.population || 0) > 0) {
          const loss = Math.max(1, Math.floor(p.population * 0.08));
          p.population = Math.max(0, p.population - loss);
          popHit += loss;
        }
      }
      if (popHit > 0) spawnRefugees(world, eng.systemId, popHit, journal);
    }
  }

  if (
    eng.theater === "space" &&
    (a.stance === "bombard" || eng.source === "bombard")
  ) {
    if (sys) {
      let popHit = 0;
      for (const p of sys.planets || []) {
        if ((p.population || 0) > 0) {
          const loss = Math.max(1, Math.floor(p.population * 0.05));
          p.population = Math.max(0, p.population - loss);
          popHit += loss;
        }
      }
      if (popHit > 0) spawnRefugees(world, eng.systemId, popHit, journal);
    }
  }

  journal.push({
    type: "engagement_resolved",
    engagementId: eng.id,
    theater: eng.theater,
    systemId: eng.systemId,
    outcome: fight.outcome,
    phase: fight.phase || eng.phase || null,
    powerA: Math.round(fight.powerA || 0),
    powerB: Math.round(fight.powerB || 0),
    lossesA: fight.lossesA,
    lossesB: fight.lossesB,
    sides: eng.sides.map((s) => s.factionId),
  });
}

function unlockSides(eng) {
  for (const s of eng.sides || []) {
    s.locked = false;
  }
}

function bothSidesLocked(eng) {
  return (eng.sides || []).length >= 2 && eng.sides.every((s) => s.locked);
}

function autoLockSides(eng) {
  for (const s of eng.sides || []) {
    if (!s.locked) {
      s.locked = true;
      s.stance = s.stance || "hold";
    }
  }
}

function finalizeEngagement(world, eng, fight, journal) {
  eng.status = "resolved";
  eng.result = fight;
  applyAftermath(world, eng, fight, journal);
}

function advanceAssaultPhase(world, eng, fight, journal) {
  eng.result = { ...(eng.result || {}), lastPhase: fight };
  journal.push({
    type: "engagement_phase",
    engagementId: eng.id,
    theater: eng.theater,
    systemId: eng.systemId,
    phase: fight.phase,
    nextPhase: fight.nextPhase,
    outcome: fight.outcome,
    phaseNote: fight.phaseNote,
    powerA: Math.round(fight.powerA || 0),
    powerB: Math.round(fight.powerB || 0),
    lossesA: fight.lossesA,
    lossesB: fight.lossesB,
    sides: eng.sides.map((s) => s.factionId),
  });

  if (!fight.continueEngagement || !fight.nextPhase) {
    if (fight.outcome === "phase_continue") {
      fight.outcome = "draw";
    }
    finalizeEngagement(world, eng, fight, journal);
    return;
  }

  eng.phase = fight.nextPhase;
  eng.defenseLayers = fight.defenseLayers || eng.defenseLayers;
  eng.roundsElapsed = 0;
  unlockSides(eng);
  eng.status = "active";

  if (fight.nextPhase === "occupation" && fight.outcome === "win_a") {
    eng.sides.forEach((s) => {
      s.locked = true;
    });
  }
}

/**
 * Resolve open engagements that are ready (both locked or timed out).
 */
export function resolveOpenEngagements(world, journal) {
  const list = readEngagements();
  const open = list.filter((e) => isOpenEngagement(e));
  let resolved = 0;

  for (const eng of open) {
    if (eng.status === "commit" || eng.status === "contact") {
      eng.status = "active";
      if (eng.requiresPlayerInput == null) eng.requiresPlayerInput = true;
      if (eng.roundsElapsed == null) eng.roundsElapsed = 0;
      if (eng.maxRounds == null) {
        eng.maxRounds = engagementRules().maxRounds ?? 3;
      }
      if (eng.startedTurn == null) eng.startedTurn = eng.turnCreated ?? 0;
      if (eng.sides?.every((s) => s.locked == null)) {
        for (const s of eng.sides) s.locked = true;
      }
    }

    eng.roundsElapsed = (eng.roundsElapsed || 0) + 1;
    const maxRounds = eng.maxRounds ?? engagementRules().maxRounds ?? 3;
    const needsInput = eng.requiresPlayerInput !== false;
    const locked = bothSidesLocked(eng);
    const timedOut = eng.roundsElapsed >= maxRounds;

    if (needsInput && !locked && !timedOut) {
      journal.push({
        type: "engagement_awaiting_stance",
        engagementId: eng.id,
        theater: eng.theater,
        systemId: eng.systemId,
        phase: eng.phase || null,
        roundsElapsed: eng.roundsElapsed,
        maxRounds,
        message: `Бой в системе ${eng.systemId}, выберите stance`,
        sides: eng.sides.map((s) => s.factionId),
      });
      continue;
    }

    if (timedOut && !locked) {
      autoLockSides(eng);
      journal.push({
        type: "engagement_auto_resolve",
        engagementId: eng.id,
        systemId: eng.systemId,
        reason: "max_rounds",
        sides: eng.sides.map((s) => s.factionId),
      });
    }

    if (eng.mode === "card") {
      if (eng.cardBattle?.status === "resolved") {
        finishCardEngagement(world, eng, journal);
        resolved += 1;
        continue;
      }
      if (!eng.cardBattle || eng.cardBattle.status !== "active") {
        const prep = prepareCardBattle(eng, world, getContent());
        if (!prep.ok) {
          eng.mode = "auto";
          journal.push({
            type: "card_battle_prepare_failed",
            engagementId: eng.id,
            reason: prep.error,
            sides: eng.sides.map((s) => s.factionId),
          });
          // fall through to auto resolve below
        } else {
          journal.push({
            type: "card_battle_started",
            engagementId: eng.id,
            systemId: eng.systemId,
            sides: eng.sides.map((s) => s.factionId),
          });
          continue;
        }
      } else {
        journal.push({
          type: "engagement_card_pending",
          engagementId: eng.id,
          systemId: eng.systemId,
          round: eng.cardBattle.round,
          currentSide: eng.cardBattle.currentSide,
          sides: eng.sides.map((s) => s.factionId),
        });
        continue;
      }
    }

    if (eng.mode === "card" && eng.cardBattle?.status === "active") {
      continue;
    }

    if (eng.theater === "assault" && eng.phase) {
      const fight = resolveAssaultPhase(world, eng);
      if (!fight.ok) {
        eng.status = "cancelled";
        eng.result = fight;
        journal.push({
          type: "engagement_cancelled",
          engagementId: eng.id,
          reason: fight.error,
        });
        resolved += 1;
        continue;
      }
      if (fight.continueEngagement && fight.nextPhase) {
        advanceAssaultPhase(world, eng, fight, journal);
      } else {
        finalizeEngagement(world, eng, fight, journal);
        resolved += 1;
      }
      continue;
    }

    const fight = resolveEngagementFight(world, eng);
    if (!fight.ok) {
      eng.status = "cancelled";
      eng.result = fight;
      journal.push({
        type: "engagement_cancelled",
        engagementId: eng.id,
        reason: fight.error,
      });
      resolved += 1;
      continue;
    }
    finalizeEngagement(world, eng, fight, journal);
    resolved += 1;
  }

  cleanupEmptyComposition(world);
  writeEngagements(list);
  return resolved;
}

/**
 * GM / early-resolve: force advance current phase or full resolve.
 */
export function advanceEngagement(engagementId, world, journal, opts = {}) {
  const content = getContent();
  const allowEarly = content.rules?.combat?.allowEarlyResolve !== false;
  if (!allowEarly && !opts.force) {
    return { ok: false, error: "early resolve disabled" };
  }
  const list = readEngagements();
  const eng = list.find((e) => e.id === engagementId);
  if (!eng || !isOpenEngagement(eng)) {
    return { ok: false, error: "engagement not open" };
  }
  autoLockSides(eng);
  eng.roundsElapsed = eng.maxRounds ?? 3;

  if (eng.theater === "assault" && eng.phase && !opts.fullResolve) {
    const fight = resolveAssaultPhase(world, eng);
    if (!fight.ok) {
      writeEngagements(list);
      return { ok: false, error: fight.error };
    }
    if (fight.continueEngagement && fight.nextPhase) {
      advanceAssaultPhase(world, eng, fight, journal);
    } else {
      finalizeEngagement(world, eng, fight, journal);
    }
  } else if (eng.theater === "assault" && eng.phase) {
    let guard = 8;
    while (isOpenEngagement(eng) && guard-- > 0) {
      const fight = resolveAssaultPhase(world, eng);
      if (!fight.ok) break;
      if (fight.continueEngagement && fight.nextPhase) {
        advanceAssaultPhase(world, eng, fight, journal);
        autoLockSides(eng);
      } else {
        finalizeEngagement(world, eng, fight, journal);
        break;
      }
    }
  } else {
    const fight = resolveEngagementFight(world, eng);
    if (!fight.ok) {
      writeEngagements(list);
      return { ok: false, error: fight.error };
    }
    finalizeEngagement(world, eng, fight, journal);
  }

  cleanupEmptyComposition(world);
  writeEngagements(list);
  return { ok: true, engagement: eng };
}

/**
 * Build engagements from attack intent + auto war contacts in systems.
 */
export function collectContactsAndAttacks(world, turn, attackIntents, journal) {
  const list = readEngagements();
  const created = [];

  for (const intent of attackIntents) {
    const toId = intent.payload?.toSystemId;
    const fleetId = intent.payload?.fleetId;
    if (!toId) continue;
    const sys = (world.systems ?? []).find((s) => s.id === toId);
    if (!sys) continue;

    const theater =
      intent.payload?.theater ||
      (intent.payload?.planetId || intent.payload?.assault
        ? "assault"
        : "space");

    const defendersFleets = (world.fleets ?? [])
      .filter(
        (f) =>
          f.systemId === toId &&
          f.factionId !== intent.factionId &&
          (atWar(world, intent.factionId, f.factionId) ||
            sys.ownerFactionId === f.factionId),
      )
      .map((f) => f.id);
    const defendersLegions = (world.legions ?? [])
      .filter(
        (l) =>
          l.systemId === toId &&
          l.factionId !== intent.factionId &&
          (atWar(world, intent.factionId, l.factionId) ||
            sys.ownerFactionId === l.factionId),
      )
      .map((l) => l.id);

    const attackerFleets = fleetId
      ? [fleetId]
      : (world.fleets ?? [])
          .filter((f) => f.factionId === intent.factionId && f.systemId === toId)
          .map((f) => f.id);
    const attackerLegions = (world.legions ?? [])
      .filter((l) => l.factionId === intent.factionId && l.systemId === toId)
      .map((l) => l.id);

    let defFaction =
      defendersFleets[0] &&
      (world.fleets ?? []).find((f) => f.id === defendersFleets[0])?.factionId;
    if (!defFaction && defendersLegions[0]) {
      defFaction = (world.legions ?? []).find(
        (l) => l.id === defendersLegions[0],
      )?.factionId;
    }
    if (!defFaction) defFaction = sys.ownerFactionId;

    if (!defFaction || defFaction === intent.factionId) {
      sys.activity = "battle";
      journal.push({
        type: "attack_unopposed",
        systemId: toId,
        factionId: intent.factionId,
      });
      if (theater === "assault" || intent.payload?.claimOnWin) {
        sys.ownerFactionId = intent.factionId;
      }
      continue;
    }

    const eng = createEngagement({
      theater: theater === "assault" ? "assault" : "space",
      systemId: toId,
      planetId: intent.payload?.planetId || null,
      turn,
      source: "attack_intent",
      world,
      sideA: {
        factionId: intent.factionId,
        fleetIds: attackerFleets,
        legionIds: theater === "assault" ? attackerLegions : [],
        stance: intent.payload?.stance || "assault",
      },
      sideB: {
        factionId: defFaction,
        fleetIds: defendersFleets,
        legionIds: defendersLegions,
        stance: "hold",
      },
    });
    if (
      attackerFleets.length === 0 &&
      defendersFleets.length === 0 &&
      (attackerLegions.length || defendersLegions.length)
    ) {
      eng.theater = "ground";
      eng.phase = undefined;
      eng.defenseLayers = undefined;
      eng.sides[0].legionIds = attackerLegions;
      eng.sides[1].legionIds = defendersLegions;
    }
    list.push(eng);
    created.push(eng);
    applyCardBattleTriggers(world, eng);
    sys.activity = "battle";
    journal.push({
      type: "engagement_created",
      engagementId: eng.id,
      theater: eng.theater,
      systemId: toId,
      phase: eng.phase || null,
      attacker: intent.factionId,
      defender: defFaction,
      sides: [intent.factionId, defFaction],
      mode: eng.mode,
      cardBattleOffer: !!eng.cardBattleOffer,
    });
  }

  const bySys = new Map();
  for (const f of world.fleets ?? []) {
    if (!bySys.has(f.systemId)) bySys.set(f.systemId, []);
    bySys.get(f.systemId).push(f);
  }
  for (const [systemId, fleets] of bySys) {
    const facs = [...new Set(fleets.map((f) => f.factionId))];
    if (facs.length < 2) continue;
    for (let i = 0; i < facs.length; i++) {
      for (let j = i + 1; j < facs.length; j++) {
        const a = facs[i];
        const b = facs[j];
        if (!atWar(world, a, b)) continue;
        const already = list.some(
          (e) =>
            e.systemId === systemId &&
            isOpenEngagement(e) &&
            e.sides.some((s) => s.factionId === a) &&
            e.sides.some((s) => s.factionId === b),
        );
        if (already) continue;
        const eng = createEngagement({
          theater: "space",
          systemId,
          turn,
          source: "auto_contact",
          world,
          sideA: {
            factionId: a,
            fleetIds: fleets.filter((f) => f.factionId === a).map((f) => f.id),
            stance: "hold",
          },
          sideB: {
            factionId: b,
            fleetIds: fleets.filter((f) => f.factionId === b).map((f) => f.id),
            stance: "hold",
          },
        });
        list.push(eng);
        created.push(eng);
        applyCardBattleTriggers(world, eng);
        const sys = (world.systems ?? []).find((s) => s.id === systemId);
        if (sys) sys.activity = "battle";
        journal.push({
          type: "engagement_created",
          engagementId: eng.id,
          theater: "space",
          systemId,
          attacker: a,
          defender: b,
          source: "auto_contact",
          sides: [a, b],
          mode: eng.mode,
          cardBattleOffer: !!eng.cardBattleOffer,
        });
      }
    }
  }

  const legBySys = new Map();
  for (const l of world.legions ?? []) {
    if (!legBySys.has(l.systemId)) legBySys.set(l.systemId, []);
    legBySys.get(l.systemId).push(l);
  }
  for (const [systemId, legs] of legBySys) {
    const facs = [...new Set(legs.map((l) => l.factionId))];
    if (facs.length < 2) continue;
    for (let i = 0; i < facs.length; i++) {
      for (let j = i + 1; j < facs.length; j++) {
        const a = facs[i];
        const b = facs[j];
        if (!atWar(world, a, b)) continue;
        const already = list.some(
          (e) =>
            e.systemId === systemId &&
            e.theater === "ground" &&
            isOpenEngagement(e),
        );
        if (already) continue;
        const eng = createEngagement({
          theater: "ground",
          systemId,
          turn,
          source: "auto_contact",
          world,
          sideA: {
            factionId: a,
            legionIds: legs.filter((l) => l.factionId === a).map((l) => l.id),
            stance: "assault",
          },
          sideB: {
            factionId: b,
            legionIds: legs.filter((l) => l.factionId === b).map((l) => l.id),
            stance: "hold",
          },
        });
        list.push(eng);
        created.push(eng);
        applyCardBattleTriggers(world, eng);
        journal.push({
          type: "engagement_created",
          engagementId: eng.id,
          theater: "ground",
          systemId,
          attacker: a,
          defender: b,
          sides: [a, b],
          mode: eng.mode,
          cardBattleOffer: !!eng.cardBattleOffer,
        });
      }
    }
  }

  writeEngagements(list);
  return created;
}

export function setEngagementStance(engagementId, factionId, stance) {
  const content = getContent();
  if (!content.combat_stances?.[stance]) {
    return { ok: false, error: "unknown stance" };
  }
  const list = readEngagements();
  const eng = list.find((e) => e.id === engagementId);
  if (!eng || !isOpenEngagement(eng)) {
    return { ok: false, error: "engagement not open" };
  }
  const side = eng.sides.find((s) => s.factionId === factionId);
  if (!side) return { ok: false, error: "not a side" };
  side.stance = stance;
  side.locked = true;
  writeEngagements(list);
  return { ok: true, engagement: eng };
}

/**
 * Card battle request: mutual consent → mode=card (+ prepare if world given).
 */
export function requestCardBattle(engagementId, factionId, world = null) {
  const list = readEngagements();
  const eng = list.find((e) => e.id === engagementId);
  if (!eng || !isOpenEngagement(eng)) {
    return { ok: false, error: "engagement not open" };
  }
  if (!eng.sides.some((s) => s.factionId === factionId)) {
    return { ok: false, error: "not a side" };
  }
  const reqs = new Set(eng.cardBattleRequests || []);
  reqs.add(factionId);
  eng.cardBattleRequests = [...reqs];
  const sideIds = eng.sides.map((s) => s.factionId);
  const mutual = sideIds.every((id) => reqs.has(id));
  if (mutual) {
    eng.mode = "card";
    if (world && (!eng.cardBattle || eng.cardBattle.status !== "active")) {
      prepareCardBattle(eng, world, getContent());
    }
  }
  writeEngagements(list);
  return {
    ok: true,
    engagement: eng,
    mode: eng.mode,
    mutual,
  };
}

export function forceCardBattle(engagementId, world = null) {
  const list = readEngagements();
  const eng = list.find((e) => e.id === engagementId);
  if (!eng || !isOpenEngagement(eng)) {
    return { ok: false, error: "engagement not open" };
  }
  eng.gmForceCard = true;
  eng.mode = "card";
  if (world && (!eng.cardBattle || eng.cardBattle.status !== "active")) {
    prepareCardBattle(eng, world, getContent());
  }
  writeEngagements(list);
  return { ok: true, engagement: eng };
}

function finishCardEngagement(world, eng, journal) {
  const fin = finalizeCardBattle(eng.cardBattle, world);
  const sideA = eng.sides[0];
  const sideB = eng.sides[1];
  let outcome = "draw";
  if (fin.winnerFactionId === sideA?.factionId) outcome = "win_a";
  else if (fin.winnerFactionId === sideB?.factionId) outcome = "win_b";

  const fight = {
    ok: true,
    outcome,
    powerA: 0,
    powerB: 0,
    lossesA: [],
    lossesB: [],
    mode: "card",
    winnerFactionId: fin.winnerFactionId,
  };
  finalizeEngagement(world, eng, fight, journal);
  journal.push({
    type: "card_battle_resolved",
    engagementId: eng.id,
    outcome,
    winnerFactionId: fin.winnerFactionId,
  });
}

/**
 * Apply triggers after engagement creation (power corridor offer / gm force).
 */
export function applyCardBattleTriggers(world, eng, opts = {}) {
  const content = getContent();
  const triggers = content.rules?.cardBattle?.triggers || {};

  if (opts.gmForce || eng.gmForceCard) {
    if (triggers.gmForce !== false) {
      eng.mode = "card";
      return { mode: "card", reason: "gm_force" };
    }
  }

  const requests = new Set(eng.cardBattleRequests || []);
  const sideIds = (eng.sides || []).map((s) => s.factionId);
  const mutual =
    triggers.mutualConsent !== false &&
    sideIds.length >= 2 &&
    sideIds.every((id) => requests.has(id));

  if (mutual) {
    eng.mode = "card";
    return { mode: "card", reason: "mutual_consent" };
  }

  if (shouldOfferCardBattle(world, eng, content)) {
    eng.cardBattleOffer = true;
    return { mode: eng.mode || "auto", reason: "power_corridor_offer" };
  }

  eng.mode = eng.mode || "auto";
  return { mode: eng.mode, reason: "auto" };
}

export function playEngagementCard(engagementId, factionId, cardId, world) {
  const content = getContent();
  const list = readEngagements();
  const eng = list.find((e) => e.id === engagementId);
  if (!eng) return { ok: false, error: "engagement missing" };
  if (eng.mode !== "card") return { ok: false, error: "not card mode" };

  if (!eng.cardBattle || eng.cardBattle.status !== "active") {
    const prep = prepareCardBattle(eng, world, content);
    if (!prep.ok) return prep;
  }

  if (!eng.sides.some((s) => s.factionId === factionId)) {
    return { ok: false, error: "not a side" };
  }

  const result = playCardRound(eng.cardBattle, factionId, cardId, content);
  if (!result.ok) return result;

  eng.cardBattle = result.state;
  const journal = [];
  if (result.state.status === "resolved") {
    finishCardEngagement(world, eng, journal);
  }
  writeEngagements(list);
  return {
    ok: true,
    engagement: eng,
    journal,
    pairResult: result.pairResult,
  };
}

export function passEngagementCard(engagementId, factionId, world) {
  const content = getContent();
  const list = readEngagements();
  const eng = list.find((e) => e.id === engagementId);
  if (!eng) return { ok: false, error: "engagement missing" };
  if (eng.mode !== "card" || !eng.cardBattle) {
    return { ok: false, error: "no card battle" };
  }
  const result = passCardRound(eng.cardBattle, factionId, content);
  if (!result.ok) return result;
  eng.cardBattle = result.state;
  const journal = [];
  if (result.state.status === "resolved") {
    finishCardEngagement(world, eng, journal);
  }
  writeEngagements(list);
  return { ok: true, engagement: eng, journal };
}

export function drawEngagementCard(engagementId, factionId, world) {
  const content = getContent();
  const list = readEngagements();
  const eng = list.find((e) => e.id === engagementId);
  if (!eng) return { ok: false, error: "engagement missing" };
  if (eng.mode !== "card") return { ok: false, error: "not card mode" };
  if (!eng.cardBattle || eng.cardBattle.status !== "active") {
    const prep = prepareCardBattle(eng, world, content);
    if (!prep.ok) return prep;
  }
  if (!eng.sides.some((s) => s.factionId === factionId)) {
    return { ok: false, error: "not a side" };
  }
  const result = drawFromDeck(eng.cardBattle, factionId, content);
  if (!result.ok) return result;
  eng.cardBattle = result.state;
  writeEngagements(list);
  return { ok: true, engagement: eng, drawn: result.drawn };
}
