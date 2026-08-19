/**
 * Economy + population tick.
 * Authoritative path: 6×10 flow matrix → category stocks + named strategic stocks.
 * Legacy metal/supply: legacy-only yields + fleet metal upkeep (no categoryNet mirror).
 * Peg conversion (currencyPeg.mjs) runs after all factions' extraction so
 * dominance rates see complete galaxy totals; the legacy floor is unchanged.
 *
 * Thin re-export barrel — implementation lives in ./economyTick/*.mjs.
 * Kept as the stable import path so existing `from "./economyTick.mjs"`
 * call sites across the server don't need to change.
 */
export { naturalPopDeltaBeforeModifiers, activatePendingPolicies } from "./economyTick/helpers.mjs";
export { computeFlowBreakdown } from "./economyTick/flowBreakdown.mjs";
export { resolveTreasuryPeg, runEconomyTick } from "./economyTick/tick.mjs";
export {
  queueTaxChange,
  lookupMarketRate,
  marketConvert,
  transferResources,
} from "./economyTick/market.mjs";
