import type { LinkView } from "./viewTypes";

export type TravelMode = "fleet" | "legion" | "any";

export interface LinkGraph {
  links: LinkView[];
}

export function linkAllowsTravel(type: string | undefined, mode: TravelMode = "any"): boolean {
  if (mode === "any" || mode === "legion") return true;
  return type !== "damyl_planet";
}

export function neighborIds(graph: LinkGraph, systemId: string, mode: TravelMode = "any"): string[] {
  const out: string[] = [];
  for (const link of graph.links) {
    if (!linkAllowsTravel(link.type, mode)) continue;
    if (link.fromId === systemId) out.push(link.toId);
    else if (link.toId === systemId) out.push(link.fromId);
  }
  return out;
}

export function hopDistance(
  graph: LinkGraph,
  fromId: string | null | undefined,
  toId: string | null | undefined,
  mode: TravelMode = "any",
): number {
  const path = hopPath(graph, fromId, toId, mode);
  if (!fromId || !toId) return Infinity;
  if (fromId === toId) return 0;
  if (path.length < 2) return Infinity;
  return path.length - 1;
}

export function hopPath(
  graph: LinkGraph,
  fromId: string | null | undefined,
  toId: string | null | undefined,
  mode: TravelMode = "any",
): string[] {
  if (!fromId || !toId) return [];
  if (fromId === toId) return [fromId];
  const q: string[] = [fromId];
  const parent = new Map<string, string | null>([[fromId, null]]);
  while (q.length) {
    const id = q.shift()!;
    for (const n of neighborIds(graph, id, mode)) {
      if (parent.has(n)) continue;
      parent.set(n, id);
      if (n === toId) {
        const path: string[] = [];
        let cur: string | null = toId;
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
