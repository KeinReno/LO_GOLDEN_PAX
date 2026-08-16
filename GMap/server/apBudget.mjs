/**
 * Empire vs Force action-point budgets.
 */
import { resolveApMax } from "./modifierStack.mjs";

export const DEFAULT_AP_PER_TURN = 9;

const DEFAULT_FORCE_AP = {
  base: 2,
  perFleet: 1,
  perLegion: 1,
  max: 8,
};

export function intentApCosts(def) {
  return {
    apCost: Math.max(0, Math.floor(Number(def?.ap ?? 0) || 0)),
    forceApCost: Math.max(0, Math.floor(Number(def?.forceAp ?? 0) || 0)),
  };
}

export function resolveEmpireApMax(rules, stack) {
  const base = Number(rules?.apPerTurn ?? DEFAULT_AP_PER_TURN);
  return resolveApMax(base, stack);
}

export function countFactionForces(world, factionId) {
  const fleets = (world?.fleets ?? []).filter((f) => f.factionId === factionId)
    .length;
  const legions = (world?.legions ?? []).filter((l) => l.factionId === factionId)
    .length;
  return { fleets, legions };
}

/**
 * Diminishing per-force bonus by ordinal index (1-based):
 *   1–3 → full perUnit, 4–6 → half, 7+ → quarter.
 * Keeps typical small empires (1–3 fleets/legions) at legacy totals;
 * splitting one large force into many tiny ones no longer scales AP linearly.
 */
function diminishingForceBonus(count, perUnit) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const p = Number(perUnit) || 0;
  let sum = 0;
  for (let i = 1; i <= n; i++) {
    if (i <= 3) sum += p;
    else if (i <= 6) sum += p * 0.5;
    else sum += p * 0.25;
  }
  return sum;
}

/**
 * Force OD = min(max, base + diminishing(fleets, perFleet) + diminishing(legions, perLegion)).
 */
export function resolveForceApMax(world, factionId, rules) {
  const cfg = { ...DEFAULT_FORCE_AP, ...(rules?.forceAp || {}) };
  const { fleets, legions } = countFactionForces(world, factionId);
  const raw =
    Number(cfg.base ?? 2) +
    diminishingForceBonus(fleets, cfg.perFleet ?? 1) +
    diminishingForceBonus(legions, cfg.perLegion ?? 1);
  const max = Math.max(0, Number(cfg.max ?? 8));
  return Math.max(0, Math.min(max, Math.floor(raw)));
}
