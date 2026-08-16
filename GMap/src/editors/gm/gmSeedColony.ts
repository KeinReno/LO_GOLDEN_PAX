import { v4 as uuid } from "uuid";
import { getCachedContent } from "../../state/contentCatalog";
import { PLANET_BUILDING_KIND_LABELS } from "../../state/defaults";
import type {
  ColonyType,
  Faction,
  Planet,
  PlanetBuilding,
  PlanetBuildingKind,
  PlanetBuildingZone,
  RaceShare,
  StarSystem,
  SystemHistoryEntry,
  WorldState,
} from "../../state/types";

export type GmSeedPresetId = "outpost" | "colony" | "core";

export type GmSeedTargetScope = "planet" | "best" | "all_habitable";

type BuildingSpec = {
  buildingId: string;
  kind: PlanetBuildingKind;
  zone: PlanetBuildingZone;
  count: number;
};

export type GmSeedPreset = {
  id: GmSeedPresetId;
  label: string;
  hint: string;
  colonyType: ColonyType;
  population: number;
  buildings: BuildingSpec[];
};

export const GM_SEED_PRESETS: GmSeedPreset[] = [
  {
    id: "outpost",
    label: "Форпост",
    hint: "Жильё · ферма · космопорт · ~50K",
    colonyType: "outpost",
    population: 50_000,
    buildings: [
      {
        buildingId: "building.residential",
        kind: "residential",
        zone: "surface",
        count: 1,
      },
      { buildingId: "building.farm", kind: "farm", zone: "surface", count: 1 },
      {
        buildingId: "building.spaceport",
        kind: "spaceport",
        zone: "orbital",
        count: 1,
      },
    ],
  },
  {
    id: "colony",
    label: "Колония",
    hint: "Базовый набор · ~100K",
    colonyType: "colony",
    population: 100_000,
    buildings: [
      {
        buildingId: "building.residential",
        kind: "residential",
        zone: "surface",
        count: 2,
      },
      { buildingId: "building.farm", kind: "farm", zone: "surface", count: 1 },
      { buildingId: "building.mine", kind: "mine", zone: "surface", count: 1 },
      {
        buildingId: "building.spaceport",
        kind: "spaceport",
        zone: "orbital",
        count: 1,
      },
    ],
  },
  {
    id: "core",
    label: "Ядро",
    hint: "Развитый мир · ~400K",
    colonyType: "core",
    population: 400_000,
    buildings: [
      {
        buildingId: "building.residential",
        kind: "residential",
        zone: "surface",
        count: 3,
      },
      { buildingId: "building.farm", kind: "farm", zone: "surface", count: 2 },
      { buildingId: "building.mine", kind: "mine", zone: "surface", count: 1 },
      {
        buildingId: "building.factory",
        kind: "factory",
        zone: "surface",
        count: 1,
      },
      {
        buildingId: "building.spaceport",
        kind: "spaceport",
        zone: "orbital",
        count: 1,
      },
    ],
  },
];

export type GmSeedApplyInput = {
  world: WorldState;
  factionId: string;
  systemId: string;
  planetId?: string | null;
  scope: GmSeedTargetScope;
  presetId: GmSeedPresetId;
  /** Replace buildings vs only fill empty worlds. */
  overwrite: boolean;
  /** Claim system for faction if unowned. */
  claimSystem: boolean;
  turn?: number;
};

export type GmSeedApplyResult = {
  world: WorldState;
  touchedPlanets: string[];
  summary: string;
};

function buildingName(buildingId: string, kind: PlanetBuildingKind): string {
  const content = getCachedContent();
  const def = content?.buildings?.[buildingId];
  return def?.name ?? PLANET_BUILDING_KIND_LABELS[kind] ?? kind;
}

function makeBuilding(spec: BuildingSpec, planetName: string): PlanetBuilding {
  const label = buildingName(spec.buildingId, spec.kind);
  return {
    id: uuid(),
    name: `${label} · ${planetName}`,
    kind: spec.kind,
    zone: spec.zone,
    buildingId: spec.buildingId,
  };
}

