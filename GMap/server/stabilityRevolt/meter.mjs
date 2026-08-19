/**
 * Stability meter: config, clamp/band math, per-turn tick, production
 * penalties, rebel-count/naming helpers. Pure queries + the isolated
 * per-planet meter tick — no rebel spawn/secession state machine here
 * (that's ../stabilityRevolt/revoltMachine.mjs).
 * Extracted from ../stabilityRevolt.mjs.
 */
import { stabilityLoyaltyDelta } from "../stability.mjs";

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
