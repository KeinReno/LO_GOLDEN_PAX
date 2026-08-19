/**
 * When an engagement can no longer be fought in its theater.
 * Card battles currently skip the auto timeout (`continue` while status=active);
 * ghost factionIds and fleets that already left the system must cancel, not fight at range.
 */
export function fleetLocationId(fleet) {
  return (
    fleet?.systemId ||
    fleet?.locationSystemId ||
    fleet?.location?.systemId ||
    null
  );
}

export function engagementHasGhostFaction(world, eng) {
  const ids = new Set((world?.factions || []).map((f) => f.id));
  return (eng?.sides || []).some(
    (s) => s?.factionId && !ids.has(s.factionId),
  );
}

export function engagementForcesLeftTheater(world, eng) {
  const sys = eng?.systemId;
  if (!sys) return false;
  const fleets = new Map((world?.fleets || []).map((f) => [f.id, f]));
  for (const side of eng?.sides || []) {
    for (const fid of side?.fleetIds || []) {
      const fl = fleets.get(fid);
      if (!fl) continue;
      const loc = fleetLocationId(fl);
      if (loc && loc !== sys) return true;
    }
  }
  return false;
}

export function shouldAbandonEngagement(world, eng) {
  return (
    engagementHasGhostFaction(world, eng) ||
    engagementForcesLeftTheater(world, eng)
  );
}

export function abandonReason(world, eng) {
  if (engagementHasGhostFaction(world, eng)) return "ghost_faction";
  if (engagementForcesLeftTheater(world, eng)) return "left_theater";
  return "abandoned";
}