function expandBuildings(
  specs: BuildingSpec[],
  planetName: string,
): { surface: PlanetBuilding[]; orbital: PlanetBuilding[] } {
  const surface: PlanetBuilding[] = [];
  const orbital: PlanetBuilding[] = [];
  for (const spec of specs) {
    const bucket = spec.zone === "orbital" ? orbital : surface;
    for (let i = 0; i < spec.count; i += 1) {
      bucket.push(makeBuilding(spec, planetName));
    }
  }
  return { surface, orbital };
}

function inferRaceComposition(
  world: WorldState,
  faction: Faction,
): RaceShare[] {
  if (faction.primaryRaceId) {
    return [{ raceId: faction.primaryRaceId, percent: 100 }];
  }
  const counts = new Map<string, number>();
  for (const sys of world.systems) {
    const ownsSystem = sys.ownerFactionId === faction.id;
    for (const p of sys.planets) {
      const owns =
        p.ownerFactionId === faction.id ||
        (ownsSystem && !p.ownerFactionId && (p.population ?? 0) > 0);
      if (!owns) continue;
      for (const row of p.raceComposition ?? []) {
        if (!row.raceId) continue;
        counts.set(
          row.raceId,
          (counts.get(row.raceId) ?? 0) + (row.percent ?? 0),
        );
      }
    }
  }
  if (counts.size > 0) {
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    return [{ raceId: top, percent: 100 }];
  }
  return [{ raceId: defaultSeedRaceId(), percent: 100 }];
}

/** First content race tagged `baseline`, else first catalog race, else human. */
function defaultSeedRaceId(): string {
  const races = getCachedContent()?.races;
  if (!races) return "race_human";
  const entries = Object.entries(races);
  if (entries.length === 0) return "race_human";
  const tagged = entries.find(([, r]) => r.tags?.includes("baseline"));
  const picked = tagged ?? entries[0]!;
  return picked[1].id || picked[0] || "race_human";
}

function isHabitable(planet: Planet): boolean {
  if (planet.colonizable === false) return false;
  return planet.habitable !== false;
}

function pickPlanets(
  system: StarSystem,
  scope: GmSeedTargetScope,
  planetId?: string | null,
): Planet[] {
  const planets = system.planets ?? [];
  if (scope === "planet" && planetId) {
    const one = planets.find((p) => p.id === planetId);
    return one ? [one] : [];
  }
  const habitable = planets.filter(isHabitable);
  if (scope === "all_habitable") return habitable;
  const empty = habitable.find(
    (p) =>
      (p.population ?? 0) <= 0 &&
      (!p.colonyType || p.colonyType === "none"),
  );
  return [empty ?? habitable[0] ?? planets[0]].filter(Boolean);
}

function mergeBuildings(
  existing: PlanetBuilding[],
  incoming: PlanetBuilding[],
  maxSlots: number,
): PlanetBuilding[] {
  const out = [...existing];
  for (const b of incoming) {
    if (out.length >= maxSlots) break;
    const dup = out.some(
      (x) =>
        !x.disabled &&
        (x.buildingId === b.buildingId ||
          (x.kind === b.kind && x.zone === b.zone)),
    );
    if (!dup) out.push(b);
  }
  return out;
}

