/**
 * Client mirror of server/depositExtract + flowEngine deposit tech ceiling.
 * Keep in sync with gmap-economy-canon.
 */
import { getCachedContent } from "./contentCatalog";
import { allocateLabor } from "./planetLabor";
import type { Planet, PlanetBuilding } from "./types";

type ExtractDef = {
  id?: string;
  name?: string;
  category?: string;
  tier?: number;
  kind?: string;
  extractsCategory?: unknown;
  extractsDeposits?: unknown;
};

function asList(value: unknown): unknown[] {
  if (value == null || value === "") return [];
  return Array.isArray(value) ? value : [value];
}

export function depositTechCeiling(
  techTiers: Record<string, number> | null | undefined,
  category: string,
): number {
  const principles = getCachedContent()?.economy_balance?.principles as
    | { freeBuildTier?: number }
    | undefined;
  const free = Number(principles?.freeBuildTier) || 3;
  const researched = Number(techTiers?.[category] ?? 1);
  return Math.max(free, researched);
}

export function isTreasuryPegDeposit(
  def: { id?: string; name?: string } | null | undefined,
  treasuryPeg: string | null | undefined,
): boolean {
  if (!def || treasuryPeg == null || treasuryPeg === "") return false;
  const peg = String(treasuryPeg);
  const id = String(def.id || "");
  const name = String(def.name || "");
  if (id && (id === peg || name === peg)) return true;
  const pegBare = peg.replace(/^map\./, "");
  const idBare = id.replace(/^map\./, "");
  return Boolean(idBare && idBare === pegBare);
}

export function buildingUnlocksDeposit(
  buildingDef: ExtractDef | null | undefined,
  depositDef: ExtractDef | null | undefined,
): boolean {
  if (!buildingDef || !depositDef) return false;
  const depositId = depositDef.id;
  const named = asList(buildingDef.extractsDeposits);
  if (depositId && named.includes(depositId)) return true;
  if (Object.prototype.hasOwnProperty.call(buildingDef, "extractsCategory")) {
    const cats = asList(buildingDef.extractsCategory);
    if (cats.length === 0) return false;
    return depositDef.category != null && cats.includes(depositDef.category);
  }
  return (
    depositDef.category != null &&
    buildingDef.category != null &&
    buildingDef.category === depositDef.category
  );
}

export function extractionYieldUnits(def: { yield?: Record<string, number> } | null | undefined): number {
  const entries = Object.entries(def?.yield || {}).filter(
    ([, amt]) => Number(amt) > 0,
  );
  if (entries.length === 0) return 1;
  return entries.reduce((sum, [, amt]) => sum + Number(amt), 0);
}

export function planetCanExtractDeposit(
  planet: Planet,
  depositDef: ExtractDef,
  catalog: Record<string, ExtractDef>,
): boolean {
  const buildings: PlanetBuilding[] = [
    ...(planet.surfaceBuildings || []),
    ...(planet.orbitalBuildings || []),
  ];
  for (const inst of buildings) {
    if (inst?.disabled) continue;
    const def =
      (inst.buildingId && catalog[inst.buildingId]) ||
      Object.values(catalog).find((d) => d.kind === inst.kind);
    if (buildingUnlocksDeposit(def, depositDef)) return true;
  }
  return false;
}

export function depositLaborScale(
  planet: Planet,
  depositDef: ExtractDef,
  catalog: Record<string, ExtractDef>,
): number {
  const staffing = allocateLabor(planet, catalog);
  const buildings: PlanetBuilding[] = [
    ...(planet.surfaceBuildings || []),
    ...(planet.orbitalBuildings || []),
  ];
  let best = 0;
  let matched = false;
  buildings.forEach((b, i) => {
    if (b?.disabled) return;
    const def =
      (b.buildingId && catalog[b.buildingId]) ||
      Object.values(catalog).find((d) => d.kind === b.kind);
    if (!buildingUnlocksDeposit(def, depositDef)) return;
    matched = true;
    const key = b?.id != null && String(b.id) !== "" ? String(b.id) : `#${i}`;
    best = Math.max(best, staffing[key] ?? 0);
  });
  return matched ? best : 0;
}
