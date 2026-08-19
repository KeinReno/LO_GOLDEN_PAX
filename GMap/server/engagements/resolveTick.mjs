/**
 * Engagement round/phase resolution: retreat handling, aftermath (ownership/
 * population/refugee effects), assault-phase advance, and the three public
 * entry points (resolveOpenEngagements / advanceEngagement /
 * instantResolveEngagementIds). Also finishCardEngagement — lives here (not
 * cardActions.mjs) because it calls finalizeEngagement and both directions
 * would otherwise create an import cycle between this file and cardActions.mjs.
 * Extracted from ../engagements.mjs.
 */
import {
  resolveEngagementFight,
  resolveAssaultPhase,
  cleanupEmptyComposition,
} from "../combatResolve.mjs";
import { prepareCardBattle, finalizeCardBattle, applyCardBattleTrophies } from "../cardBattle.mjs";
import { getContent } from "../contentLoader.mjs";
import { spawnRefugees } from "../narrative.mjs";
import {
  isOpenEngagement,
  readEngagements,
  writeEngagements,
  engagementRules,
} from "./store.mjs";
import {
  shouldAbandonEngagement,
  abandonReason,
} from "./abandon.mjs";

/** Retreat to previous system when known — never use route[0] (forward hop). */
function retreatUnit(world, unit, fromSystemId, idleField, idleValue) {
  const back =
    unit.pendingArrival?.fromSystemId ||
    unit.lastSystemId ||
    unit.previousSystemId ||
    unit.fromSystemId ||
    null;
  if (back && back !== fromSystemId) {
    unit.lastSystemId = fromSystemId;
    unit.systemId = back;
    unit.route = [];
    delete unit.pendingArrival;
    unit[idleField] = idleValue;
    return;
  }
  const forward = (unit.route || [])[0];
  const neighbors = (world.links ?? [])
    .filter((l) => l.fromId === fromSystemId || l.toId === fromSystemId)
    .map((l) => (l.fromId === fromSystemId ? l.toId : l.fromId));
  // Prefer any neighbor that is not the next forward hop.
  const dest =
    neighbors.find((id) => id !== forward && id !== unit.pendingArrival?.systemId) ||
    neighbors.find((id) => id !== forward) ||
    neighbors[0];
  if (dest) {
    unit.lastSystemId = fromSystemId;
    unit.systemId = dest;
    unit.route = [];
    delete unit.pendingArrival;
    unit[idleField] = idleValue;
  } else {
    unit.route = [];
    delete unit.pendingArrival;
    unit[idleField] = idleValue;
  }
}

function retreatFleet(world, fleetId, fromSystemId) {
  const fleet = (world.fleets ?? []).find((f) => f.id === fleetId);
  if (!fleet) return;
  retreatUnit(world, fleet, fromSystemId, "stance", "idle");
}

function retreatLegion(world, legionId, fromSystemId) {
  const legion = (world.legions ?? []).find((l) => l.id === legionId);
  if (!legion) return;
  retreatUnit(world, legion, fromSystemId, "status", "idle");
}

function applyOccupationEffects(world, eng, journal) {
  const sys = (world.systems ?? []).find((s) => s.id === eng.systemId);
  if (!sys) return;
  const a = eng.sides[0];
  if (!a) return;
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
  if (!a || !b) return;

  if (fight.outcome === "retreat_a" || fight.retreated === a.factionId) {
    for (const fid of a.fleetIds || []) retreatFleet(world, fid, eng.systemId);
    for (const lid of a.legionIds || []) retreatLegion(world, lid, eng.systemId);
  }
  if (fight.outcome === "retreat_b" || fight.retreated === b.factionId) {
    for (const fid of b.fleetIds || []) retreatFleet(world, fid, eng.systemId);
    for (const lid of b.legionIds || []) retreatLegion(world, lid, eng.systemId);
  }

  if (
    (eng.theater === "assault" || eng.theater === "ground" || fight.phase === "occupation") &&
    fight.outcome === "win_a" &&
    sys
  ) {
    const prev = sys.ownerFactionId;
    if (prev && prev !== a.factionId) {
      sys.contested = true;
      sys.coOwnerFactionIds = Array.from(
        new Set([...(sys.coOwnerFactionIds || []), a.factionId, prev].filter(Boolean)),
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

export function finalizeEngagement(world, eng, fight, journal) {
  eng.status = "resolved";
  eng.result = fight;
  applyAftermath(world, eng, fight, journal);
}

export function finishCardEngagement(world, eng, journal) {
  const fin = finalizeCardBattle(eng.cardBattle, world);
  const trophies = applyCardBattleTrophies(world, eng, fin);
  const sideA = eng.sides[0];
  const sideB = eng.sides[1];
  let outcome = "draw";
  if (fin.winnerFactionId === sideA?.factionId) outcome = "win_a";
  else if (fin.winnerFactionId === sideB?.factionId) outcome = "win_b";

  const lossesA = fin.lossesByFaction?.[sideA?.factionId] || [];
  const lossesB = fin.lossesByFaction?.[sideB?.factionId] || [];

  const fight = {
    ok: true,
    outcome,
    powerA: 0,
    powerB: 0,
    lossesA,
    lossesB,
    mode: "card",
    winnerFactionId: fin.winnerFactionId,
    retreated: fin.retreatedFactionId || null,
    trophies: trophies.trophies,
  };
  finalizeEngagement(world, eng, fight, journal);
  if (eng.result) {
    eng.result.trophies = trophies.trophies;
    eng.result.lossesByFaction = fin.lossesByFaction;
  }
  journal.push({
    type: "card_battle_resolved",
    engagementId: eng.id,
    outcome,
    winnerFactionId: fin.winnerFactionId,
    trophies: trophies.trophies,
  });
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

    if (shouldAbandonEngagement(world, eng)) {
      const reason = abandonReason(world, eng);
      eng.status = "cancelled";
      eng.result = { ok: false, error: reason };
      journal.push({
        type: "engagement_cancelled",
        engagementId: eng.id,
        reason,
        systemId: eng.systemId,
        sides: (eng.sides || []).map((s) => s.factionId),
      });
      resolved += 1;
      continue;
    }

    if (needsInput && !locked && !timedOut) {
      journal.push({
        type: "engagement_awaiting_stance",
        engagementId: eng.id,
        theater: eng.theater,
        systemId: eng.systemId,
        phase: eng.phase || null,
        roundsElapsed: eng.roundsElapsed,
        maxRounds,
        message: `Бой в системе ${eng.systemId}, зафиксируйте стойку`,
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
      } else if (timedOut) {
        eng.mode = "auto";
        journal.push({
          type: "engagement_card_timeout",
          engagementId: eng.id,
          systemId: eng.systemId,
          reason: "max_rounds",
          round: eng.cardBattle.round,
          sides: eng.sides.map((s) => s.factionId),
        });
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

/** Force-resolve engagements created by same-system contact (no stance wait). */
export function instantResolveEngagementIds(world, engagementIds, journal) {
  const list = readEngagements();
  for (const id of engagementIds) {
    const eng = list.find((e) => e.id === id);
    if (!eng || !isOpenEngagement(eng)) continue;
    eng.requiresPlayerInput = false;
    eng.maxRounds = 1;
    eng.roundsElapsed = 0;
    autoLockSides(eng);
  }
  writeEngagements(list);
  for (const id of engagementIds) {
    advanceEngagement(id, world, journal, { force: true, fullResolve: true });
  }
}
