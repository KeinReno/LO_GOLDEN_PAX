/**
 * Population loyalty tick (A3).
 * Planet loyalty = affinity (matrix/races/gov) + situational (tax/battle/logistics)
 * + stacked `stability_add` (stability.mjs). Occupation `planet.stability` is
 * ignored here — that meter is the 3-stage revolt machine (stabilityRevolt.mjs).
 * loyalty < 20 does not spawn rebels.
 * Matrix drifts toward affinity only — situational shocks must not permanently poison it.
 */
import {
  buildModifierStack,
  collectRaceEffects,
  resolvePlanetRaceComposition,
} from "./modifierStack.mjs";
import { readLedger, ensureFactionEco } from "./ledger.mjs";
import { npcLoyaltyDeltaForSystem } from "./courtGovernance.mjs";
import { stabilityLoyaltyDelta } from "./stability.mjs";
import {
  isRebelFactionId,
  isRebelLegion,
} from "./stabilityRevolt.mjs";

const BASE_LOYALTY = 50;
const LOYALTY_MIN = 0;
const LOYALTY_MAX = 100;
/** Soft recovery floor when taxes/battle/logistics are calm. */
const CALM_RECOVERY_FLOOR = 40;
const CALM_RECOVERY_STEP = 2;
/** Tax pressure → loyalty (was 0.8; that + matrix feedback wiped empires). */
const PRESSURE_LOYALTY_COEFF = 0.25;
const MILITARIST_PRESSURE_BONUS = 0.5;
/** Hard cap so high taxes cannot solo-zero a healthy world. */
const PRESSURE_LOYALTY_HIT_CAP = 10;
/** Matrix cells below this heal faster toward BASE (guards poisoned saves). */
const MATRIX_SOFT_FLOOR = 35;
const MATRIX_HEAL_RATE = 0.35;
const MATRIX_DRIFT_RATE = 0.05;
/** Turns revolt-sourced unrest stays after spawn (clears earlier if rebels gone). */
const REVOLT_CONTESTED_TURNS = 3;

function clampLoyalty(n) {
  return Math.max(LOYALTY_MIN, Math.min(LOYALTY_MAX, Number(n) || 0));
}

function ensureLoyaltyMatrix(world) {
  if (!world.loyaltyMatrix || typeof world.loyaltyMatrix !== "object") {
    world.loyaltyMatrix = {};
  }
  return world.loyaltyMatrix;
}

function matrixValue(matrix, raceId, factionId) {
  const row = matrix[raceId];
  if (!row || typeof row[factionId] !== "number") return BASE_LOYALTY;
  return row[factionId];
}

function setMatrixValue(matrix, raceId, factionId, value) {
  if (!matrix[raceId]) matrix[raceId] = {};
  matrix[raceId][factionId] = clampLoyalty(value);
}

function raceHasTrait(race, traitSuffix) {
  return (race?.traits || []).some((t) =>
    String(t.id || "").includes(traitSuffix),
  );
}

function systemHasPropaganda(system) {
  const tags = [
    ...(system.spaceObjects || []).map((o) =>
      typeof o === "string" ? o : o.kind || o.tag || o.id || o,
    ),
    system.poi,
    ...(system.poiTags || []),
  ]
    .filter(Boolean)
    .map((t) => String(t).toLowerCase());
  return tags.some((t) => t.includes("propaganda"));
}

function systemDisconnected(system) {
  return !!(
    !system.logistics?.connectedToCapital ||
    system.logistics?.supplyLevel === 0
  );
}

function afterBattlePenalty(system, world = null) {
  if (system.activity === "battle") return -8;
  // Revolt-sourced unrest is milder than a real multi-faction fight.
  if (system.revoltContested) return -4;
  if (system.contested) {
    // Orphan contested left by old revolt spawns (revoltContested stripped / missing):
    // if the only hostile presence is rebels, treat as revolt unrest, not war.
    if (world && contestedOnlyByRebels(world, system)) return -4;
    return -8;
  }
  const cons = system.lastConsequence || system.consequence;
  if (cons === "after_battle" || cons?.id === "after_battle") return -10;
  return 0;
}

