/** Construction catalog groups (player-facing), not A–F flow letters. */

export type BuildingCatalogGroupId =
  | "housing"
  | "extraction"
  | "farming"
  | "industry"
  | "science"
  | "military"
  | "naval"
  | "admin"
  | "ops"
  | "bio"
  | "archive"
  | "other";

export type BuildingCatalogGroup = {
  id: BuildingCatalogGroupId;
  label: string;
};

const KIND_GROUP: Record<string, BuildingCatalogGroupId> = {
  residential: "housing",
  habitat: "housing",
  mine: "extraction",
  farm: "farming",
  factory: "industry",
  forge: "industry",
  lab: "science",
  institute: "science",
  barracks: "military",
  defense: "military",
  fortress: "military",
  shield: "military",
  shipyard: "naval",
  spaceport: "naval",
  capitol: "admin",
  trade: "admin",
  monument: "admin",
  relay: "ops",
  platform: "ops",
  vat: "bio",
  vault: "archive",
};

export const BUILDING_CATALOG_GROUPS: BuildingCatalogGroup[] = [
  { id: "housing", label: "Жильё" },
  { id: "extraction", label: "Добыча" },
  { id: "farming", label: "Аграрии" },
  { id: "industry", label: "Промышленность" },
  { id: "science", label: "Наука" },
  { id: "military", label: "Военные" },
  { id: "naval", label: "Флот" },
  { id: "admin", label: "Управление" },
  { id: "ops", label: "Инфраструктура" },
  { id: "bio", label: "Биология" },
  { id: "archive", label: "Архивы" },
  { id: "other", label: "Прочее" },
];

const LABEL_BY_ID = Object.fromEntries(
  BUILDING_CATALOG_GROUPS.map((g) => [g.id, g.label]),
) as Record<BuildingCatalogGroupId, string>;

export function buildingCatalogGroupId(kind?: string): BuildingCatalogGroupId {
  if (!kind) return "other";
  return KIND_GROUP[kind] ?? "other";
}

export function buildingCatalogGroupLabel(kind?: string): string {
  return LABEL_BY_ID[buildingCatalogGroupId(kind)];
}
