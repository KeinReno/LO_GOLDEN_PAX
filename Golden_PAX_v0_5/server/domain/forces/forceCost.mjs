/**
 * Ported verbatim from GMap/server/forceEconomy.mjs (exported + pure
 * there — diffed directly in forceCost.parity.test.mjs). `stationCost`/
 * `forgeMetalCost`/`disbandMetalRefund`/`produceForceAp` aren't ported —
 * this project hasn't ported GMap's AP-budget system or the arbitrary-
 * composition-edit model those support (see domain/forces/README.md).
 */
function metalByTier(bal, tier) {
  const t = String(Math.max(1, Math.min(10, Number(tier) || 1)));
  return Number(bal.buildings?.metalByTier?.[t] ?? 8 + Number(t) * 5);
}

/**
 * @param {object} economyBalance  content.economy_balance
 * @param {"ship"|"unit"} kind
 * @param {{ tier?: number, cost?: Record<string, number> }} def
 * @param {number} count
 */
export function produceForceCost(economyBalance, kind, def, count = 1) {
  const bal = economyBalance || {};
  const n = Math.max(1, count | 0);
  if (def?.cost && typeof def.cost === "object") {
    const out = {};
    for (const [k, v] of Object.entries(def.cost)) {
      out[k] = Math.ceil(Number(v || 0) * n);
    }
    return out;
  }
  const tier = Math.max(1, Number(def?.tier ?? 1) || 1);
  const forces = bal.forces || {};
  const mult = kind === "unit" ? Number(forces.unitCostMult ?? 1.3) : Number(forces.shipCostMult ?? 1.6);
  const ratio = Number(forces.supplyRatio ?? bal.buildings?.supplyRatio ?? 0.42);
  const metal = Math.max(1, Math.round(metalByTier(bal, tier) * mult)) * n;
  const supply = Math.max(1, Math.round(metal * ratio));
  return {
    "currency.metal": metal,
    "currency.supply": supply,
  };
}

/**
 * Tier-scaled upkeep contribution for one composition group.
 * @param {object} economyBalance
 * @param {"ship"|"unit"} kind
 * @param {number} tier
 * @param {number} count
 */
export function forceUpkeepRates(economyBalance, kind, tier, count) {
  const forces = (economyBalance || {}).forces || {};
  const t = Math.max(1, Number(tier) || 1);
  const n = Math.max(0, Number(count) || 0);
  if (kind === "ship") {
    const metalPer = Number(forces.shipUpkeepMetalBase ?? 0.2) + Number(forces.shipUpkeepMetalPerTier ?? 0.12) * t;
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