function contestedOnlyByRebels(world, system) {
  const owner = system.ownerFactionId;
  const hostiles = new Set();
  for (const f of world.fleets || []) {
    if (f.systemId !== system.id) continue;
    if (f.factionId && f.factionId !== owner) hostiles.add(f.factionId);
  }
  for (const l of world.legions || []) {
    if (l.systemId !== system.id) continue;
    if (l.factionId && l.factionId !== owner) hostiles.add(l.factionId);
  }
  if (hostiles.size === 0) return true; // contested flag with no hostiles = stale
  return [...hostiles].every((id) => isRebelFactionId(id));
}

function taxPressureForFaction(world, factionId) {
  try {
    const ledger = readLedger();
    const eco = ensureFactionEco(ledger, factionId);
    return Number(eco.pressure ?? 0) || 0;
  } catch {
    return 0;
  }
}

function rebelLegionsInSystem(world, systemId) {
  return (world.legions || []).filter(
    (l) => l.systemId === systemId && isRebelLegion(l),
  );
}

/**
 * Resolve loyalty tier for a numeric loyalty value.
 */
export function loyaltyTierFor(loyalty, content) {
  const tiers =
    content?.loyalty_tiers?.loyalty_tiers ||
    (Array.isArray(content?.loyalty_tiers) ? content.loyalty_tiers : []) ||
    [];
  const v = clampLoyalty(loyalty);
  for (const tier of tiers) {
    const hasMin = tier.min != null;
    const hasMax = tier.max != null;
    if (!hasMin && hasMax && v < tier.max) return tier;
    if (hasMin && !hasMax && v >= tier.min) return tier;
    if (hasMin && hasMax && v >= tier.min && v < tier.max) return tier;
  }
  return { effects: [] };
}

/**
 * Collect loyalty-tier production/revolt effects for a faction's planets.
 * production_mult is averaged once per faction (not stacked ×N planets).
 */
export function collectLoyaltyTierEffects(world, factionId, content) {
  const out = [];
  const prodMults = [];
  let planetCount = 0;
  for (const sys of world.systems ?? []) {
    if (sys.ownerFactionId !== factionId) continue;
    for (const planet of sys.planets ?? []) {
      if ((planet.population ?? 0) <= 0) continue;
      planetCount += 1;
      const loyalty = planet.loyalty ?? BASE_LOYALTY;
      const tier = loyaltyTierFor(loyalty, content);
      for (const e of tier.effects || []) {
        if (e.effect === "production_mult") {
          prodMults.push(Number(e.args?.mult ?? 1));
          continue;
        }
        out.push({
          ...e,
          source: {
            kind: "loyalty_tier",
            id: `${sys.id}:${planet.id}:${Math.floor(loyalty)}`,
            label: `Лояльность ${Math.round(loyalty)}`,
          },
        });
      }
    }
  }
  if (prodMults.length > 0) {
    const avg = prodMults.reduce((a, b) => a + b, 0) / prodMults.length;
    out.push({
      effect: "production_mult",
      args: { mult: avg },
      source: {
        kind: "loyalty_tier",
        id: `faction_avg:${factionId}`,
        label: `Лояльность (ср. ×${planetCount})`,
      },
    });
  }
  return out;
}

/**
 * Structural affinity 0–100 (matrix + xeno + race traits + governors).
 * Used for matrix drift — must NOT include tax/battle/logistics shocks.
 */
