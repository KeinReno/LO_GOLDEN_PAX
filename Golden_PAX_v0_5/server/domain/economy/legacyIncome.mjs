/**
 * NOT a full port of GMap's legacy metal/supply bridge.
 *
 * GMap's version (`economyTick.mjs` `legacyGross` + `mapResourceYieldLegacyOnly`)
 * walks system-level `sys.resources` — uncategorized deposits plus +1 supply
 * per populated system, scaled by `logisticsProductionMult`. This project
 * never built `system.resources` (only `planet.resources`; see
 * `domain/planets/flowContribution.mjs`). Inventing system-level deposits
 * just to copy that function would be the wrong shape.
 *
 * This is a deliberately simplified stand-in with the same *spirit*: a weak,
 * capped survival floor so a peg-less faction can still replenish
 * `currency.supply`, while peg-conversion (Priority 1) is the uncapped
 * upgrade. Constants below are first-pass defaults (same class as
 * `laborSlots = tier`), not hand-tuned.
 *
 * GMap baseline is `{ "currency.metal": 0, "currency.supply": 2 }` per
 * faction before per-system adds — metal stays 0 here too; the floor is
 * supply-only so committing to a peg is what actually produces metal.
 */

/** First-pass: GMap's per-faction supply baseline before per-system adds. */
export const LEGACY_SUPPLY_BASELINE = 2;
/** First-pass: `ceil(pop * this)` extra supply, on top of the baseline. */
export const LEGACY_POP_SUPPLY_RATE = 0.05;
/** First-pass cap on the population add — the floor must stay weak vs peg-conversion. */
export const LEGACY_POP_SUPPLY_CAP = 10;

/**
 * @param {number} ownedPlanetsCount  accepted for call-site clarity / future
 *   per-planet extension; the first-pass formula does not use it (GMap's
 *   extra supply was per populated *system*, which we don't have).
 * @param {number} totalPopulation
 * @returns {{ "currency.supply": number, "currency.metal": number }}
 */
export function computeLegacyFloorIncome(ownedPlanetsCount, totalPopulation) {
  void ownedPlanetsCount;
  const pop = Math.max(0, Number(totalPopulation) || 0);
  const popAdd = Math.min(LEGACY_POP_SUPPLY_CAP, Math.ceil(pop * LEGACY_POP_SUPPLY_RATE));
  return {
    "currency.supply": LEGACY_SUPPLY_BASELINE + popAdd,
    "currency.metal": 0,
  };
}
