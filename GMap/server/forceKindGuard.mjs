/**
 * Cross-kind engage guard (v0.5 port).
 *
 * Homogeneous fleets/legions may use the normal engagement path.
 * Legion↔fleet through that path is a fake blowout (ground units lack
 * ship accuracy/armor/shields). Boarding is the one exception and lives
 * in boarding.mjs — not a flag on engage.
 */

/**
 * First-pass ship crew size: count × tier × crewPerTier.
 * Persisted on the composition group at raise; boarding prefers that field.
 * 0 for ground units. Race-dependent crewlessness is deferred.
 *
 * @param {"ship"|"unit"|"fleet"|"legion"} kind
 * @param {object} def
 * @param {number} count
 * @param {number} [crewPerTier]
 */
export function crewCountForRaise(kind, def, count, crewPerTier) {
  if (kind !== "ship" && kind !== "fleet") return 0;
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const tier = Math.max(1, Number(def?.tier) || 1);
  const per = Math.max(0, Number(crewPerTier) || 0);
  return n * tier * per;
}

/**
 * Same-kind forces may engage; legion↔fleet must not.
 *
 * @param {object} forceA  `{ kind, systemId }`
 * @param {object} forceB
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function canEngage(forceA, forceB) {
  if (!forceA || !forceB) return { ok: false, error: "not_found" };
  if (forceA.id && forceB.id && forceA.id === forceB.id) {
    return { ok: false, error: "same_force" };
  }
  if (forceA.kind !== forceB.kind) {
    return { ok: false, error: "cross_kind_engage_not_allowed" };
  }
  if (!forceA.systemId || !forceB.systemId || forceA.systemId !== forceB.systemId) {
    return { ok: false, error: "not_same_system" };
  }
  return { ok: true };
}

/**
 * Homogeneous side: fleet-only or legion-only. Mixed (combined arms /
 * planetary assault) is not a cross-kind *force* duel.
 *
 * @param {{ fleetIds?: string[], legionIds?: string[] }} side
 * @returns {"fleet"|"legion"|"mixed"|"empty"}
 */
export function sideForceKind(side) {
  const fleets = (side?.fleetIds || []).length;
  const legs = (side?.legionIds || []).length;
  if (fleets && legs) return "mixed";
  if (fleets) return "fleet";
  if (legs) return "legion";
  return "empty";
}

/**
 * Reject a force-vs-force engagement whose sides are homogeneous and
 * different kinds. Planetary assault (caller sets `allowPlanetaryAssault`)
 * and mixed combined-arms sides are unchanged.
 *
 * @param {object} sideA
 * @param {object} sideB
 * @param {{ allowPlanetaryAssault?: boolean }} [opts]
 */
export function canEngageSides(sideA, sideB, opts = {}) {
  if (opts.allowPlanetaryAssault) return { ok: true };
  const a = sideForceKind(sideA);
  const b = sideForceKind(sideB);
  if (a === "empty" || b === "empty") return { ok: true };
  if (a === "mixed" || b === "mixed") return { ok: true };
  if (a !== b) return { ok: false, error: "cross_kind_engage_not_allowed" };
  return { ok: true };
}

/**
 * Persist post-exchange composition, or drop the force if nothing remains.
 *
 * @param {object} force
 * @param {object[]} survivingGroups
 */
export function forceAfterExchange(force, survivingGroups) {
  const groups = Array.isArray(survivingGroups)
    ? survivingGroups.filter((g) => (g.count || 0) > 0)
    : [];
  if (groups.length === 0) return { deleted: true, force: null };
  return { deleted: false, force: { ...force, composition: groups } };
}