export function computePlanetAffinity(world, system, planet, content) {
  const ownerId = planet.ownerFactionId || system.ownerFactionId || null;
  if (!ownerId || (planet.population ?? 0) <= 0) {
    return planet.loyalty ?? BASE_LOYALTY;
  }

  const matrix = ensureLoyaltyMatrix(world);
  const faction = (world.factions ?? []).find((f) => f.id === ownerId) ?? null;
  const composition = resolvePlanetRaceComposition(planet, faction);
  const races = content.races || {};

  let weighted = 0;
  let wSum = 0;
  for (const share of composition) {
    const w = (share.percent ?? 0) / 100;
    if (w <= 0) continue;
    let base = matrixValue(matrix, share.raceId, ownerId);
    const race = races[share.raceId];
    const primaryRace =
      faction?.primaryRaceId ||
      faction?.primaryRace ||
      faction?.dominantRaceId ||
      null;
    if (race?.xenorelations && primaryRace) {
      const xeno = Number(race.xenorelations[primaryRace] ?? 0);
      base += xeno * 20;
    }
    weighted += base * w;
    wSum += w;
  }
  let loyalty = wSum > 0 ? weighted / wSum : BASE_LOYALTY;

  const climate = planet.climate || planet.type || "";
  if (climate === "ocean") {
    for (const share of composition) {
      const race = races[share.raceId];
      if (raceHasTrait(race, "logistics_independent")) {
        loyalty -= 10 * ((share.percent ?? 0) / 100);
      }
    }
  }

  const distinctRaces = composition.filter((s) => (s.percent ?? 0) > 0).length;
  if (distinctRaces >= 2) {
    for (const share of composition) {
      const race = races[share.raceId];
      if (raceHasTrait(race, "cosmopolitan")) {
        loyalty += 1 * ((share.percent ?? 0) / 100);
      }
    }
  }

  const raceEffects = collectRaceEffects(races, composition, {
    factionId: ownerId,
    turn: world.meta?.turn ?? 0,
  }).filter(
    (e) => e.effect === "loyalty_add" || e.effect === "loyalty_mult",
  );
  const stack = buildModifierStack(raceEffects);
  const chStar = stack.channels["loyalty:*"];
  let flat = chStar?.flat ?? 0;
  let mult = chStar?.mult ?? 1;
  for (const share of composition) {
    const ch = stack.channels[`loyalty:${share.raceId}`];
    if (ch) {
      flat += (ch.flat || 0) * ((share.percent ?? 0) / 100);
      mult *= 1 + ((ch.mult ?? 1) - 1) * ((share.percent ?? 0) / 100);
    }
  }
  loyalty = (loyalty + flat) * mult;
  loyalty += npcLoyaltyDeltaForSystem(world, system, ownerId);

  return clampLoyalty(loyalty);
}

/**
 * Compute planet loyalty 0–100 from affinity + situational modifiers.
 */
export function computePlanetLoyalty(world, system, planet, content) {
  const ownerId = planet.ownerFactionId || system.ownerFactionId || null;
  if (!ownerId || (planet.population ?? 0) <= 0) {
    return planet.loyalty ?? BASE_LOYALTY;
  }

  const faction = (world.factions ?? []).find((f) => f.id === ownerId) ?? null;
  const composition = resolvePlanetRaceComposition(planet, faction);
  const races = content.races || {};

  let loyalty = computePlanetAffinity(world, system, planet, content);

  const pressure = taxPressureForFaction(world, ownerId);
  let pressureDelta = -Math.min(
    PRESSURE_LOYALTY_HIT_CAP,
    pressure * PRESSURE_LOYALTY_COEFF,
  );
  for (const share of composition) {
    const race = races[share.raceId];
    if (raceHasTrait(race, "militarist_loyalty")) {
      const w = (share.percent ?? 0) / 100;
      pressureDelta +=
        Math.min(PRESSURE_LOYALTY_HIT_CAP, pressure * MILITARIST_PRESSURE_BONUS) *
        w;
    }
  }
  loyalty += pressureDelta;

  if (systemHasPropaganda(system)) loyalty += 5;
  if (systemDisconnected(system)) loyalty -= 12;
  loyalty += afterBattlePenalty(system, world);
  loyalty += stabilityLoyaltyDelta(world, system, planet, content);

  return clampLoyalty(loyalty);
}

function isCalmForRecovery(world, system, ownerId) {
  if (system.activity === "battle") return false;
  if (system.revoltContested || system.contested) return false;
  if (systemDisconnected(system)) return false;
  const pressure = taxPressureForFaction(world, ownerId);
  return pressure < 3;
}

