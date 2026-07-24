import type { Faction, WorldState } from "./types";

/** Belator (and any flagged faction) sees the whole star map. */
export function factionHasFullMapVision(faction: Faction | undefined): boolean {
  if (!faction) return false;
  if (faction.fullMapVision === true) return true;
  // Legacy canon: Belator always has full vision even on old saves
  return faction.id === "faction_belator";
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
  return visible;
}

export function filterWorldForFaction(
  world: WorldState,
  factionId: string,
): { world: WorldState; visibleSystemIds: string[] } {
  const visible = getVisibleSystemIds(world, factionId);
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
