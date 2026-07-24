import { v4 as uuid } from "uuid";
import type { BrushSettings, StarSystem, SystemLink } from "../state/types";
import { createRandomSystem, createRng } from "./systemFactory";

export interface Point {
  x: number;
  y: number;
}

/**
 * Place star systems along a freehand brush stroke.
 * Does NOT assign factions/states — those are a separate layer.
 */
export function generateAlongBrush(
  stroke: Point[],
  existing: StarSystem[],
  settings: BrushSettings,
  nextNameIndex: number,
  seed?: number,
): { systems: StarSystem[]; links: SystemLink[] } {
  if (stroke.length < 2) {
    return { systems: [], links: [] };
  }

  const rnd = createRng(seed);
  const placed: StarSystem[] = [];
  const minDist = settings.minDistance;
  const density = Math.max(0.05, settings.density);

  // Sample candidate points along the polyline
  const candidates: Point[] = [];
  let carry = 0;
  const step = Math.max(8, minDist * (0.55 / density));

  for (let i = 1; i < stroke.length; i++) {
    const a = stroke[i - 1]!;
    const b = stroke[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) continue;

    let t = carry;
    while (t < len) {
      const u = t / len;
      const jitter = (rnd() - 0.5) * minDist * 0.6;
      const px = a.x + dx * u;
      const py = a.y + dy * u;
      const nx = -dy / len;
      const ny = dx / len;
      candidates.push({ x: px + nx * jitter, y: py + ny * jitter });
      t += step;
    }
    carry = t - len;
  }

  const all = [...existing];

  for (const c of candidates) {
    if (rnd() > density) continue;
    if (!isFarEnough(c, all, minDist) || !isFarEnough(c, placed, minDist)) {
      continue;
    }
    const kind =
      rnd() < settings.corridorChance ? ("corridor" as const) : ("stellar" as const);
    const sys = createRandomSystem(
      c.x,
      c.y,
      rnd,
      nextNameIndex + placed.length,
      settings.resourceChance,
      kind,
    );
    placed.push(sys);
    all.push(sys);
  }

  const links = buildLocalLinks(placed, settings.linkDistance);

  return { systems: placed, links };
}

function isFarEnough(p: Point, systems: StarSystem[], minDist: number): boolean {
  const d2 = minDist * minDist;
  for (const s of systems) {
    const dx = s.x - p.x;
    const dy = s.y - p.y;
    if (dx * dx + dy * dy < d2) return false;
  }
  return true;
}

function buildLocalLinks(
  systems: StarSystem[],
  linkDistance: number,
): SystemLink[] {
  const links: SystemLink[] = [];
  const d2 = linkDistance * linkDistance;

  for (let i = 0; i < systems.length; i++) {
    const a = systems[i]!;
    const neighbors: { j: number; d: number }[] = [];
    for (let j = 0; j < systems.length; j++) {
      if (i === j) continue;
      const b = systems[j]!;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = dx * dx + dy * dy;
      if (dist <= d2) neighbors.push({ j, d: dist });
    }
    neighbors.sort((x, y) => x.d - y.d);
    const maxLinks = Math.min(3, neighbors.length);
    for (let k = 0; k < maxLinks; k++) {
      const j = neighbors[k]!.j;
      if (i >= j) continue;
      links.push({
        id: uuid(),
        fromId: a.id,
        toId: systems[j]!.id,
        type: "corridor",
      });
    }
  }

  return links;
}
