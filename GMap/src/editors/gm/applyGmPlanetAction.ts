import type { ColonyType, Planet, PlanetBuilding } from "../../state/types.ts";
import { patchFromCatalogDef } from "../../state/gmCatalogBuildings.ts";
import type {
  BuildingDef,
  PlanetActionRequest,
} from "../../viewer/PlayerPlanetManage.tsx";

/** Census GM plants on an empty world when there is no source planet. */
export const GM_SPAWN_CENSUS = 10_000;
const MAX_GRADE = 5;
const SURFACE_SLOTS = [8, 18, 28, 38, 48];
const ORBITAL_SLOTS = [4, 6, 8, 10, 12];

function clampGrade(n: number) {
  const g = Math.floor(Number(n) || 1);
  return Math.max(1, Math.min(MAX_GRADE, g));
}

function bumpGrade(current: number): number | null {
  const g = clampGrade(current);
  if (g >= MAX_GRADE) return null;
  return g + 1;
}

export type GmPlanetActionResult = {
  planet: Partial<Planet>;
  source?: { planetId: string; patch: Partial<Planet> };
};

type Catalog = Record<string, BuildingDef>;

function listFor(
  planet: Planet,
  orbital: boolean,
): PlanetBuilding[] {
  return orbital
    ? [...(planet.orbitalBuildings ?? [])]
    : [...(planet.surfaceBuildings ?? [])];
}

function patchList(
  _planet: Planet,
  orbital: boolean,
  list: PlanetBuilding[],
): Partial<Planet> {
  return orbital ? { orbitalBuildings: list } : { surfaceBuildings: list };
}

function findBuilding(
  planet: Planet,
  instanceId: string,
): { orbital: boolean; index: number; inst: PlanetBuilding } | null {
  const surface = planet.surfaceBuildings ?? [];
  const si = surface.findIndex((b) => b.id === instanceId);
  if (si >= 0) return { orbital: false, index: si, inst: surface[si]! };
  const orbital = planet.orbitalBuildings ?? [];
  const oi = orbital.findIndex((b) => b.id === instanceId);
  if (oi >= 0) return { orbital: true, index: oi, inst: orbital[oi]! };
  return null;
}

function asColonyType(raw: string | undefined): ColonyType {
  if (
    raw === "outpost" ||
    raw === "colony" ||
    raw === "core" ||
    raw === "fortress" ||
    raw === "mining" ||
    raw === "research"
  ) {
    return raw;
  }
  return "outpost";
}

/** Instant GM planet mutation. No AP, tech, or ledger. */
export function applyGmPlanetAction(
  planet: Planet,
  req: PlanetActionRequest,
  opts: {
    buildings: Catalog;
    factionId: string;
    nextId: () => string;
    sourcePlanet?: Planet | null;
  },
): GmPlanetActionResult | null {
  if (req.action === "rename" && req.name) {
    return { planet: { name: req.name } };
  }

  if (req.action === "demolish" && req.instanceId) {
    const id = req.instanceId;
    return {
      planet: {
        surfaceBuildings: (planet.surfaceBuildings ?? []).filter(
          (b) => b.id !== id,
        ),
        orbitalBuildings: (planet.orbitalBuildings ?? []).filter(
          (b) => b.id !== id,
        ),
      },
    };
  }

  if (req.action === "upgrade_grade") {
    if (req.zone === "orbital") {
      const next = bumpGrade(planet.orbitalGrade ?? 1);
      if (next == null) return null;
      return {
        planet: {
          orbitalGrade: next,
          orbitalSlots: ORBITAL_SLOTS[next - 1],
        },
      };
    }
    const next = bumpGrade(planet.grade ?? 1);
    if (next == null) return null;
    return {
      planet: {
        grade: next,
        surfaceSlots: SURFACE_SLOTS[next - 1],
      },
    };
  }

  if (req.action === "set_colony_type" && req.colonyType) {
    return { planet: { colonyType: asColonyType(req.colonyType) } };
  }

  if (req.action === "colonize") {
    const colonyType = asColonyType(req.colonyType);
    const source = opts.sourcePlanet;
    if (source && source.id !== planet.id && (source.population ?? 0) > 0) {
      const take = Math.min(
        Math.max(1, Math.floor(source.population * 0.1) || 1),
        Math.max(0, source.population - 1),
        GM_SPAWN_CENSUS,
      );
      return {
        planet: {
          colonyType,
          ownerFactionId: opts.factionId,
          population: (planet.population ?? 0) + take,
        },
        source: {
          planetId: source.id,
          patch: { population: Math.max(0, source.population - take) },
        },
      };
    }
    const pop =
      (planet.population ?? 0) > 0 ? planet.population : GM_SPAWN_CENSUS;
    return {
      planet: {
        colonyType,
        ownerFactionId: opts.factionId,
        population: pop,
      },
    };
  }

  if (req.action === "staff" && req.instanceId) {
    const found = findBuilding(planet, req.instanceId);
    if (!found) return null;
    const list = listFor(planet, found.orbital);
    const next = { ...found.inst };
    if (req.assignedLabor == null) delete (next as { assignedLabor?: number }).assignedLabor;
    else next.assignedLabor = Math.max(0, Math.floor(req.assignedLabor));
    list[found.index] = next;
    return { planet: patchList(planet, found.orbital, list) };
  }

  if (
    req.action === "staff_transfer" &&
    req.fromInstanceId &&
    req.instanceId &&
    (req.transferAmount ?? 0) > 0
  ) {
    const amount = Math.max(1, Math.floor(req.transferAmount ?? 1));
    const to = findBuilding(planet, req.instanceId);
    if (!to) return null;
    let surface = [...(planet.surfaceBuildings ?? [])];
    let orbital = [...(planet.orbitalBuildings ?? [])];
    const write = (
      row: { orbital: boolean; index: number; inst: PlanetBuilding },
      labor: number | undefined,
    ) => {
      const list = row.orbital ? orbital : surface;
      const inst = { ...row.inst };
      if (labor == null) delete (inst as { assignedLabor?: number }).assignedLabor;
      else inst.assignedLabor = labor;
      list[row.index] = inst;
      if (row.orbital) orbital = list;
      else surface = list;
    };
    const toLabor = Math.max(0, (to.inst.assignedLabor ?? 0) + amount);
    write(to, toLabor);
    if (req.fromInstanceId !== "idle") {
      const from = findBuilding(
        { ...planet, surfaceBuildings: surface, orbitalBuildings: orbital },
        req.fromInstanceId,
      );
      if (from) {
        write(from, Math.max(0, (from.inst.assignedLabor ?? 0) - amount));
      }
    }
    return { planet: { surfaceBuildings: surface, orbitalBuildings: orbital } };
  }

  if (req.action !== "build" || !req.buildingId) return null;
  const def = opts.buildings[req.buildingId];
  if (!def) return null;
  const orbitalZone = def.zone === "orbital";
  const list = listFor(planet, orbitalZone);
  const max = orbitalZone
    ? (planet.orbitalSlots ?? 4)
    : (planet.surfaceSlots ?? 8);
  if (list.length >= max) return null;
  const next: PlanetBuilding = {
    id: opts.nextId(),
    ...patchFromCatalogDef({
      id: def.id,
      name: def.name,
      kind: def.kind,
      zone: def.zone,
    }),
  };
  return { planet: patchList(planet, orbitalZone, [...list, next]) };
}
