/**
 * Rebel spawn / engagement / secession state machine (Stage 2 → Stage 3).
 * Kept as one file — every function here is tightly coupled through shared
 * planet.revolt state, and this file had a real "helper called but never
 * defined" bug fixed earlier today (standDown); splitting further raises
 * the same risk for modest line-count benefit.
 * Extracted from ../stabilityRevolt.mjs.
 */
import { syntheticCrewGroup } from "../boarding.mjs";
import { resolveEngagementFight } from "../combatResolve.mjs";
import { readLedger, writeLedger, ensureFactionEco } from "../ledger.mjs";
import {
  stabilityCfg,
  isRebelFactionId,
  isRebelForce,
  rebelForcesInSystem,
  tickPlanetStability,
  tickAllPlanetStability,
  revoltStage,
  rebelCount,
  rebelFactionId,
  rebelFactionName,
  rebelColorHex,
  majorityRaceId,
  planetStabilityValue,
} from "./meter.mjs";

const MILITIA_ID = "unit.militia";

/**
 * Spend `rebelCount` population and build a militia legion (boarding crew pattern).
 * Returns null if there is no population to lose.
 */
export function spawnRebelForce(planet, content, opts = {}) {
  const pop = Math.max(0, Number(planet?.population) || 0);
  if (pop <= 0) return null;
  const militia = content?.units?.[MILITIA_ID];
  if (!militia) return null;
  const stability = opts.stability ?? opts.meter ?? planetStabilityValue(planet, content);
  const lostPop = Math.min(pop, rebelCount(planet, stability, content));
  if (opts.spendPop !== false) planet.population = pop - lostPop;
  const group = syntheticCrewGroup(lostPop, militia);
  const turn = opts.turn ?? 0;
  const systemId = opts.systemId ?? planet?.systemId ?? null;
  const factionId = opts.factionId || rebelFactionId(planet?.id, turn);
  return {
    id: opts.id || `legion_rebel_${systemId || planet?.id}_${turn}`,
    kind: "legion",
    name: `Мятеж · ${planet?.name || planet?.id || "planet"}`,
    homePlanetId: planet?.id ?? null,
    systemId,
    composition: [group],
    factionId,
    count: lostPop,
    lostPop,
    raceId: majorityRaceId(planet, opts.raceId),
    stance: "retreat",
    status: "idle",
    route: [],
  };
}

export function ownerLegionAtPlanet(world, factionId, systemOrPlanet, planetMaybe) {
  const planet = planetMaybe || systemOrPlanet;
  const systemId = planetMaybe ? systemOrPlanet?.id : planet?.systemId;
  const planetId = planet?.id;
  const candidates = (world.legions || []).filter(
    (f) =>
      f.factionId === factionId &&
      !isRebelForce(f) &&
      (f.systemId === systemId || f.homePlanetId === planetId),
  );
  if (!candidates.length) return null;
  const size = (f) => (f.composition || []).reduce((s, g) => s + (Number(g.count) || 0), 0);
  return candidates.reduce((best, f) => (size(f) > size(best) ? f : best));
}

/** Contingent fight: rebels retreat when outmatched (<80% power). */
export function resolveRebelEngagement(world, garrisonForce, rebelForce) {
  if (!garrisonForce || !rebelForce) return { ok: false, error: "missing_force" };
  const fightWorld = {
    ...world,
    legions: [
      ...(world.legions || []).filter(
        (l) => l.id !== garrisonForce.id && l.id !== rebelForce.id,
      ),
      garrisonForce,
      rebelForce,
    ],
    fleets: world.fleets || [],
    systems: world.systems || [],
    factions: world.factions || [],
  };
  return resolveEngagementFight(fightWorld, {
    theater: "ground",
    systemId: rebelForce.systemId || garrisonForce.systemId,
    sides: [
      {
        factionId: garrisonForce.factionId,
        fleetIds: [],
        legionIds: [garrisonForce.id],
        stance: "hold",
      },
      {
        factionId: rebelForce.factionId,
        fleetIds: [],
        legionIds: [rebelForce.id],
        stance: "retreat",
      },
    ],
  });
}

export function shouldSecede(revolt, turn, content) {
  if (!revolt) return false;
  const cfg = stabilityCfg(content);
  return Number(turn) >= Number(revolt.stage2SinceTurn) + cfg.stage3DurationTurns;
}

