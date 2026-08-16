import type { TechnologyDef } from "../../../state/contentCatalog";

export type GraphNode = { id: string; x: number; y: number; tech: TechnologyDef };
export type GraphEdge = { from: string; to: string };
export type TechGraphLayout = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  maxX: number;
  maxY: number;
};

const COLLISION_GUARD = 200;

/**
 * Deterministic era-column layout. x is always `(era || 1) - 1`;
 * y is a greedy lane: mean of already-placed same-or-earlier prereqs,
 * else the next free lane in that column. Collisions shift down.
 */
export function buildTechGraphLayout(techs: TechnologyDef[]): TechGraphLayout {
  if (techs.length === 0) {
    return { nodes: [], edges: [], maxX: 0, maxY: 0 };
  }

  const idSet = new Set<string>();
  for (const tech of techs) idSet.add(tech.id);

  const indexed = techs.map((tech, index) => ({ tech, index }));
  indexed.sort((a, b) => {
    const eraA = a.tech.era || 1;
    const eraB = b.tech.era || 1;
    if (eraA !== eraB) return eraA - eraB;
    return a.index - b.index;
  });

  const placed = new Map<string, GraphNode>();
  const order: string[] = [];
  const nextYByCol = new Map<number, number>();

  for (const { tech } of indexed) {
    const x = (tech.era || 1) - 1;
    const prereqYs: number[] = [];
    for (const pid of tech.prerequisites || []) {
      const prev = placed.get(pid);
      if (!prev) continue;
      if (prev.x <= x) prereqYs.push(prev.y);
    }

    let y: number;
    if (prereqYs.length > 0) {
      const sum = prereqYs.reduce((s, v) => s + v, 0);
      y = Math.round(sum / prereqYs.length);
    } else {
      y = nextYByCol.get(x) ?? 0;
      nextYByCol.set(x, y + 1);
    }

    const node: GraphNode = { id: tech.id, x, y, tech };
    placed.set(tech.id, node);
    order.push(tech.id);
  }

  const occupied = new Set<string>();
  for (const id of order) {
    const node = placed.get(id);
    if (!node) continue;
    let guard = 0;
    while (occupied.has(`${node.x},${node.y}`) && guard < COLLISION_GUARD) {
      node.y += 1;
      guard += 1;
    }
    occupied.add(`${node.x},${node.y}`);
  }

  const edges: GraphEdge[] = [];
  for (const { tech } of indexed) {
    for (const pid of tech.prerequisites || []) {
      if (!idSet.has(pid)) continue;
      edges.push({ from: pid, to: tech.id });
    }
  }

  const nodes = order.map((id) => placed.get(id)!);
  let maxX = 0;
  let maxY = 0;
  for (const n of nodes) {
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }

  return { nodes, edges, maxX, maxY };
}
