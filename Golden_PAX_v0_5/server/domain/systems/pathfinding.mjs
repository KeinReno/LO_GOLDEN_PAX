/**
 * Server-side BFS hop path along hyperlane links.
 * Ported from GMap/server/pathfinding.mjs (exported + pure there).
 *
 * Fleet: all link types except damyl_planet (infantry gates).
 * Legion: all link types.
 * any: unrestricted (fog / generic graph walks).
 */

export function linkAllowsTravel(type, mode = "any") {
  if (mode === "any" || mode === "legion") return true;
  return type !== "damyl_planet";
}

export function neighborIds(world, systemId, mode = "any") {
  const out = [];
  for (const link of world.links ?? []) {
    if (!linkAllowsTravel(link.type, mode)) continue;
    if (link.fromId === systemId) out.push(link.toId);
    else if (link.toId === systemId) out.push(link.fromId);
  }
  return out;
}

/**
 * Shortest path of system ids (inclusive from→to).
 * [] if unreachable; [fromId] if same system.
 */
export function hopPath(world, fromId, toId, mode = "any") {
  if (!fromId || !toId) return [];
  if (fromId === toId) return [fromId];
  const q = [fromId];
  const parent = new Map([[fromId, null]]);
  while (q.length) {
    const id = q.shift();
    for (const n of neighborIds(world, id, mode)) {
      if (parent.has(n)) continue;
      parent.set(n, id);
      if (n === toId) {
        const path = [];
        let cur = toId;
        while (cur) {
          path.push(cur);
          cur = parent.get(cur) ?? null;
        }
        path.reverse();
        return path;
      }
      q.push(n);
    }
  }
  return [];
}