export function resolveSecession(faction, planet, rebelForce, turn, content) {
  void content;
  const spawnTurn = rebelForce?.spawnTurn ?? turn;
  const id = rebelForce?.factionId || rebelFactionId(planet?.id, spawnTurn);
  return {
    newFaction: {
      id,
      name: rebelFactionName(planet),
      raceId: majorityRaceId(planet, faction?.primaryRaceId || faction?.raceId),
      primaryRaceId: majorityRaceId(planet, faction?.primaryRaceId || faction?.raceId),
      colorHex: rebelColorHex(planet?.id),
      color: rebelColorHex(planet?.id),
      kind: "npc",
      isNpc: true,
      playerId: null,
      capitalSystemId: planet?.systemId ?? null,
      traits: [],
      activeEffects: [],
      diplomacy: { opinions: {}, treaties: [], history: [] },
      npcs: [],
    },
    planetId: planet?.id,
    systemId: planet?.systemId,
    sourceFactionId: faction?.id,
    rebelForceId: rebelForce?.id ?? null,
    population: Number(planet?.population) || 0,
  };
}

function ensureRebelFaction(world, factionPayload) {
  if (!Array.isArray(world.factions)) world.factions = [];
  if (world.factions.some((f) => f.id === factionPayload.id)) return;
  world.factions.push(factionPayload);
  try {
    const ledger = readLedger();
    ensureFactionEco(ledger, factionPayload.id);
    writeLedger(ledger);
  } catch {
    /* tests / boot without a ledger file */
  }
}

function removeForce(world, forceId) {
  if (!forceId || !Array.isArray(world.legions)) return;
  world.legions = world.legions.filter((l) => l.id !== forceId);
}

function pruneEmptyRebelFaction(world, factionId) {
  if (!isRebelFactionId(factionId) || factionId === "faction_rebels") return;
  const owns = (world.systems || []).some(
    (s) =>
      s.ownerFactionId === factionId ||
      (s.planets || []).some((p) => p.ownerFactionId === factionId),
  );
  const hasForce =
    (world.legions || []).some((l) => l.factionId === factionId) ||
    (world.fleets || []).some((f) => f.factionId === factionId);
  if (owns || hasForce) return;
  world.factions = (world.factions || []).filter((f) => f.id !== factionId);
}

function revoltState(planet) {
  if (planet?.revolt) return planet.revolt;
  if (planet?.revoltStage2SinceTurn != null || planet?.rebelForceId) {
    return {
      stage2SinceTurn: planet.revoltStage2SinceTurn,
      rebelLegionId: planet.rebelForceId,
      rebelFactionId: null,
    };
  }
  return null;
}

function clearRevoltFields(planet) {
  planet.revolt = null;
  planet.revoltStage2SinceTurn = null;
  planet.rebelForceId = null;
  planet.contested = false;
}

/** Suppress/recover: drop the (defeated) rebel legion and an emptied rebel faction. */
function standDown(world, planet) {
  const revolt = revoltState(planet);
  const legionId = revolt?.rebelLegionId ?? null;
  const rebelFactionId = revolt?.rebelFactionId ?? null;
  clearRevoltFields(planet);
  if (legionId) removeForce(world, legionId);
  if (rebelFactionId) pruneEmptyRebelFaction(world, rebelFactionId);
}

function livingRebel(world, revolt) {
  if (!revolt?.rebelLegionId) return null;
  return (world.legions || []).find((l) => l.id === revolt.rebelLegionId) || null;
}

function applySecession(world, system, planet, force, turn, content) {
  const ownerId = planet.ownerFactionId || system.ownerFactionId;
  const faction = (world.factions ?? []).find((f) => f.id === ownerId) || { id: ownerId };
  const plan = resolveSecession(
    faction,
    { ...planet, systemId: system.id },
    { ...force, spawnTurn: planet.revolt?.stage2SinceTurn ?? turn },
    turn,
    content,
  );
  ensureRebelFaction(world, plan.newFaction);
  planet.ownerFactionId = plan.newFaction.id;
  clearRevoltFields(planet);
  if (force) force.factionId = plan.newFaction.id;
  const stillOwned = (system.planets || []).some(
    (p) => p.id !== planet.id && (p.ownerFactionId || system.ownerFactionId) === ownerId,
  );
  if (!stillOwned && system.ownerFactionId === ownerId) {
    system.ownerFactionId = plan.newFaction.id;
  }
  system.revoltContested = false;
  system.revoltUntilTurn = null;
  return plan;
}

