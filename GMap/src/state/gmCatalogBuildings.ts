import type {
  PlanetBuilding,
  PlanetBuildingKind,
  PlanetBuildingZone,
} from "./types.ts";

export type GmBuildingDef = {
  id: string;
  name: string;
  kind: string;
  zone?: string;
  tier?: number;
  faction?: string;
  stub?: boolean;
  catalogPending?: boolean;
};

const KNOWN_KINDS = new Set<string>([
  "residential",
  "farm",
  "mine",
  "factory",
  "lab",
  "barracks",
  "capitol",
  "defense",
  "spaceport",
  "shipyard",
  "habitat",
  "custom",
]);

export function catalogZoneMatchesList(
  defZone: string | undefined,
  listZone: "surface" | "orbital",
): boolean {
  const z = defZone || "surface";
  if (listZone === "orbital") return z === "orbital";
  return z !== "orbital";
}

export function asPlanetBuildingKind(kind: string): PlanetBuildingKind {
  return (KNOWN_KINDS.has(kind) ? kind : "custom") as PlanetBuildingKind;
}

export function listGmCatalogBuildings(
  buildings: Record<string, GmBuildingDef> | undefined,
  listZone: "surface" | "orbital",
): GmBuildingDef[] {
  return Object.values(buildings || {})
    .filter((d) => d?.id && d.name && !d.stub && !d.catalogPending)
    .filter((d) => catalogZoneMatchesList(d.zone, listZone))
    .sort(
      (a, b) =>
        (a.tier ?? 0) - (b.tier ?? 0) || a.name.localeCompare(b.name, "ru"),
    );
}

export function defaultGmCatalogBuilding(
  buildings: Record<string, GmBuildingDef> | undefined,
  listZone: "surface" | "orbital",
): GmBuildingDef | undefined {
  const list = listGmCatalogBuildings(buildings, listZone);
  const prefer = listZone === "orbital" ? "spaceport" : "residential";
  return list.find((d) => d.kind === prefer) ?? list[0];
}

export function patchFromCatalogDef(
  def: GmBuildingDef,
  prev?: Pick<PlanetBuilding, "name" | "kind">,
): Pick<PlanetBuilding, "name" | "kind" | "zone" | "buildingId"> {
  const kind = asPlanetBuildingKind(def.kind);
  const keepName = !!(prev?.name && prev.name !== def.name);
  return {
    buildingId: def.id,
    kind,
    zone: (def.zone as PlanetBuildingZone) || "surface",
    name: keepName ? prev!.name : def.name,
  };
}

export function gmBuildingOptionLabel(def: GmBuildingDef): string {
  const bits = [def.name];
  if (def.tier != null) bits.push(`T${def.tier}`);
  if (def.faction && def.faction !== "generic") bits.push(def.faction);
  return bits.join(" · ");
}
