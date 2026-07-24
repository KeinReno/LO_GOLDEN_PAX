import type {
  Caravan,
  Quest,
  StarSystem,
  SystemLink,
  WorldState,
} from "./types";
import { isStatePolity } from "./territory";

/** Default jump range ring (world units). */
export const DEFAULT_JUMP_RANGE = 160;

export function linkCargoMode(
  type: SystemLink["type"],
): "fleet" | "legion" | "any" {
  if (type === "damyl_space") return "fleet";
  if (type === "damyl_planet") return "legion";
  return "any";
}

export function linkTypeLabel(type: SystemLink["type"]): string {
  switch (type) {
    case "corridor":
      return "Коридор";
    case "gate":
      return "Врата";
    case "unstable":
      return "Нестабильный";
    case "damyl_space":
      return "Дамильские космические врата (флот)";
    case "damyl_planet":
      return "Дамильские межпланетные врата (пехота)";
    default:
      return type;
  }
}

/** Capitals for a faction (primary owner). */
export function factionCapitals(
  world: WorldState,
  factionId: string,
): StarSystem[] {
  return world.systems.filter(
    (s) => s.isCapital && s.ownerFactionId === factionId,
  );
}

/** Systems owned or co-owned by faction. */
export function factionHeldSystems(
  world: WorldState,
  factionId: string,
): StarSystem[] {
  return world.systems.filter(
    (s) =>
      s.ownerFactionId === factionId ||
      (s.coOwnerFactionIds ?? []).includes(factionId),
  );
}

/**
 * Supply spokes: capital → held systems that share a link path
 * through held territory (BFS). Falls back to direct spokes.
 */
export function buildSupplySpokes(
  world: WorldState,
  factionId: string,
): { from: StarSystem; to: StarSystem }[] {
  const held = new Map(
    factionHeldSystems(world, factionId).map((s) => [s.id, s]),
  );
  if (held.size === 0) return [];
  const capitals = factionCapitals(world, factionId).filter((c) =>
    held.has(c.id),
  );
  if (capitals.length === 0) {
    const first = [...held.values()][0];
    if (!first) return [];
    capitals.push(first);
  }

  const adj = new Map<string, string[]>();
  for (const s of held.values()) adj.set(s.id, []);
  for (const link of world.links) {
    if (!held.has(link.fromId) || !held.has(link.toId)) continue;
    if (link.type === "damyl_planet") continue;
    adj.get(link.fromId)!.push(link.toId);
    adj.get(link.toId)!.push(link.fromId);
  }

  const reachable = new Set<string>();
  const queue = capitals.map((c) => c.id);
  for (const id of queue) reachable.add(id);
  while (queue.length) {
    const id = queue.shift()!;
    for (const n of adj.get(id) ?? []) {
      if (reachable.has(n)) continue;
      reachable.add(n);
      queue.push(n);
    }
  }

  const spokes: { from: StarSystem; to: StarSystem }[] = [];
  const capital = capitals[0]!;
  for (const s of held.values()) {
    if (s.id === capital.id) continue;
    if (!reachable.has(s.id) && adj.size > 0) {
      /* cut off — still draw faint spoke for RP */
    }
    spokes.push({ from: capital, to: s });
  }
  return spokes;
}

export function caravanWorldPos(
  world: WorldState,
  c: Caravan,
): { x: number; y: number } | null {
  const a = world.systems.find((s) => s.id === c.fromSystemId);
  const b = world.systems.find((s) => s.id === c.toSystemId);
  if (!a || !b) return null;
  const t = Math.min(1, Math.max(0, c.progress));
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function advanceCaravans(caravans: Caravan[]): Caravan[] {
  return caravans.map((c) => {
    let progress = c.progress + 0.12;
    let fromSystemId = c.fromSystemId;
    let toSystemId = c.toSystemId;
    if (progress >= 1) {
      progress = 0;
      fromSystemId = c.toSystemId;
      toSystemId = c.fromSystemId;
    }
    return { ...c, progress, fromSystemId, toSystemId };
  });
}

export function driftAnomalies(systems: StarSystem[]): StarSystem[] {
  return systems.map((s) => {
    const m = s.anomalyMotion;
    if (!m) return s;
    if (!m.driftDx && !m.driftDy) return s;
    return {
      ...s,
      x: s.x + m.driftDx,
      y: s.y + m.driftDy,
    };
  });
}

export function hubSystems(world: WorldState): StarSystem[] {
  return world.systems.filter(
    (s) => s.trafficHub || s.poiType === "hub" || s.activity === "trade",
  );
}

/** Soft traffic threads from hub to nearby systems. */
export function trafficThreads(
  world: WorldState,
  maxDist = 140,
): { ax: number; ay: number; bx: number; by: number }[] {
  const hubs = hubSystems(world);
  const out: { ax: number; ay: number; bx: number; by: number }[] = [];
  for (const h of hubs) {
    for (const s of world.systems) {
      if (s.id === h.id) continue;
      const d = Math.hypot(s.x - h.x, s.y - h.y);
      if (d > maxDist || d < 20) continue;
      out.push({ ax: h.x, ay: h.y, bx: s.x, by: s.y });
    }
  }
  return out;
}

export function questsAtSystem(
  world: WorldState,
  systemId: string,
): Quest[] {
  return (world.quests ?? []).filter(
    (q) => q.systemId === systemId && q.status !== "hidden",
  );
}

export function clampRep(n: number): number {
  return Math.max(-100, Math.min(100, Math.round(n)));
}

export function isStateFaction(world: WorldState, factionId: string): boolean {
  const f = world.factions.find((x) => x.id === factionId);
  return isStatePolity(f);
}
