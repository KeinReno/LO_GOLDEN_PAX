import type { Planet, PlanetType, Climate, StarSystem } from "./types";

export type PlanetHabitStatus = "inhabited" | "habitable" | "uninhabitable";

export interface PlanetCensus {
  inhabited: number;
  habitable: number;
  uninhabitable: number;
  total: number;
}

const HABITABLE_TYPES: PlanetType[] = ["rocky", "ocean", "desert", "artifact"];
const UNINHABITABLE_TYPES: PlanetType[] = ["gas", "toxic"];
const HARSH_CLIMATES: Climate[] = ["frozen", "infernal"];

/** Classify a planet for map badges and census. */
export function classifyPlanet(p: Planet): PlanetHabitStatus {
  if (p.population > 0) return "inhabited";
  if (p.habitable === false) return "uninhabitable";
  if (p.habitable === true && p.population <= 0) return "habitable";
  if (UNINHABITABLE_TYPES.includes(p.type)) return "uninhabitable";
  if (HARSH_CLIMATES.includes(p.climate) && p.type !== "artifact") {
    return "uninhabitable";
  }
  if (HABITABLE_TYPES.includes(p.type)) return "habitable";
  if (p.type === "ice") return "uninhabitable";
  return "uninhabitable";
}

export function censusPlanets(planets: Planet[]): PlanetCensus {
  const c: PlanetCensus = {
    inhabited: 0,
    habitable: 0,
    uninhabitable: 0,
    total: planets.length,
  };
  for (const p of planets) {
    const s = classifyPlanet(p);
    c[s] += 1;
  }
  return c;
}

export function isCorridorSystem(s: StarSystem): boolean {
  return s.kind === "corridor" || (s.stars?.length ?? 0) === 0;
}

/** Stable orbital order for schematic (does not touch galaxy x/y). */
export function planetsByOrbit(planets: Planet[]): Planet[] {
  return [...planets].sort((a, b) => {
    const oa = a.orbitIndex ?? 999;
    const ob = b.orbitIndex ?? 999;
    if (oa !== ob) return oa - ob;
    return a.name.localeCompare(b.name, "ru");
  });
}

/** Fill missing orbitIndex / size / habit flags without changing galaxy coords. */
export function normalizePlanet(p: Planet, index: number): Planet {
  const status = classifyPlanet(p);
  return {
    ...p,
    orbitIndex: p.orbitIndex ?? index + 1,
    size: p.size ?? (p.type === "gas" ? 1.6 : p.type === "ice" ? 0.85 : 1),
    habitable:
      p.habitable ??
      (status === "habitable" || status === "inhabited"),
    colonizable:
      p.colonizable ??
      (status !== "uninhabitable"),
    surveyed: p.surveyed ?? true,
    colonyType:
      p.colonyType ??
      (p.population > 0 ? "colony" : "none"),
    resources: p.resources ?? [],
    raceComposition: p.raceComposition ?? [],
    surfaceSlots: p.surfaceSlots ?? 8,
    orbitalSlots: p.orbitalSlots ?? 4,
    surfaceBuildings: p.surfaceBuildings ?? [],
    orbitalBuildings: p.orbitalBuildings ?? [],
    ownerFactionId: p.ownerFactionId ?? null,
    coOwnerFactionIds: p.coOwnerFactionIds ?? [],
    contested: p.contested ?? false,
  };
}

export function normalizeSystemPlanets(s: StarSystem): StarSystem {
  if (!s.planets?.length) return { ...s, planets: s.planets ?? [] };
  return {
    ...s,
    planets: s.planets.map((p, i) => normalizePlanet(p, i)),
  };
}

export const PLANET_TYPE_COLORS: Record<PlanetType, string> = {
  rocky: "#8b7355",
  gas: "#c4a574",
  ice: "#a8d4e6",
  desert: "#d4a574",
  ocean: "#3d8bfd",
  toxic: "#7a9b4a",
  artifact: "#c9a227",
};

export const HABIT_COLORS = {
  inhabited: 0x5cdb95,
  habitable: 0xf0c14a,
  uninhabitable: 0x8b9bb8,
} as const;

export const HABIT_LABELS: Record<PlanetHabitStatus, string> = {
  inhabited: "Заселённые",
  habitable: "Пригодные (пустые)",
  uninhabitable: "Непригодные",
};