function spawnAndMaybeEngage(world, system, planet, turn, content) {
  const ownerId = planet.ownerFactionId || system.ownerFactionId;
  const spawned = spawnRebelForce(planet, content, {
    stability: planet.stability,
    turn,
    systemId: system.id,
  });
  if (!spawned) return { event: null };
  const force = {
    id: `legion_rebel_${system.id}_${planet.id}_${turn}`,
    name: spawned.name,
    factionId: spawned.factionId,
    systemId: system.id,
    homePlanetId: planet.id,
    strength: spawned.count,
    status: "idle",
    kind: "legion",
    raceId: spawned.raceId,
    composition: spawned.composition,
    stance: "retreat",
    route: [],
  };
  if (!Array.isArray(world.legions)) world.legions = [];
  world.legions.push(force);
  ensureRebelFaction(world, {
    ...resolveSecession(
      { id: ownerId },
      { ...planet, systemId: system.id },
      force,
      turn,
      content,
    ).newFaction,
    capitalSystemId: null,
  });
  planet.revolt = {
    stage2SinceTurn: turn,
    rebelLegionId: force.id,
    rebelFactionId: spawned.factionId,
    lostPop: spawned.lostPop,
  };
  planet.revoltStage2SinceTurn = turn;
  planet.rebelForceId = force.id;
  planet.contested = true;
  system.revoltContested = true;
  system.revoltUntilTurn = turn + stabilityCfg(content).stage3DurationTurns;

  const garrison = ownerLegionAtPlanet(
    { ...world, legions: world.legions.filter((l) => l.id !== force.id) },
    ownerId,
    { ...planet, systemId: system.id },
  );
  let engagement = null;
  if (garrison) {
    const result = resolveRebelEngagement(world, garrison, force);
    engagement = { outcome: result.outcome, ok: result.ok };
    const rebelsAlive = (force.composition || []).some((g) => (Number(g.count) || 0) > 0);
    if (result.ok && !rebelsAlive) {
      standDown(world, planet);
      return {
        event: {
          type: "revolt_suppressed",
          systemId: system.id,
          planetId: planet.id,
          factionId: ownerId,
          lostPop: spawned.lostPop,
          engagement: result.outcome,
        },
      };
    }
  }
  return {
    event: {
      type: "revolt",
      systemId: system.id,
      planetId: planet.id,
      factionId: ownerId,
      lostPop: spawned.lostPop,
      rebelLegionId: force.id,
      rebelFactionId: spawned.factionId,
      revoltUntilTurn: system.revoltUntilTurn,
      engagement: engagement?.outcome ?? null,
    },
  };
}

/**
 * Per-planet stage machine. Mutates world. One event or null.
 */
export function applyPlanetRevolt(world, system, planet, content) {
  const ownerId = planet.ownerFactionId || system.ownerFactionId;
  if (!ownerId || isRebelFactionId(ownerId)) return null;
  const existing = revoltState(planet);
  if ((planet.population ?? 0) <= 0 && !existing) return null;
  tickPlanetStability(world, system, planet, content);
  const revolt = revoltState(planet);

  const turn = world.meta?.turn ?? 0;
  const band = revoltStage(planet, content);
  if (band < 2) {
    if (!revolt) return null;
    standDown(world, planet);
    return {
      type: "revolt_stand_down",
      systemId: system.id,
      planetId: planet.id,
      factionId: ownerId,
      stage: band,
    };
  }

  if (revolt) {
    const force = livingRebel(world, revolt);
    if (!force) {
      clearRevoltFields(planet);
      return {
        type: "revolt_suppressed",
        systemId: system.id,
        planetId: planet.id,
        factionId: ownerId,
        reason: "rebels_gone",
      };
    }
    if (shouldSecede(revolt, turn, content)) {
      const plan = applySecession(world, system, planet, force, turn, content);
      return {
        type: "secession",
        systemId: system.id,
        planetId: planet.id,
        factionId: ownerId,
        newFactionId: plan.newFaction.id,
      };
    }
    return {
      type: "revolt_ongoing",
      systemId: system.id,
      planetId: planet.id,
      factionId: ownerId,
      rebelLegionId: force.id,
      stage2SinceTurn: revolt.stage2SinceTurn,
    };
  }

  if (rebelForcesInSystem(world, system.id).length > 0) {
    return {
      type: "revolt_suppressed",
      systemId: system.id,
      planetId: planet.id,
      factionId: ownerId,
      reason: "rebels_present",
    };
  }

  const spawned = spawnAndMaybeEngage(world, system, planet, turn, content);
  return spawned.event || null;
}

export function applyAllRevolts(world, content) {
  return applyStabilityRevolt(world, content).journal;
}

/**
 * Stage 2 spawn / stand-down / Stage 3 secession. Call after loyaltyTick.
 * Stage 1 is collectRevoltProductionEffects (economyTick).
 */
export function applyStabilityRevolt(world, content) {
  const journal = [];
  tickAllPlanetStability(world, content);
  for (const sys of world.systems ?? []) {
    for (const planet of sys.planets ?? []) {
      const ev = applyPlanetRevolt(world, sys, planet, content);
      if (ev) journal.push(ev);
    }
  }
  return { journal };
}
