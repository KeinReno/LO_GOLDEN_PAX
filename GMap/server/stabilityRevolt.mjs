/**
 * 3-stage stability revolt (v0.5 STABILITY_AND_REVOLT_SPEC), GMap-shaped.
 *
 * Planet `stability` is the revolt meter (occupation already writes it).
 * Loyalty stays independent (still receives stability_add 1:1) and does not
 * spawn rebels. loyalty < 20 drains this meter. Rebels are militia from
 * spent population (GMap override: not thin air).
 */
import { syntheticCrewGroup } from "./boarding.mjs";
import { resolveEngagementFight } from "./combatResolve.mjs";
import { readLedger, writeLedger, ensureFactionEco } from "./ledger.mjs";
import { stabilityLoyaltyDelta } from "./stability.mjs";

const MILITIA_ID = "unit.militia";

export const STABILITY_START = 50;
export const STABILITY_MIN = 0;
export const STABILITY_MAX = 100;
export const STABILITY_NATURAL_DECAY = -1;
export const STABILITY_STAGE1_THRESHOLD = 40;
export const STABILITY_STAGE2_THRESHOLD = 25;
export const STABILITY_STAGE3_DURATION_TURNS = 3;
export const STABILITY_STAGE1_PROD_MULT = 0.85;
export const STABILITY_STAGE2_PROD_MULT = 0.75;
export const STABILITY_REBEL_POP_SHARE = 0.2;
/** Extra per-turn stability delta while planet.loyalty < this. Signed (negative). */
export const LOYALTY_COLLAPSE_THRESHOLD = 20;
export const LOYALTY_COLLAPSE_DRAIN = -2;

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function stabilityCfg(content) {
  const c = content?.economy_balance?.stability || {};
  return {
    startingValue: num(c.startingValue, STABILITY_START),
    min: num(c.min, STABILITY_MIN),
    max: num(c.max, STABILITY_MAX),
    naturalDecay: num(c.naturalDecay, STABILITY_NATURAL_DECAY),
    stage1Threshold: num(c.stage1Threshold, STABILITY_STAGE1_THRESHOLD),
    stage2Threshold: num(c.stage2Threshold, STABILITY_STAGE2_THRESHOLD),
    stage3DurationTurns: num(c.stage3DurationTurns, STABILITY_STAGE3_DURATION_TURNS),
    stage1ProductionMult: num(c.stage1ProductionMult, STABILITY_STAGE1_PROD_MULT),
    stage2ProductionMult: num(c.stage2ProductionMult, STABILITY_STAGE2_PROD_MULT),
    rebelPopShare: num(c.rebelPopShare, STABILITY_REBEL_POP_SHARE),
    loyaltyCollapseThreshold: num(
      c.loyaltyCollapseThreshold,
      LOYALTY_COLLAPSE_THRESHOLD,
    ),
    loyaltyCollapseDrain: num(c.loyaltyCollapseDrain, LOYALTY_COLLAPSE_DRAIN),
  };
}

export function clampStability(value, content) {
  const cfg = stabilityCfg(content);
  const n = Number(value);
  const v = Number.isFinite(n) ? n : cfg.startingValue;
  return Math.min(cfg.max, Math.max(cfg.min, v));
}

/** Occupation field if set; else startingValue. Loyalty is not this meter. */
export function planetStabilityValue(planet, content) {
  const cfg = stabilityCfg(content);
  if (typeof planet?.stability === "number" && Number.isFinite(planet.stability)) {
    return clampStability(planet.stability, content);
  }
  return cfg.startingValue;
}

/** 0 = stable, 1 = production debuff, 2 = rebel band. Stage 3 is duration. */
export function stabilityBand(value, content) {
  const cfg = stabilityCfg(content);
  const v = Number(value);
  if (v < cfg.stage2Threshold) return 2;
  if (v < cfg.stage1Threshold) return 1;
  return 0;
}

export function revoltStage(planet, content) {
  return stabilityBand(planetStabilityValue(planet, content), content);
}

export function isRebelFactionId(id) {
  const s = String(id || "");
  return s === "faction_rebels" || s.startsWith("faction_rebel") || s.startsWith("rebel.");
}

export function isRebelForce(force) {
  if (!force) return false;
  return (
    isRebelFactionId(force.factionId) ||
    String(force.id || "").startsWith("legion_rebel_")
  );
}

export const isRebelLegion = isRebelForce;

export function rebelForcesInSystem(world, systemId) {
  return (world.legions || []).filter(
    (l) => l.systemId === systemId && isRebelForce(l),
  );
}

/**
 * Per-turn meter: naturalDecay + stacked stability_add (same sources as loyalty).
 * Idempotent on `planet.stabilityTickTurn === world.meta.turn`.
 */
