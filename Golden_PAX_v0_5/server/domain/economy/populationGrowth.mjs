/**
 * Population growth/emigration curve. Ported verbatim from
 * GMap/server/economyTick.mjs's naturalPopDeltaBeforeModifiers — pure
 * already, no change needed. Parity verified against the GMap export in
 * populationGrowth.parity.test.mjs.
 *
 * Over cap → emigration/pressure loss (never a fixed 20% growth floor).
 *
 * `applyPopGrowthModifiers` is the court/tech wiring for `pop_growth_mult`
 * / `pop_growth_flat` (GMap/server/economyTick.mjs applied
 * `growthStack.channels.pop_growth` after the natural curve). Court
 * faction-scope effects are the consumer added in COURT_AND_NPC_ROSTER_SPEC
 * Part 4; omitting `effects` is a no-op.
 */
import { buildModifierStack, applyFlatThenMult } from "./modifierStack.mjs";

export function naturalPopDeltaBeforeModifiers(pop, cap, rate, habEff, supplyFactor, maxLossPerTurn) {
  if (pop <= 0) return 0;
  const safeCap = Math.max(1, Number(cap) || 1);
  if (pop > safeCap) {
    const excessRatio = (pop - safeCap) / safeCap;
    const lossRate = Math.min(maxLossPerTurn, 0.03 + 0.02 * Math.min(excessRatio, 20));
    return -pop * lossRate;
  }
  const headroomFactor = (safeCap - pop) / safeCap;
  return pop * rate * habEff * supplyFactor * headroomFactor;
}

export function applyPopGrowthModifiers(natural, effects) {
  if (!effects?.length) return natural;
  const stack = buildModifierStack(effects);
  return applyFlatThenMult(natural, stack.channels.pop_growth);
}