function seedPlanet(
  planet: Planet,
  preset: GmSeedPreset,
  factionId: string,
  races: RaceShare[],
  overwrite: boolean,
): Planet {
  const built = expandBuildings(preset.buildings, planet.name);
  const surfaceMax = Math.max(
    planet.surfaceSlots ?? 8,
    built.surface.length + 2,
  );
  const orbitalMax = Math.max(
    planet.orbitalSlots ?? 4,
    built.orbital.length + 2,
  );

  const prevSurface = planet.surfaceBuildings ?? [];
  const prevOrbital = planet.orbitalBuildings ?? [];
  const emptyWorld =
    (planet.population ?? 0) <= 0 &&
    prevSurface.length === 0 &&
    prevOrbital.length === 0;

  const surfaceBuildings =
    overwrite || emptyWorld
      ? built.surface
      : mergeBuildings(prevSurface, built.surface, surfaceMax);
  const orbitalBuildings =
    overwrite || emptyWorld
      ? built.orbital
      : mergeBuildings(prevOrbital, built.orbital, orbitalMax);

  const population =
    overwrite || (planet.population ?? 0) <= 0
      ? preset.population
      : Math.max(planet.population ?? 0, preset.population);

  return {
    ...planet,
    ownerFactionId: factionId,
    habitable: true,
    colonizable: true,
    surveyed: true,
    colonyType: preset.colonyType,
    population,
    loyalty: planet.loyalty ?? 75,
    raceComposition:
      (planet.raceComposition?.length ?? 0) > 0 && !overwrite && !emptyWorld
        ? planet.raceComposition
        : races.map((r) => ({ ...r })),
    surfaceBuildings,
    orbitalBuildings,
    surfaceSlots: surfaceMax,
    orbitalSlots: orbitalMax,
  };
}

function appendHistory(
  system: StarSystem,
  entry: SystemHistoryEntry,
): SystemHistoryEntry[] {
  const list = Array.isArray(system.history) ? [...system.history] : [];
  list.push(entry);
  return list.slice(-40);
}

export function applyGmSeedColony(input: GmSeedApplyInput): GmSeedApplyResult {
  const preset =
    GM_SEED_PRESETS.find((p) => p.id === input.presetId) ?? GM_SEED_PRESETS[1]!;
  const faction = input.world.factions.find((f) => f.id === input.factionId);
  if (!faction) {
    return {
      world: input.world,
      touchedPlanets: [],
      summary: "Держава не найдена",
    };
  }

  const sysIdx = input.world.systems.findIndex((s) => s.id === input.systemId);
  if (sysIdx < 0) {
    return {
      world: input.world,
      touchedPlanets: [],
      summary: "Система не найдена",
    };
  }

  const system = input.world.systems[sysIdx]!;
  const targets = pickPlanets(system, input.scope, input.planetId);
  if (targets.length === 0) {
    return {
      world: input.world,
      touchedPlanets: [],
      summary: "Нет подходящих планет",
    };
  }

  const races = inferRaceComposition(input.world, faction);
  const turn = input.turn ?? input.world.meta?.turn ?? 0;
  const touchedPlanets: string[] = [];
  const targetIds = new Set(targets.map((p) => p.id));

  const nextPlanets = system.planets.map((planet) => {
    if (!targetIds.has(planet.id)) return planet;
    touchedPlanets.push(planet.name);
    return seedPlanet(planet, preset, input.factionId, races, input.overwrite);
  });

  const claimSystem =
    input.claimSystem &&
    (!system.ownerFactionId || system.ownerFactionId === input.factionId);

  const historyNote =
    touchedPlanets.length === 1
      ? touchedPlanets[0]!
      : `${touchedPlanets.length} миров`;

  const nextSystem: StarSystem = {
    ...system,
    ownerFactionId: claimSystem ? input.factionId : system.ownerFactionId,
    planets: nextPlanets,
    history: appendHistory(system, {
      turn,
      type: "colonize",
      description: `GM · ${preset.label} для ${faction.name}: ${historyNote}`,
    }),
  };

  const systems = [...input.world.systems];
  systems[sysIdx] = nextSystem;

  return {
    world: {
      ...input.world,
      meta: {
        ...input.world.meta,
        updatedAt: new Date().toISOString(),
      },
      systems,
    },
    touchedPlanets,
    summary: `${preset.label} → ${touchedPlanets.join(", ")} (${faction.name})`,
  };
}
