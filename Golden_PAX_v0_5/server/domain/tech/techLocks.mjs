import { factionRaceCounts } from "../planets/raceComposition.mjs";
import { factionHasProperty } from "./properties.mjs";

/** Ported from GMap/server/techActions.mjs's RACE_LOCK_MIN_SHARE. */
export const RACE_LOCK_MIN_SHARE = 30;

/**
 * Population-weighted race share (%) across every planet a faction owns.
 * Behavior-derived from GMap's `factionRaceSharePercent` (which walks
 * `world.systems`/`resolvePlanetRaceComposition`) — reshaped to take the
 * faction's planets directly, reusing this project's own
 * `factionRaceCounts` (domain/planets/raceComposition.mjs) instead of
 * re-deriving race composition, since that's already the real source of
 * truth here (GMap never modeled per-race population this way).
 */
export function raceSharePercent(factionPlanets, raceId) {
  if (!raceId) return 0;
  const counts = factionRaceCounts(factionPlanets);
  const totalPop = Object.values(counts).reduce((s, n) => s + n, 0);
  if (totalPop <= 0) return 0;
  return ((counts[raceId] || 0) / totalPop) * 100;
}

/**
 * Whether a faction may research `def` — the raceLock/requireProperties
 * portion of GMap/server/techActions.mjs's `checkTechLocks`. NOT ported:
 * `factionTraitLock` (needs a `faction.traits` field this project's
 * `factions` table doesn't have — no data source to check against yet,
 * same class of gap as canBuildWithTech's dropped RoleScore branch) and
 * `factionCanAccessTech`'s tech-pool check (a separate GMap system,
 * techPool.mjs, not ported — out of scope for this pass).
 *
 * @param {object} def  a technologies.json entry
 * @param {object} techAccount
 * @param {object[]} factionPlanets  this faction's owned planets (for raceLock)
 * @param {object} content
 * @returns {{ ok: boolean, error?: string }}
 */
export function checkTechLocks(def, techAccount, factionPlanets, content) {
  if (def.raceLock) {
    const share = raceSharePercent(factionPlanets, def.raceLock);
    if (share < RACE_LOCK_MIN_SHARE) {
      const raceName = content?.races?.[def.raceLock]?.name || def.raceLock;
      return { ok: false, error: `requires >=${RACE_LOCK_MIN_SHARE}% ${raceName} population (currently ${Math.floor(share)}%)` };
    }
  }

  for (const prop of def.requireProperties || []) {
    if (!factionHasProperty(techAccount, prop)) {
      const label = content?.economy_schema?.properties?.[prop]?.label || prop;
      return { ok: false, error: `requires property: ${label}` };
    }
  }

  return { ok: true };
}
