import type { WorldState } from "./types";
import type { TravelMode } from "./pathfinding";
import { hopDistance, neighborIds } from "./pathfinding";
import { getCachedContent } from "./contentCatalog";

export function resolveMoveRangeHops(mode: TravelMode = "fleet"): number {
  const mov = getCachedContent()?.rules?.movement;
  const key = mode === "legion" ? "legionRangeHops" : "fleetRangeHops";
  const specific = mov?.[key as keyof typeof mov];
  if (specific != null && Number.isFinite(Number(specific))) {
    return Math.max(0, Math.floor(Number(specific)));
  }
  return Math.max(0, Math.floor(Number(mov?.rangeHops ?? 3)));
}

export function isWithinMoveRange(
  world: WorldState,
  fromId: string | null | undefined,
  toId: string | null | undefined,
  mode: TravelMode = "fleet",
): boolean {
  if (!fromId || !toId) return false;
  if (fromId === toId) return true;
  const maxHops = resolveMoveRangeHops(mode);
  const hops = hopDistance(world, fromId, toId, mode);
  return Number.isFinite(hops) && hops <= maxHops;
}

/** System ids reachable within movement radius (inclusive of origin). */
export function systemsWithinMoveRange(
  world: WorldState,
  fromId: string | null | undefined,
  mode: TravelMode = "fleet",
  maxHops = resolveMoveRangeHops(mode),
): Set<string> {
  const reached = new Set<string>();
  if (!fromId) return reached;
  reached.add(fromId);
  if (maxHops <= 0) return reached;
  const q: Array<{ id: string; hops: number }> = [{ id: fromId, hops: 0 }];
  let qi = 0;
  while (qi < q.length) {
    const { id, hops } = q[qi++]!;
    if (hops >= maxHops) continue;
    for (const n of neighborIds(world, id, mode)) {
      if (reached.has(n)) continue;
      reached.add(n);
      q.push({ id: n, hops: hops + 1 });
    }
  }
  return reached;
}
