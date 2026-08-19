export type HqOwnedWorld = {
  systemId: string;
  systemName: string;
  planetId: string;
  planetName: string;
  population: number;
};

/** Settled planets owned by the viewing faction, densest first. */
export function hqOwnedWorlds(payload: {
  factionId: string;
  world: {
    systems: Array<{
      id: string;
      name: string;
      ownerFactionId?: string | null;
      planets: Array<{
        id: string;
        name: string;
        population: number;
        ownerFactionId?: string | null;
      }>;
    }>;
  };
}): HqOwnedWorld[] {
  const fid = payload.factionId;
  const out: HqOwnedWorld[] = [];
  for (const sys of payload.world.systems) {
    for (const p of sys.planets) {
      const owner = p.ownerFactionId || sys.ownerFactionId;
      if (owner !== fid || !(p.population > 0)) continue;
      out.push({
        systemId: sys.id,
        systemName: sys.name,
        planetId: p.id,
        planetName: p.name,
        population: p.population,
      });
    }
  }
  out.sort((a, b) => b.population - a.population || a.planetName.localeCompare(b.planetName, "ru"));
  return out;
}