/**
 * Update loyaltyMatrix drift + planet.loyalty for one faction.
 */
export function loyaltyTick(world, factionId, content) {
  const journal = [];
  const matrix = ensureLoyaltyMatrix(world);
  const faction = (world.factions ?? []).find((f) => f.id === factionId) ?? null;
  if (!faction) return { journal };

  for (const sys of world.systems ?? []) {
    if (sys.ownerFactionId !== factionId) continue;
    for (const planet of sys.planets ?? []) {
      if ((planet.population ?? 0) <= 0) {
        planet.loyalty = planet.loyalty ?? BASE_LOYALTY;
        continue;
      }
      const composition = resolvePlanetRaceComposition(planet, faction);
      // Matrix = base racial affinity only. Mean-revert toward BASE±xeno.
      // Do NOT drift toward affinity/loyalty (those already add gov/traits on top
      // of matrix — that double-count was the empire-wide death spiral).
      const primaryRace =
        faction?.primaryRaceId ||
        faction?.primaryRace ||
        faction?.dominantRaceId ||
        null;
      const races = content.races || {};
      for (const share of composition) {
        let target = BASE_LOYALTY;
        const race = races[share.raceId];
        if (race?.xenorelations && primaryRace) {
          target += Number(race.xenorelations[primaryRace] ?? 0) * 20;
        }
        const current = matrixValue(matrix, share.raceId, factionId);
        const tgt = clampLoyalty(target);
        const rate =
          current < MATRIX_SOFT_FLOOR ? MATRIX_HEAL_RATE : MATRIX_DRIFT_RATE;
        const next = current + (tgt - current) * rate;
        setMatrixValue(matrix, share.raceId, factionId, next);
      }
      const before = planet.loyalty ?? BASE_LOYALTY;
      planet.loyalty = computePlanetLoyalty(world, sys, planet, content);

      if (isCalmForRecovery(world, sys, factionId) && planet.loyalty < CALM_RECOVERY_FLOOR) {
        planet.loyalty = clampLoyalty(
          Math.min(CALM_RECOVERY_FLOOR, planet.loyalty + CALM_RECOVERY_STEP),
        );
      }

      const tier = loyaltyTierFor(planet.loyalty, content);
      for (const e of tier.effects || []) {
        if (e.effect === "loyalty_add") {
          planet.loyalty = clampLoyalty(
            planet.loyalty + Number(e.args?.amount ?? 0),
          );
        }
      }

      if (Math.abs(planet.loyalty - before) >= 1) {
        journal.push({
          type: "loyalty_change",
          factionId,
          systemId: sys.id,
          planetId: planet.id,
          from: Math.round(before),
          to: Math.round(planet.loyalty),
        });
      }
    }
  }
  return { journal };
}

/**
 * Clear expired revolt unrest + orphan contested left by old revolt spawns.
 * Contested must not stick forever after rebels are gone (that permanently
 * applied afterBattle −8 and re-zeroed loyalty across the map).
 */
export function clearExpiredRevoltContested(world) {
  const journal = [];
  const turn = world.meta?.turn ?? 0;
  for (const sys of world.systems ?? []) {
    const rebels = rebelLegionsInSystem(world, sys.id);
    const marked = !!(sys.revoltContested || sys.revoltUntilTurn);
    const until = sys.revoltUntilTurn;
    const expired = until == null || turn >= until;
    const orphanContested =
      !!sys.contested &&
      sys.activity !== "battle" &&
      contestedOnlyByRebels(world, sys) &&
      rebels.length === 0;

    if (marked) {
      if (rebels.length > 0 && !expired) continue;
      if (rebels.length > 0 && expired) continue;
    } else if (!orphanContested) {
      continue;
    }

    sys.revoltContested = false;
    sys.revoltUntilTurn = null;
    if (sys.activity !== "battle" && contestedOnlyByRebels(world, sys)) {
      sys.contested = false;
    }
    for (const planet of sys.planets ?? []) {
      if (planet.contested) planet.contested = false;
    }
    journal.push({
      type: "revolt_cleared",
      systemId: sys.id,
      turn,
      orphan: orphanContested && !marked,
    });
  }
  return journal;
}

