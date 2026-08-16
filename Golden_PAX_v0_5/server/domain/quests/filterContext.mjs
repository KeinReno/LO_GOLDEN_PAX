/**
 * Whether a quest's filterBy conditions match a faction's current
 * situation. Ported verbatim from GMap/server/questEngine.mjs's
 * matchesFilter — already pure. `ctx` is normally built by GMap's
 * buildFilterContext (needs the full world) — this port doesn't include
 * that builder; callers supply `ctx` directly (era/warCount/flags), same
 * "caller-supplied input" pattern as every other domain's world-derived
 * numbers (see README.md "Status"). Parity verified in
 * filterContext.parity.test.mjs.
 */
export function matchesFilter(filterBy, ctx) {
  const f = filterBy || {};
  if (f.minEra != null && (ctx.era ?? 1) < Number(f.minEra)) return false;
  if (f.maxWarCount != null && ctx.warCount > Number(f.maxWarCount)) return false;
  if (f.hasRefugees && !ctx.hasRefugees) return false;
  if (f.borderWithWar && !ctx.borderWithWar) return false;
  if (f.requiresRace && !ctx.hasRace(f.requiresRace)) return false;
  if (f.requiresBuilding && !ctx.hasBuilding(f.requiresBuilding)) return false;
  if (f.lowLoyaltyRace && !ctx.lowLoyaltyRace(f.lowLoyaltyRace)) return false;
  if (f.excludeIfArcActive && ctx.arcActive(f.excludeIfArcActive)) return false;
  return true;
}
