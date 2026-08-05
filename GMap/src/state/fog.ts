import type { Faction, WorldState } from "./types";
import { neighborIds } from "./pathfinding";

/** Hop expansion from owned / presence / permanent-reveal cores (editor preview). */
export const VISION_SYSTEM_HOPS = 1;
/** Hop expansion from own fleet / legion positions (editor preview). */
export const VISION_FLEET_HOPS = 1;

function expandVisionHops(
  world: WorldState,
  startIds: Iterable<string>,
  maxHops: number,
): Set<string> {
  const added = new Set<string>();
  if (maxHops <= 0) return added;
  const dist = new Map<string, number>();
  const q: string[] = [];
  for (const id of startIds) {
    if (!id) continue;
    dist.set(id, 0);
    q.push(id);
  }
  while (q.length) {
    const id = q.shift()!;
    const d = dist.get(id) ?? 0;
    if (d >= maxHops) continue;
    for (const n of neighborIds(world, id)) {
      if (dist.has(n)) continue;
      dist.set(n, d + 1);
      added.add(n);
      q.push(n);
    }
  }
  return added;
}

/** Faction flagged with fullMapVision sees the whole star map. */
export function factionHasFullMapVision(faction: Faction | undefined): boolean {
  if (!faction) return false;
  return faction.fullMapVision === true;
}

export function fullMapVisionFactionIds(world: WorldState): string[] {
  return (world.factions ?? [])
    .filter((f) => factionHasFullMapVision(f))
    .map((f) => f.id);
}

/** Stamp omniscient factions onto a system's visibility list. */
export function withFullMapVision(world: WorldState, visibleTo: string[]): string[] {
  const set = new Set(visibleTo);
  for (const id of fullMapVisionFactionIds(world)) set.add(id);
  return [...set];
}

/** Which systems a faction can see. Owner always sees own systems. */
export function getVisibleSystemIds(
  world: WorldState,
  factionId: string,
): Set<string> {
  const faction = world.factions?.find((f) => f.id === factionId);
  if (factionHasFullMapVision(faction)) {
    return new Set((world.systems ?? []).map((s) => s.id));
  }

  const visible = new Set<string>();
  for (const s of world.systems) {
    if (s.ownerFactionId === factionId) visible.add(s.id);
    if (s.visibleToFactionIds?.includes(factionId)) visible.add(s.id);
  }
  // Own fleets reveal their current system
  for (const f of world.fleets) {
    if (f.factionId === factionId) visible.add(f.systemId);
  }
  for (const l of world.legions ?? []) {
    if (l.factionId === factionId) visible.add(l.systemId);
  }

  const fleetSystemIds = new Set<string>();
  const legionSystemIds = new Set<string>();
  for (const f of world.fleets) {
    if (f.factionId === factionId && f.systemId) fleetSystemIds.add(f.systemId);
  }
  for (const l of world.legions ?? []) {
    if (l.factionId === factionId && l.systemId) legionSystemIds.add(l.systemId);
  }

  const systemHopSeeds = new Set<string>();
  for (const s of world.systems) {
    const id = s.id;
    const owned = s.ownerFactionId === factionId;
    const fleetHere = fleetSystemIds.has(id);
    const legionHere = legionSystemIds.has(id);
    if (owned || fleetHere || legionHere) systemHopSeeds.add(id);
  }
  for (const id of expandVisionHops(world, systemHopSeeds, VISION_SYSTEM_HOPS)) {
    visible.add(id);
  }

  const fleetHopSeeds = new Set([...fleetSystemIds, ...legionSystemIds]);
  for (const id of expandVisionHops(world, fleetHopSeeds, VISION_FLEET_HOPS)) {
    visible.add(id);
  }

  return visible;
}

/** Apply server fog mask — owned / fleet / legion presence overrides hide. */
export function applyFogMaskToVisibility(
  world: WorldState,
  factionId: string,
  visible: Set<string>,
  mask: Set<string>,
): Set<string> {
  if (mask.size === 0) return visible;
  const out = new Set(visible);
  for (const id of mask) {
    const sys = world.systems.find((s) => s.id === id);
    const owned = sys?.ownerFactionId === factionId;
    const fleetHere = world.fleets.some(
      (f) => f.factionId === factionId && f.systemId === id,
    );
    const legionHere = (world.legions ?? []).some(
      (l) => l.factionId === factionId && l.systemId === id,
    );
    if (!(owned || fleetHere || legionHere)) {
      out.delete(id);
    }
  }
  return out;
}

/** Player-visible systems including server fog mask (editor / GM preview). */
export function getVisibleSystemIdsWithFog(
  world: WorldState,
  factionId: string,
  fogMask: string[] = [],
): Set<string> {
  const base = getVisibleSystemIds(world, factionId);
  return applyFogMaskToVisibility(
    world,
    factionId,
    base,
    new Set(fogMask),
  );
}

/**
 * GM map view: when omniscient is off, return the same subset a player would get.
 * Full campaign stays in the store for editing; only the canvas view is sliced.
 */
export function resolveEditorViewWorld(
  world: WorldState,
  opts: {
    activeFactionId: string | null;
    gmOmniscientView: boolean;
    fogMask?: string[];
  },
): WorldState {
  if (opts.gmOmniscientView || !opts.activeFactionId) return world;
  return filterWorldForFaction(
    world,
    opts.activeFactionId,
    opts.fogMask ?? [],
  ).world;
}

export function filterWorldForFaction(
  world: WorldState,
  factionId: string,
  fogMask: string[] = [],
): { world: WorldState; visibleSystemIds: string[] } {
  const visible = getVisibleSystemIdsWithFog(world, factionId, fogMask);
  const visibleSystemIds = [...visible];

  const systems = world.systems
    .filter((s) => visible.has(s.id))
    .map((s) => ({
      ...s,
      // Hide foreign intel details lightly: keep basic profile
      planets:
        s.ownerFactionId === factionId
          ? s.planets
          : s.planets.map((p) => ({
              ...p,
              population: p.population > 0 ? -1 : 0,
              raceComposition: [],
            })),
    }));

  const systemSet = new Set(systems.map((s) => s.id));
  const links = world.links.filter(
    (l) => systemSet.has(l.fromId) && systemSet.has(l.toId),
  );
  const fleets = world.fleets.filter(
    (f) =>
      f.factionId === factionId ||
      (systemSet.has(f.systemId) && visible.has(f.systemId)),
  );
  const legions = (world.legions ?? []).filter(
    (l) =>
      l.factionId === factionId ||
      (systemSet.has(l.systemId) && visible.has(l.systemId)),
  );
  const playerOrders = world.orders.filter((o) => o.factionId === factionId);

  // Strip passwords from other factions
  const factions = world.factions.map((f) => ({
    ...f,
    password: f.id === factionId ? f.password : "••••",
  }));

  return {
    visibleSystemIds,
    world: {
      ...world,
      systems,
      links,
      fleets,
      legions,
      diplomacy: world.diplomacy ?? [],
      orders: playerOrders,
      factions,
    },
  };
}
