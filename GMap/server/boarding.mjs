/**
 * Boarding — v0.5 port into GMap (GMap previously had no boarding mechanic).
 *
 * A legion boards a fleet by fighting the fleet's militia-shaped crew, not
 * the ship's combat stats. Both sides share ground axes, so
 * resolveEngagementFight / applyCasualties run unmodified — no degenerate
 * zeros from missing accuracy/armor/shields.
 *
 * Crew comes from persisted `crewCount` on each composition group (written
 * at raise in forceRecruit.mjs). If a live fleet has no crewCount yet,
 * first-pass fallback is count × tier × crewPerTier (economy_balance.forces,
 * currently 5).
 *
 * Crew stance is "retreat": resolveEngagementFight already disengages
 * without a fight when the retreating side's power is < 80% of the attacker.
 * Legion win or crew retreat → capture (fleet.factionId transfers).
 * Legion loss → normal casualties.
 *
 * Future extension (not built): race-dependent crewlessness (drone/android
 * factions with 0-crew, effectively unboardable ships).
 */
import { resolveEngagementFight, cleanupEmptyComposition } from "./combatResolve.mjs";
import { getContent } from "./contentLoader.mjs";
import { crewCountForRaise } from "./forceKindGuard.mjs";

const MILITIA_ID = "unit.militia";
const CREW_LEGION_ID = "__boarding_crew__";

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

function groupTier(group, content) {
  if (Number(group?.tier) > 0) return Number(group.tier);
  const defId = group?.defId || group?.type;
  const def =
    content?.ships?.[defId] ||
    Object.values(content?.ships || {}).find((s) => s.id === defId || s.name === defId);
  return Math.max(1, Number(def?.tier) || 1);
}

/**
 * Sum persisted crewCount. If no group has the field, first-pass
 * count × tier × crewPerTier (existing fleets raised before this port).
 *
 * @param {object} force
 * @param {object} [content]
 */
export function totalCrewCount(force, content) {
  const groups = force?.composition || [];
  const anyPersisted = groups.some((g) => g.crewCount != null);
  if (anyPersisted) {
    return groups.reduce((s, g) => s + (Number(g.crewCount) || 0), 0);
  }
  const per =
    content?.economy_balance?.forces?.crewPerTier ?? 5;
  return groups.reduce((s, g) => {
    return s + crewCountForRaise("ship", { tier: groupTier(g, content) }, g.count || 0, per);
  }, 0);
}

/**
 * @param {number} crewCount
 * @param {object} militia  content.units["unit.militia"]
 */
export function syntheticCrewGroup(crewCount, militia) {
  const stats = militia?.stats || {};
  return {
    defId: militia?.id || MILITIA_ID,
    type: militia?.name || militia?.id || MILITIA_ID,
    tier: Number(militia?.tier) || 1,
    roles: militia?.roles || ["infantry"],
    count: Math.max(0, Math.floor(Number(crewCount) || 0)),
    ...stats,
    hp: stats.hp ?? 70,
    maxHp: stats.hp ?? 70,
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
 * @param {object} legionForce  world legion (`kind` should be "legion")
 * @param {object} fleetForce   world fleet (`kind` should be "fleet")
 * @param {object} [content]
 * @param {object} [world]
 * @returns {object} fight result plus `captured` and `fleetComposition`
 */
export function resolveBoarding(legionForce, fleetForce, content, world = {}) {
  const gate = canBoard(legionForce, fleetForce);
  if (!gate.ok) return gate;

  const pack = content || getContent();
  const militia = pack?.units?.[MILITIA_ID];
  if (!militia) return { ok: false, error: "missing_militia_def" };

  const crewCount = totalCrewCount(fleetForce, pack);
  const crewComposition =
    crewCount > 0 ? [syntheticCrewGroup(crewCount, militia)] : [];
  const crewLegion = {
    id: CREW_LEGION_ID,
    factionId: fleetForce.factionId,
    systemId: fleetForce.systemId || legionForce.systemId,
    composition: crewComposition,
    strength: crewCount,
  };

  const fightWorld = {
    ...world,
    fleets: world.fleets || [],
    legions: [
      ...(world.legions || []).filter((l) => l.id === legionForce.id),
      legionForce,
      crewLegion,
    ].filter((l, i, arr) => arr.findIndex((x) => x.id === l.id) === i),
    systems: world.systems || [],
    factions: world.factions || [],
  };

  const engagement = {
    theater: "ground",
    systemId: legionForce.systemId || fleetForce.systemId,
    sides: [
      {
        factionId: legionForce.factionId,
        fleetIds: [],
        legionIds: [legionForce.id],
        stance: "hold",
      },
      {
        factionId: fleetForce.factionId,
        fleetIds: [],
        legionIds: [CREW_LEGION_ID],
        stance: "retreat",
      },
    ],
  };

  const result = resolveEngagementFight(fightWorld, engagement);
  if (!result.ok) return result;

  const captured = result.outcome === "win_a" || result.outcome === "retreat_b";
  const survivingCrew = (crewLegion.composition || []).reduce(
    (s, g) => s + (Number(g.count) || 0),
    0,
  );
  const fleetComposition = applySurvivingCrew(fleetForce.composition, survivingCrew);
  return {
    ...result,
    captured,
    fleetComposition,
    groupsA: legionForce.composition || [],
    groupsB: crewLegion.composition || [],
  };
}

/**
 * Mutate world: legion casualties, fleet crew + optional faction capture.
 * Caller persists (writeLiveBoard). Domain-pure — no Express.
 *
 * @param {{ world: object, factionId: string, legionId: string, targetFleetId: string, content?: object }} opts
 */
export function applyBoardingToWorld(opts) {
  const { world, factionId, legionId, targetFleetId } = opts;
  if (!world) return { ok: false, error: "no_world" };
  if (!factionId) return { ok: false, error: "no_faction" };

  const legion = (world.legions || []).find((l) => l.id === legionId);
  const fleet = (world.fleets || []).find((f) => f.id === targetFleetId);
  if (!legion) return { ok: false, error: "legion_not_found" };
  if (!fleet) return { ok: false, error: "fleet_not_found" };
  if (legion.factionId !== factionId) return { ok: false, error: "not_owner" };

  legion.kind = "legion";
  fleet.kind = "fleet";

  if (
    legion.systemId &&
    fleet.systemId &&
    legion.systemId !== fleet.systemId
  ) {
    return { ok: false, error: "not_same_system" };
  }

  const content = opts.content || getContent();
  const result = resolveBoarding(legion, fleet, content, world);
  if (!result.ok) return result;

  fleet.composition = result.fleetComposition;
  if (result.captured) {
    fleet.factionId = legion.factionId;
  }
  if (Array.isArray(legion.composition)) {
    legion.strength = legion.composition.reduce(
      (s, g) => s + (g.count || 0),
      0,
    );
  }
  cleanupEmptyComposition(world);
  return {
    ok: true,
    captured: result.captured,
    outcome: result.outcome,
    powerA: result.powerA,
    powerB: result.powerB,
    lossesA: result.lossesA,
    lossesB: result.lossesB,
    legion,
    fleet,
  };
}

export { crewCountForRaise, MILITIA_ID };
