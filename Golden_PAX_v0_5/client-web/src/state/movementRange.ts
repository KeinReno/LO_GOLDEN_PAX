import type { LinkGraph } from "./pathfinding";
import { hopDistance, neighborIds, type TravelMode } from "./pathfinding";

/** Default from content/core/rules.json movement.rangeHops until content GET exists. */
export const DEFAULT_RANGE_HOPS = 3;

export function resolveMoveRangeHops(mode: TravelMode = "fleet"): number {
  const key = mode === "legion" ? "legionRangeHops" : "fleetRangeHops";
  // Client preview only — server authorizes actual move.
  void key;
  return DEFAULT_RANGE_HOPS;
}

export function isWithinMoveRange(
  graph: LinkGraph,
  fromId: string | null | undefined,
  toId: string | null | undefined,
  mode: TravelMode = "fleet",
): boolean {
  if (!fromId || !toId) return false;
  if (fromId === toId) return true;
  const maxHops = resolveMoveRangeHops(mode);
  const hops = hopDistance(graph, fromId, toId, mode);
  return Number.isFinite(hops) && hops <= maxHops;
}

export function systemsWithinMoveRange(
  graph: LinkGraph,
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
    for (const n of neighborIds(graph, id, mode)) {
      if (reached.has(n)) continue;
      reached.add(n);
      q.push({ id: n, hops: hops + 1 });
    }
  }
  return reached;
}