export function tickPlanetStability(world, system, planet, content) {
  const cfg = stabilityCfg(content);
  const turn = world?.meta?.turn ?? 0;
  if (
    planet.stabilityTickTurn === turn &&
    typeof planet.stability === "number"
  ) {
    planet.revoltStage = stabilityBand(planet.stability, content);
    return { value: planet.stability, delta: 0, stage: planet.revoltStage, skipped: true };
  }
  const current = planetStabilityValue(planet, content);
  const add = stabilityLoyaltyDelta(world, system, planet, content);
  const loyalty = Number(planet.loyalty);
  const collapse =
    Number.isFinite(loyalty) && loyalty < cfg.loyaltyCollapseThreshold
      ? cfg.loyaltyCollapseDrain
      : 0;
  const delta = cfg.naturalDecay + add + collapse;
  planet.stability = clampStability(current + delta, content);
  planet.stabilityTickTurn = turn;
  planet.revoltStage = stabilityBand(planet.stability, content);
  return { value: planet.stability, delta, stage: planet.revoltStage, skipped: false };
}

export function tickAllPlanetStability(world, content) {
  for (const sys of world.systems ?? []) {
    for (const planet of sys.planets ?? []) {
      const ownerId = planet.ownerFactionId || sys.ownerFactionId;
      if (!ownerId || isRebelFactionId(ownerId)) continue;
      if ((planet.population ?? 0) <= 0 && !planet.revolt) continue;
      tickPlanetStability(world, sys, planet, content);
    }
  }
}

/** Pass-4 production:* multiplier. Stage 2 replaces Stage 1. */
export function revoltProductionEffects(value, content) {
  const cfg = stabilityCfg(content);
  const band = stabilityBand(value, content);
  if (band <= 0) return [];
  const mult = band >= 2 ? cfg.stage2ProductionMult : cfg.stage1ProductionMult;
  return [
    {
      effect: "production_mult",
      args: { mult },
      source: {
        kind: "revolt",
        id: `stability.stage${band}`,
        label: `stability stage ${band}`,
      },
      scope: "faction",
    },
  ];
}

/**
 * Average stage mults of planets actually in stage ≥1 (loyalty-tier pattern:
 * only planets emitting the effect contribute). One hotspot → faction-wide
 * 0.85 / 0.75, matching v0.5's faction accumulator.
 */
export function collectRevoltProductionEffects(world, factionId, content) {
  const prodMults = [];
  for (const sys of world.systems ?? []) {
    if (sys.ownerFactionId !== factionId) continue;
    for (const planet of sys.planets ?? []) {
      if ((planet.population ?? 0) <= 0) continue;
      if (planet.ownerFactionId && planet.ownerFactionId !== factionId) continue;
      const fx = revoltProductionEffects(planetStabilityValue(planet, content), content);
      for (const e of fx) {
        if (e.effect === "production_mult") prodMults.push(Number(e.args?.mult ?? 1));
      }
    }
  }
  if (prodMults.length === 0) return [];
  const cfg = stabilityCfg(content);
  const avg = prodMults.reduce((a, b) => a + b, 0) / prodMults.length;
  const band = avg <= cfg.stage2ProductionMult + 1e-9 ? 2 : 1;
  return [
    {
      effect: "production_mult",
      args: { mult: avg },
      source: {
        kind: "revolt",
        id: `faction_avg:${factionId}`,
        label: `stability stage ${band}`,
      },
    },
  ];
}

export function rebelCount(planet, stability, content) {
  const cfg = stabilityCfg(content);
  const pop = Math.max(0, Number(planet?.population) || 0);
  if (pop <= 0) return 0;
  const deficit = Math.max(0, cfg.stage2Threshold - Number(stability));
  const raw = Math.floor(
    pop * cfg.rebelPopShare * (deficit / Math.max(1, cfg.stage2Threshold)),
  );
  return Math.min(pop, Math.max(1, raw));
}

export function rebelFactionId(planetId, turn) {
  return `rebel.${planetId}.${turn}`;
}

export function rebelFactionName(planet) {
  const name = planet?.name || planet?.id || "unknown";
  return `Breakaway of ${name}`;
}

export function rebelColorHex(planetId) {
  let h = 0;
  for (const ch of String(planetId || "")) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  const n = Math.abs(h) || 1;
  const r = 96 + (n % 96);
  const g = 48 + ((n >> 5) % 80);
  const b = 48 + ((n >> 11) % 80);
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export function majorityRaceId(planet, fallback) {
  const comp = Array.isArray(planet?.raceComposition) ? planet.raceComposition : [];
  let best = null;
  let bestPct = -1;
  for (const row of comp) {
    const pct = Number(row?.percent ?? row?.count ?? 0);
    if (row?.raceId && pct > bestPct) {
      best = row.raceId;
      bestPct = pct;
    }
  }
  return best || fallback || "race_human";
}

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
