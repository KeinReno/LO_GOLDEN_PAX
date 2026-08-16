import type { MapResourceDef, PublicContent } from "../../state/contentCatalog";
import type { BuildingDef, ColonyDef } from "../PlayerPlanetManage";

export type UnitCatalogEntry = {
  id: string;
  name: string;
  tier?: number;
  faction?: string;
};

export type ViewerPlayCatalogs = {
  buildingsCatalog: Record<string, BuildingDef>;
  coloniesCatalog: Record<string, ColonyDef>;
  mapResourcesCatalog: Record<string, MapResourceDef> | undefined;
  shipsCatalog: Record<string, UnitCatalogEntry>;
  unitsCatalog: Record<string, UnitCatalogEntry>;
};

export const emptyViewerPlayCatalogs: ViewerPlayCatalogs = {
  buildingsCatalog: {},
  coloniesCatalog: {},
  mapResourcesCatalog: undefined,
  shipsCatalog: {},
  unitsCatalog: {},
};

export function catalogsFromContent(
  c: PublicContent | null,
): Partial<ViewerPlayCatalogs> | null {
  if (!c) return null;
  const next: Partial<ViewerPlayCatalogs> = {};
  if (c.buildings) {
    next.buildingsCatalog = c.buildings as Record<string, BuildingDef>;
  }
  if (c.colonies) {
    next.coloniesCatalog = c.colonies as Record<string, ColonyDef>;
  }
  if (c.map_resources) next.mapResourcesCatalog = c.map_resources;
  if (c.ships) next.shipsCatalog = c.ships as Record<string, UnitCatalogEntry>;
  if (c.units) next.unitsCatalog = c.units as Record<string, UnitCatalogEntry>;
  return Object.keys(next).length ? next : null;
}
