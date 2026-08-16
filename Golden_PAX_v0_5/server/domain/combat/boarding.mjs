import { resolveExchange } from "./resolveExchange.mjs";

/**
 * Boarding — NOT a port. GMap has no boarding mechanic at all.
 *
 * A legion boards a fleet by fighting the fleet's persisted militia-shaped
 * crew (`crewCount` on each composition group, written at raise time in
 * recruitment.mjs), not the ship's combat stats. Both sides share ground
 * axes, so resolveExchange/casualties.mjs run unmodified — no degenerate
 * zeros from missing accuracy/armor/shields.
 *
 * Crew stance is "retreat": resolveExchange already disengages without a
 * fight when the retreating side's power is < 80% of the attacker. Heavily
 * outmatched crew don't fight; otherwise a normal exchange. Legion win
 * (or crew retreat) → capture (faction transfer is the caller's job via
 * forcesStore.transferForceFaction). Legion loss → normal casualties.
 *
 * Future extension (not built): race-dependent crewlessness (drone/android
 * factions with 0-crew, effectively unboardable ships).
 */

const MILITIA_ID = "unit.militia";

/**
 * @param {object} legionForce
 * @param {object} fleetForce
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function canBoard(legionForce, fleetForce) {
  if (!legionForce || !fleetForce) return { ok: false, error: "not_found" };
  if (legionForce.id && fleetForce.id && legionForce.id === fleetForce.id) {
    return { ok: false, error: "same_force" };
  }
  if (legionForce.kind !== "legion") return { ok: false, error: "boarder_must_be_legion" };
  if (fleetForce.kind !== "fleet") return { ok: false, error: "target_must_be_fleet" };
  return { ok: true };
}

/** Sum persisted crewCount — never recompute from tier/crewPerTier. */
export function totalCrewCount(force) {
  return (force?.composition || []).reduce((s, g) => s + (Number(g.crewCount) || 0), 0);
}

/**
 * @param {number} crewCount
 * @param {object} militia  content.units["unit.militia"]
 */
export function syntheticCrewGroup(crewCount, militia) {
  const stats = militia?.stats || {};
  return {
    defId: militia?.id || MILITIA_ID,
    tier: Number(militia?.tier) || 1,
    roles: militia?.roles || ["infantry"],
    count: Math.max(0, Math.floor(Number(crewCount) || 0)),
    ...stats,
    maxHp: stats.hp ?? 0,
  };
}

/**
 * Write surviving crew back onto the fleet's ship groups. Does not replace
 * the ship composition with the synthetic militia group.
 *
 * @param {object[]} composition
 * @param {number} survivingCrew
 * @returns {object[]}
 */
export function applySurvivingCrew(composition, survivingCrew) {
  const groups = Array.isArray(composition) ? composition.map((g) => ({ ...g })) : [];
  if (groups.length === 0) return groups;
  const survivors = Math.max(0, Math.floor(Number(survivingCrew) || 0));
  const total = groups.reduce((s, g) => s + (Number(g.crewCount) || 0), 0);
  if (total <= 0) {
    groups[0] = { ...groups[0], crewCount: survivors };
    return groups;
  }
  let remaining = survivors;
  for (let i = 0; i < groups.length; i++) {
    const orig = Number(groups[i].crewCount) || 0;
    if (i === groups.length - 1) {
      groups[i] = { ...groups[i], crewCount: remaining };
    } else {
      const share = Math.floor(survivors * (orig / total));
      groups[i] = { ...groups[i], crewCount: share };
      remaining -= share;
    }
  }
  return groups;
}

/**
 * @param {object} legionForce
 * @param {object} fleetForce
 * @param {object} content
 * @returns {object} resolveExchange shape plus `captured` and `fleetComposition`
 */
export function resolveBoarding(legionForce, fleetForce, content) {
  const gate = canBoard(legionForce, fleetForce);
  if (!gate.ok) return gate;

  const militia = content?.units?.[MILITIA_ID];
  if (!militia) return { ok: false, error: "missing_militia_def" };

  const crewCount = totalCrewCount(fleetForce);
  const crewGroups = crewCount > 0 ? [syntheticCrewGroup(crewCount, militia)] : [];
  const result = resolveExchange(
    legionForce.composition || [],
    crewGroups,
    {
      stanceA: "hold",
      stanceB: "retreat",
      factionIdA: legionForce.factionId,
      factionIdB: fleetForce.factionId,
    },
    content,
  );
  if (!result.ok) return result;

  const captured = result.outcome === "win_a" || result.outcome === "retreat_b";
  const survivingCrew = (result.groupsB || []).reduce((s, g) => s + (Number(g.count) || 0), 0);
  const fleetComposition = applySurvivingCrew(fleetForce.composition, survivingCrew);
  return { ...result, captured, fleetComposition };
}