/**
 * Superseded by stabilityRevolt.mjs. loyalty < 20 does not spawn.
 */
export function checkRevolt(world, system, planet, content) {
  void world;
  void system;
  void content;
  const loyalty = planet.loyalty ?? BASE_LOYALTY;
  if (loyalty >= 20) return null;
  return {
    type: "revolt_deferred",
    planetId: planet.id,
    loyalty: Math.round(loyalty),
    reason: "stability_meter",
  };
}

/**
 * Run loyalty tick for all factions, then clear expired unrest.
 * Revolt spawn lives in applyStabilityRevolt (processTurn).
 */
export function runLoyaltyPhase(world, content) {
  const journal = [];
  for (const fac of world.factions ?? []) {
    const r = loyaltyTick(world, fac.id, content);
    for (const e of r.journal) journal.push(e);
  }

  for (const e of clearExpiredRevoltContested(world)) journal.push(e);
  return { journal };
}

/**
 * Average loyalty of inhabited planets in a system (for map mode).
 */
export function systemAvgLoyalty(system) {
  const inhabited = (system.planets || []).filter((p) => (p.population ?? 0) > 0);
  if (!inhabited.length) return null;
  const sum = inhabited.reduce((s, p) => s + (p.loyalty ?? BASE_LOYALTY), 0);
  return sum / inhabited.length;
}

/**
 * One-shot GM repair: reset poisoned matrix / loyalty / revolt spam.
 * Mutates world in place; does not touch ledger (caller seeds stocks).
 */
export function repairLoyaltyCollapse(world, opts = {}) {
  const matrixTarget = Number(opts.matrixTarget ?? BASE_LOYALTY);
  const planetLoyalty = Number(opts.planetLoyalty ?? 55);
  const removeRebels = opts.removeRebels !== false;
  const clearRevoltFlags = opts.clearRevoltFlags !== false;

  const stats = {
    matrixCells: 0,
    planetsReset: 0,
    rebelsRemoved: 0,
    systemsCleared: 0,
  };

  const matrix = ensureLoyaltyMatrix(world);
  for (const raceId of Object.keys(matrix)) {
    const row = matrix[raceId];
    if (!row || typeof row !== "object") continue;
    for (const facId of Object.keys(row)) {
      if (typeof row[facId] === "number") {
        row[facId] = matrixTarget;
        stats.matrixCells += 1;
      }
    }
  }

  for (const sys of world.systems ?? []) {
    let cleared = false;
    if (clearRevoltFlags) {
      if (sys.revoltContested || sys.revoltUntilTurn || sys.contested) {
        // Clear revolt-sourced and orphan contested; leave activity:battle alone.
        if (sys.activity !== "battle") {
          sys.contested = false;
        }
        sys.revoltContested = false;
        sys.revoltUntilTurn = null;
        cleared = true;
      }
    }
    for (const planet of sys.planets ?? []) {
      if ((planet.population ?? 0) > 0) {
        planet.loyalty = planetLoyalty;
        stats.planetsReset += 1;
      } else if (planet.loyalty == null) {
        planet.loyalty = BASE_LOYALTY;
      }
      if (clearRevoltFlags) {
        planet.revolt = null;
        planet.revoltStage2SinceTurn = null;
        planet.rebelForceId = null;
      }
      if (clearRevoltFlags && planet.contested) {
        planet.contested = false;
        cleared = true;
      }
    }
    if (cleared) stats.systemsCleared += 1;
  }

  if (removeRebels && Array.isArray(world.legions)) {
    const before = world.legions.length;
    world.legions = world.legions.filter((l) => !isRebelLegion(l));
    stats.rebelsRemoved = before - world.legions.length;
  }

  return stats;
}
