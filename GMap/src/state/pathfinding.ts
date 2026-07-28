import type { WorldState } from "./types";

/** Adjacent system ids via hyperlane graph. */
export function neighborIds(world: WorldState, systemId: string): string[] {
  const out: string[] = [];
  for (const link of world.links ?? []) {
    if (link.fromId === systemId) out.push(link.toId);
    else if (link.toId === systemId) out.push(link.fromId);
  }
  return out;
}

/** BFS hop distance along links; `Infinity` if unreachable. */
export function hopDistance(
  world: WorldState,
  fromId: string | null | undefined,
  toId: string | null | undefined,
): number {
  const path = hopPath(world, fromId, toId);
  if (!fromId || !toId) return Infinity;
  if (fromId === toId) return 0;
  if (path.length < 2) return Infinity;
  return path.length - 1;
}

/**
 * BFS shortest path of system ids (inclusive from→to).
 * Empty array if missing ids or unreachable (except same system → `[fromId]`).
 */
export function hopPath(
  world: WorldState,
  fromId: string | null | undefined,
  toId: string | null | undefined,
): string[] {
  if (!fromId || !toId) return [];
  if (fromId === toId) return [fromId];
  const q: string[] = [fromId];
  const parent = new Map<string, string | null>([[fromId, null]]);
  while (q.length) {
    const id = q.shift()!;
    for (const n of neighborIds(world, id)) {
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

/** Russian: N ход / хода / ходов (movement cost label). */
export function formatHopTurns(hops: number): string {
  if (!Number.isFinite(hops)) return "нет пути";
  if (hops === 0) return "0 ходов";
  const n = Math.abs(Math.trunc(hops));
  const mod10 = n % 10;
  const mod100 = n % 100;
  let word = "ходов";
  if (mod10 === 1 && mod100 !== 11) word = "ход";
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
    word = "хода";
  return `${n} ${word}`;
}
