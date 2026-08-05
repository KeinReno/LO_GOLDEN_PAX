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
 * Force OD = min(max, base + fleets*perFleet + legions*perLegion).
 */
export function resolveForceApMax(world, factionId, rules) {
  const cfg = { ...DEFAULT_FORCE_AP, ...(rules?.forceAp || {}) };
  const { fleets, legions } = countFactionForces(world, factionId);
  const raw =
    Number(cfg.base ?? 2) +
    fleets * Number(cfg.perFleet ?? 1) +
    legions * Number(cfg.perLegion ?? 1);
  const max = Math.max(0, Number(cfg.max ?? 8));
  return Math.max(0, Math.min(max, Math.floor(raw)));
}
