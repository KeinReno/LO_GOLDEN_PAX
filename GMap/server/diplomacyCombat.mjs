/** Shared war detection for combat gates (server). */

export function diplomacyEdgeIsWar(edge) {
  if (!edge) return false;
  const r = edge.relation ?? edge.status ?? edge.state;
  return r === "war";
}

export function factionsAtWar(world, aId, bId) {
  if (!aId || !bId || aId === bId) return false;
  const [x, y] = aId < bId ? [aId, bId] : [bId, aId];
  const edge = (world.diplomacy ?? []).find(
    (e) => e.aId === x && e.bId === y && (!e.track || e.track === "political"),
  );
  if (diplomacyEdgeIsWar(edge)) return true;
  return (world.diplomacy ?? []).some((e) => {
    if (!diplomacyEdgeIsWar(e)) return false;
    return (
      (e.aId === aId && e.bId === bId) || (e.aId === bId && e.bId === aId)
    );
  });
}
