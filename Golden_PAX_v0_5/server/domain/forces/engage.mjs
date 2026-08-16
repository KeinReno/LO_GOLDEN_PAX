/**
 * NOT a port — new design. Raised forces are combat-shaped composition
 * groups (recruitment.mjs) but until this file nothing applied
 * `resolveExchange`'s post-casualty groups back onto a persisted force.
 *
 * Combat loss is not a disband: an empty surviving composition means the
 * force is gone, and no population returns to any planet (that only
 * happens via recruitment.mjs's disbandUnits).
 *
 * Ground-unit defense/speed is mapped onto rolePower fields in
 * domain/combat/groundStats.mjs (called from resolveExchange).
 * Cross-kind engage (legion vs fleet) is rejected; boarding is a separate
 * action in domain/combat/boarding.mjs, not a flag on this path.
 */

/**
 * Same-kind forces may use resolveExchange; legion↔fleet must not
 * (ground units lack accuracy/armor/shields — a fake blowout, not a
 * modeled result). Boarding is the one exception and lives on its own
 * route/function, not here.
 *
 * @param {object} forceA
 * @param {object} forceB
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function canEngage(forceA, forceB) {
  if (!forceA || !forceB) return { ok: false, error: "not_found" };
  if (forceA.kind !== forceB.kind) return { ok: false, error: "cross_kind_engage_not_allowed" };
  if (!forceA.systemId || !forceB.systemId || forceA.systemId !== forceB.systemId) {
    return { ok: false, error: "not_same_system" };
  }
  return { ok: true };
}

/** Battlefield system for space-object / logistics mods. Body wins, else force location. */
export function resolveEngageSystemId(body, forceA, forceB) {
  return body?.systemId || forceA?.systemId || forceB?.systemId;
}

/**
 * @param {object} force  a forcesStore force (`id`, `composition`, …)
 * @param {object[]} survivingGroups  `resolveExchange`'s groupsA/groupsB (already pruned of count:0)
 * @returns {{ deleted: true, force: null } | { deleted: false, force: object }}
 */
export function forceAfterExchange(force, survivingGroups) {
  const groups = Array.isArray(survivingGroups) ? survivingGroups.filter((g) => (g.count || 0) > 0) : [];
  if (groups.length === 0) return { deleted: true, force: null };
  return { deleted: false, force: { ...force, composition: groups } };
}
