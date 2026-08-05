/**
 * Shared force/colony cost helpers driven by economy_balance.json.
 */
import { getContent } from "./contentLoader.mjs";

function bal() {
  return getContent()?.economy_balance || {};
}

function metalByTier(tier) {
  const t = String(Math.max(1, Math.min(10, Number(tier) || 1)));
  return Number(bal().buildings?.metalByTier?.[t] ?? 8 + Number(t) * 5);
}

/**
 * @param {"ship"|"unit"} kind
 * @param {{ tier?: number, cost?: Record<string, number> }} def
 * @param {number} count
 */
export function produceForceCost(kind, def, count = 1) {
  const n = Math.max(1, count | 0);
  if (def?.cost && typeof def.cost === "object") {
    const out = {};
    for (const [k, v] of Object.entries(def.cost)) {
      out[k] = Math.ceil(Number(v || 0) * n);
    }
    return out;
  }
  const tier = Math.max(1, Number(def?.tier ?? 1) || 1);
  const forces = bal().forces || {};
  const mult =
    kind === "unit"
      ? Number(forces.unitCostMult ?? 1.3)
      : Number(forces.shipCostMult ?? 1.6);
  const ratio = Number(forces.supplyRatio ?? bal().buildings?.supplyRatio ?? 0.42);
  const metal = Math.max(1, Math.round(metalByTier(tier) * mult)) * n;
  const supply = Math.max(1, Math.round(metal * ratio));
  return {
    "currency.metal": metal,
    "currency.supply": supply,
  };
}

export function produceForceAp(def, count = 1) {
  const tier = Math.max(1, Number(def?.tier ?? 1) || 1);
  const n = Math.max(1, count | 0);
  const breakAt = Number(bal().forces?.apTierBreak ?? 4);
  return Math.max(1, Math.ceil((tier >= breakAt ? 2 : 1) * n * 0.5));
}

export function stationCost(kind) {
  const row = bal().forces?.stations?.[kind];
  if (row) {
    return {
      "currency.metal": Number(row.metal || 0),
      "currency.supply": Number(row.supply || 0),
    };
  }
  return null;
}

export function forgeMetalCost() {
  return Number(bal().forces?.forgeMetal ?? 40);
}

export function disbandMetalRefund() {
  return Number(bal().forces?.disbandRefund ?? 16);
}

/**
 * Tier-scaled upkeep contribution for one composition group.
 * @param {"ship"|"unit"} kind
 * @param {number} tier
 * @param {number} count
 */
export function forceUpkeepRates(kind, tier, count) {
  const forces = bal().forces || {};
  const t = Math.max(1, Number(tier) || 1);
  const n = Math.max(0, Number(count) || 0);
  if (kind === "ship") {
    const metalPer =
      Number(forces.shipUpkeepMetalBase ?? 0.2) +
      Number(forces.shipUpkeepMetalPerTier ?? 0.12) * t;
    return {
      metal: n * metalPer,
      d: n * Number(forces.shipUpkeepDPerCount ?? 0.25),
      e: n * Number(forces.shipUpkeepEPerCount ?? 0.15),
    };
  }
  return {
    metal: 0,
    d: 0,
    e: n * Number(forces.legionUpkeepEPerCount ?? 0.35),
  };
}
