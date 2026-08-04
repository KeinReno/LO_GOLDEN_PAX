import type { Planet, StarSystem } from "../../state/types";
import { getCachedContent } from "../../state/contentCatalog";
import {
  ECO_CATEGORY_NAMES,
  type EconomyFlowBreakdown,
} from "../economyFlowTypes";
import type { BuildingDef } from "../PlayerPlanetManage";
import type { SystemFlowRow } from "./types";

const CATS = ["A", "B", "C", "D", "E", "F"] as const;

function resolveDef(
  buildings: Record<string, BuildingDef> | undefined,
  b: { buildingId?: string; kind?: string; zone?: string; name?: string },
): BuildingDef | undefined {
  const content = getCachedContent();
  const catalog = buildings ?? (content?.buildings as Record<string, BuildingDef>) ?? {};
  if (b.buildingId && catalog[b.buildingId]) return catalog[b.buildingId];
  if (b.name) {
    const byName = Object.values(catalog).find((d) => d.name === b.name);
    if (byName) return byName;
  }
  return Object.values(catalog).find(
    (d) =>
      d.kind === b.kind &&
      (d.zone || "surface") === (b.zone || "surface"),
  );
}

/** Estimate system contribution to A–F from local buildings (+ optional flow totals). */
export function calculateSystemFlows(
  system: StarSystem,
  factionId: string,
  flowData?: EconomyFlowBreakdown | null,
): SystemFlowRow[] {
  const content = getCachedContent();
  const buildings = content?.buildings as Record<string, BuildingDef> | undefined;
  const counts = new Map<string, { net: number; sources: string[] }>();
  for (const cat of CATS) {
    counts.set(cat, { net: 0, sources: [] });
  }

  for (const p of system.planets ?? []) {
    const owner = p.ownerFactionId || system.ownerFactionId;
    if (owner !== factionId) continue;
    const all = [
      ...(p.surfaceBuildings ?? []),
      ...(p.orbitalBuildings ?? []),
    ].filter((b) => !b.disabled);

    for (const b of all) {
      const def = resolveDef(buildings, b);
      if (!def?.category) continue;
      const letter = String(def.category);
      const row = counts.get(letter);
      if (!row) continue;
      const tip = `${def.name} · ${p.name}`;
      if (!row.sources.includes(tip)) row.sources.push(tip);
      // Soft local estimate: +1 per producing building when no flow matrix
      row.net += 1;
    }
  }

  return CATS.map((letter) => {
    const local = counts.get(letter)!;
    const factionNet = flowData?.totals?.[letter]?.net;
    const warn =
      (factionNet != null && factionNet < 0) ||
      (typeof flowData?.bottlenecks?.[letter] === "object" &&
        Number(
          (flowData.bottlenecks[letter] as { deficit?: number })?.deficit ?? 0,
        ) > 0);
    return {
      letter,
      name: ECO_CATEGORY_NAMES[letter] ?? letter,
      net: local.net,
      sources: local.sources.slice(0, 4),
      warn: !!warn && local.net === 0,
    };
  });
}

/** Planets / slots that can host a building of the problem category. */
export function planetsThatCanBuildCategory(
  system: StarSystem,
  factionId: string,
  category: string,
  buildingDefs: Record<string, BuildingDef>,
): { planetId: string; buildingIds: string[] }[] {
  const out: { planetId: string; buildingIds: string[] }[] = [];
  for (const p of system.planets ?? []) {
    const owner = p.ownerFactionId || system.ownerFactionId;
    if (owner !== factionId) continue;
    if ((p.population ?? 0) <= 0 && (!p.colonyType || p.colonyType === "none")) {
      continue;
    }
    const surfFree =
      (p.surfaceSlots ?? 8) - (p.surfaceBuildings ?? []).length;
    const orbFree =
      (p.orbitalSlots ?? 4) - (p.orbitalBuildings ?? []).length;
    const ids = Object.values(buildingDefs)
      .filter((d) => String(d.category ?? "") === category)
      .filter((d) => {
        if (d.zone === "orbital") return orbFree > 0;
        return surfFree > 0;
      })
      .map((d) => d.id);
    if (ids.length) out.push({ planetId: p.id, buildingIds: ids });
  }
  return out;
}

export function buildingCategory(
  def: BuildingDef | undefined,
): string | null {
  return def?.category ? String(def.category) : null;
}

export function planetHasCategoryBuilding(
  planet: Planet,
  category: string,
  buildings: Record<string, BuildingDef>,
): boolean {
  const all = [
    ...(planet.surfaceBuildings ?? []),
    ...(planet.orbitalBuildings ?? []),
  ];
  for (const b of all) {
    if (b.disabled) continue;
    const def = resolveDef(buildings, b);
    if (def && String(def.category ?? "") === category) return true;
  }
  return false;
}
