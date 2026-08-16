/**
 * NOT a port — new design from the 2026-08-12 grill session (Q10).
 * "Recruits" aren't an accumulating stockpile; they're a derived
 * mobilization ceiling checked fresh against a planet's CURRENT
 * population every time a unit is raised. Raising a unit consumes
 * population directly (recruitment.mjs's raiseUnit) — the same pool
 * building job-slots draw from (domain/planets/laborAllocation.mjs), per
 * grill Q11, so military and economy genuinely compete for the same
 * people.
 *
 * The rate itself (`content.economy_balance.forces.mobilizationRate`,
 * currently 0.3) is the user's "условно 30% населения" baseline. Pushing
 * past that ceiling is allowed only when `raiseUnit` is called with
 * `overrideCeiling: true` — the overflow portion costs extra population
 * (see `populationCostForRaise`). First-pass multiplier below; grill Q10
 * left the exact penalty unspecified.
 */

/** First-pass default (grill Q10 unspecified). Overflow recruits cost this many population-units each. */
export const OVER_CEILING_POPULATION_MULT = 1.5;

export function mobilizableRecruits(planet, mobilizationRate) {
  const rate = Math.max(0, Math.min(1, Number(mobilizationRate) || 0));
  return Math.floor((Number(planet?.population) || 0) * rate);
}

/**
 * Population spent to raise `count` units given the planet's current
 * mobilization ceiling. Within the ceiling the rate is 1:1; with
 * `overrideCeiling`, each recruit above the ceiling costs
 * OVER_CEILING_POPULATION_MULT (ceil'd). Without the override the caller
 * still has to reject `count > ceiling` itself — this helper does not.
 */
export function populationCostForRaise(count, ceiling, overrideCeiling = false) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const cap = Math.max(0, Math.floor(Number(ceiling) || 0));
  if (!overrideCeiling) return n;
  const within = Math.min(n, cap);
  const above = Math.max(0, n - cap);
  return within + Math.ceil(above * OVER_CEILING_POPULATION_MULT);
}

/**
 * Crew embarked when raising ships. NOT a port — GMap has no boarding
 * mechanic. First-pass formula (propose-and-confirm):
 * `count × tier × crewPerTier`, with `crewPerTier` from
 * `content.economy_balance.forces` (currently 5). The result is persisted
 * on the composition group at raise time; boarding must read that field,
 * not recompute this.
 *
 * 0 for ground units (crew is a ship-only concept). Race-dependent
 * crewlessness (drone/android factions → 0-crew, unboardable) is an
 * explicit future extension — not implemented here.
 */
export function crewCountForRaise(kind, def, count, crewPerTier) {
  if (kind !== "ship") return 0;
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const tier = Math.max(1, Number(def?.tier) || 1);
  const per = Math.max(0, Number(crewPerTier) || 0);
  return n * tier * per;
}
