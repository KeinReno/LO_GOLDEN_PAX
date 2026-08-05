/**
 * Population loyalty tick + revolt checks (A3).
 * Planet loyalty is derived from loyaltyMatrix, xenorelations, tax pressure, POIs.
 */
import { randomInt } from "node:crypto";
import {
  buildModifierStack,
  collectRaceEffects,
  resolvePlanetRaceComposition,
} from "./modifierStack.mjs";
import { spawnRefugees } from "./narrative.mjs";
import { readLedger, ensureFactionEco } from "./ledger.mjs";
import { npcLoyaltyDeltaForSystem } from "./courtGovernance.mjs";

const BASE_LOYALTY = 50;
const LOYALTY_MIN = 0;
const LOYALTY_MAX = 100;

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
    ...(system.spaceObjects || []).map((o) => typeof o === "string" ? o : (o.kind || o.tag || o.id || o)),
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

function afterBattlePenalty(system) {
  if (system.activity === "battle" || system.contested) return -8;
  const cons = system.lastConsequence || system.consequence;
  if (cons === "after_battle" || cons?.id === "after_battle") return -10;
  return 0;
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
 * Compute planet loyalty 0–100 from matrix + modifiers.
 */
export function computePlanetLoyalty(world, system, planet, content) {
  const ownerId =
    planet.ownerFactionId || system.ownerFactionId || null;
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
    // Mixed-pop cosmopolitan bonus: human cosmopolitan handled via loyalty_add in stack
    weighted += base * w;
    wSum += w;
  }
  let loyalty = wSum > 0 ? weighted / wSum : BASE_LOYALTY;

  const pressure = taxPressureForFaction(world, ownerId);
  let pressureDelta = -pressure * 0.8;
  // Belator militarist_loyalty: tax pressure raises loyalty
  for (const share of composition) {
    const race = races[share.raceId];
    if (raceHasTrait(race, "militarist_loyalty")) {
      const w = (share.percent ?? 0) / 100;
      pressureDelta += pressure * 1.6 * w;
    }
  }
  loyalty += pressureDelta;

  if (systemHasPropaganda(system)) loyalty += 5;
  if (systemDisconnected(system)) loyalty -= 12;
  loyalty += afterBattlePenalty(system);

  // Synth logistics_independent: ocean climate loyalty hit
  const climate = planet.climate || planet.type || "";
  if (climate === "ocean") {
    for (const share of composition) {
      const race = races[share.raceId];
      if (raceHasTrait(race, "logistics_independent")) {
        loyalty -= 10 * ((share.percent ?? 0) / 100);
      }
    }
  }

  // Human cosmopolitan: bonus on mixed-population worlds
  const distinctRaces = composition.filter((s) => (s.percent ?? 0) > 0).length;
  if (distinctRaces >= 2) {
    for (const share of composition) {
      const race = races[share.raceId];
      if (raceHasTrait(race, "cosmopolitan")) {
        loyalty += 1 * ((share.percent ?? 0) / 100);
      }
    }
  }

  // Apply race trait loyalty_add / loyalty_mult via stack (+ race_states)
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

  // NPC governors / traits scoped to this system (+ ungoverned penalty)
  loyalty += npcLoyaltyDeltaForSystem(world, system, ownerId);

  return clampLoyalty(loyalty);
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
      // Soft drift of matrix toward computed target
      for (const share of composition) {
        const current = matrixValue(matrix, share.raceId, factionId);
        const target = computePlanetLoyalty(world, sys, planet, content);
        const next = current + (target - current) * 0.15;
        setMatrixValue(matrix, share.raceId, factionId, next);
      }
      const before = planet.loyalty ?? BASE_LOYALTY;
      planet.loyalty = computePlanetLoyalty(world, sys, planet, content);

      // High-tier loyalty_add drift
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

function rollChance(chance) {
  const p = Math.max(0, Math.min(1, Number(chance) || 0));
  if (p <= 0) return false;
  // 0..9999 vs threshold
  return randomInt(10000) < Math.floor(p * 10000);
}

/**
 * If loyalty < 20, roll revolt_risk. On fail: spawn rebels / flip / refugees.
 */
export function checkRevolt(world, system, planet, content) {
  const loyalty = planet.loyalty ?? BASE_LOYALTY;
  if (loyalty >= 20) return null;
  if ((planet.population ?? 0) <= 0) return null;

  const tier = loyaltyTierFor(loyalty, content);
  let chance = 0.05;
  for (const e of tier.effects || []) {
    if (e.effect === "revolt_risk") {
      chance = Math.max(chance, Number(e.args?.chancePerTurn ?? chance));
    }
  }
  // Extra race revolt_risk
  const ownerId = planet.ownerFactionId || system.ownerFactionId;
  const faction = (world.factions ?? []).find((f) => f.id === ownerId);
  const composition = resolvePlanetRaceComposition(planet, faction);
  const raceEffects = collectRaceEffects(content.races || {}, composition, {
    factionId: ownerId || undefined,
    turn: world.meta?.turn ?? 0,
  });
  for (const e of raceEffects) {
    if (e.effect === "revolt_risk") {
      chance += Number(e.args?.chancePerTurn ?? 0);
    }
  }

  if (!rollChance(chance)) {
    return {
      type: "revolt_check",
      systemId: system.id,
      planetId: planet.id,
      loyalty: Math.round(loyalty),
      rolled: false,
    };
  }

  const lostPop = Math.max(1, Math.floor((planet.population || 1) * 0.2));
  planet.population = Math.max(0, (planet.population || 0) - lostPop);
  planet.loyalty = 35;

  // Spawn rebel legion remnant
  const rebelId = `legion_rebel_${system.id}_${Date.now().toString(36)}`;
  if (!Array.isArray(world.legions)) world.legions = [];
  world.legions.push({
    id: rebelId,
    name: `Мятеж · ${planet.name || system.name}`,
    factionId: "faction_rebels",
    systemId: system.id,
    strength: Math.max(1, Math.round(lostPop / 5)),
    status: "idle",
    raceId: composition[0]?.raceId || "race_human",
    composition: [
      {
        defId: "unit.generic_line",
        count: Math.max(1, Math.round(lostPop / 5)),
        hp: 100,
      },
    ],
    route: [],
  });

  // Contested / owner shaken
  system.contested = true;
  planet.contested = true;
  if ((planet.population || 0) <= 0 && system.ownerFactionId === ownerId) {
    // Depopulated capital planet — soft owner clear on planet only
    planet.ownerFactionId = null;
  }

  const journal = [];
  spawnRefugees(world, system.id, lostPop, journal, { share: 0.6 });

  return {
    type: "revolt",
    systemId: system.id,
    planetId: planet.id,
    factionId: ownerId,
    loyalty: Math.round(loyalty),
    lostPop,
    rebelLegionId: rebelId,
    refugees: journal,
  };
}

/**
 * Run loyalty tick for all factions, then revolt checks.
 */
export function runLoyaltyPhase(world, content) {
  const journal = [];
  for (const fac of world.factions ?? []) {
    const r = loyaltyTick(world, fac.id, content);
    for (const e of r.journal) journal.push(e);
  }

  for (const sys of world.systems ?? []) {
    for (const planet of sys.planets ?? []) {
      if ((planet.loyalty ?? BASE_LOYALTY) >= 20) continue;
      const ev = checkRevolt(world, sys, planet, content);
      if (ev) journal.push(ev);
    }
  }
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
