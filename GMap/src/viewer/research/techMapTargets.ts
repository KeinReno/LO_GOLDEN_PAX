import type { TechnologyDef } from "../../state/contentCatalog";
import { getCachedContent } from "../../state/contentCatalog";
import { canBuildWithTech, type TechEcoSlice } from "../../state/techGate";
import {
  planetMatchesBiome,
  planetAllowsBuildingBiome,
} from "../../state/biomeMatch";
import type { Planet, StarSystem } from "../../state/types";

type BuildingLike = {
  id: string;
  name: string;
  zone?: string;
  category?: string;
  tier?: number;
  requireProperties?: string[];
  requireRoleMilestone?: string;
  biome_restrictions?: string[];
  slots?: Array<{ fillOnly?: boolean; require?: { properties?: string[] } }>;
  effects?: Array<{ effect: string; args?: Record<string, unknown> }>;
};

type UnlockCatalog = {
  buildings?: Record<string, BuildingLike>;
  stations?: Record<string, BuildingLike>;
};

/** Buildings and stations that become buildable only after researching this tech. */
export function catalogUnlockedByTech(
  tech: TechnologyDef,
  eco: TechEcoSlice | undefined,
  catalog: UnlockCatalog,
): BuildingLike[] {
  const items = [
    ...Object.values(catalog.buildings || {}),
    ...Object.values(catalog.stations || {}),
  ];
  if (!items.length) return [];

  const tiers = { ...(eco?.techTiers || {}) };
  const props = [...(eco?.unlockedProperties || [])];
  const nextTiers = { ...tiers };
  const nextProps = [...props];

  for (const e of tech.effects || []) {
    if (e.effect === "unlock_tech_tier") {
      const cat = String(e.args.category ?? "");
      const to = Number(e.args.to);
      if (cat) nextTiers[cat] = Math.max(Number(nextTiers[cat] ?? 1), to);
    } else if (e.effect === "unlock_property" && e.args.property) {
      const p = String(e.args.property);
      if (!nextProps.includes(p)) nextProps.push(p);
    }
  }

  const before = {
    techTiers: tiers,
    unlockedProperties: props,
    roleScores: eco?.roleScores,
  };
  const after = {
    techTiers: nextTiers,
    unlockedProperties: nextProps,
    roleScores: eco?.roleScores,
  };
  return items.filter(
    (b) => !canBuildWithTech(before, b).ok && canBuildWithTech(after, b).ok,
  );
}

export function buildingsUnlockedByTech(
  tech: TechnologyDef,
  eco: TechEcoSlice | undefined,
): BuildingLike[] {
  const c = getCachedContent();
  return catalogUnlockedByTech(tech, eco, {
    buildings: c?.buildings as Record<string, BuildingLike> | undefined,
    stations: c?.stations as Record<string, BuildingLike> | undefined,
  });
}

function planetHasFreeSlot(planet: Planet, zone?: string): boolean {
  if (!zone || zone === "surface" || zone === "subsurface" || zone === "deep") {
    const max = Number(planet.surfaceSlots ?? 8);
    const used = (planet.surfaceBuildings || []).length;
    return used < max;
  }
  if (zone === "orbital") {
    const max = Number(planet.orbitalSlots ?? 4);
    const used = (planet.orbitalBuildings || []).length;
    return used < max;
  }
  return true;
}

/**
 * Owned systems where buildings unlocked by tech could plausibly be placed
 * (biome_restrictions + free slot). Falls back to all owned if no buildings.
 */
export function systemsForTechHighlight(
  tech: TechnologyDef,
  systems: StarSystem[],
  factionId: string,
  eco: TechEcoSlice | undefined,
): string[] {
  const owned = systems.filter((s) => s.ownerFactionId === factionId);
  if (!owned.length) return [];

  const unlocked = buildingsUnlockedByTech(tech, eco);
  if (!unlocked.length) {
    // F / archaeology heuristic when tech only raises tiers
    const archaeology =
      tech.category === "F" ||
      /archaeol|artifact|ruin|psion/i.test(tech.id) ||
      /архео|пси|реликт/i.test(tech.name);
    if (archaeology) {
      const hit = owned.filter((s) =>
        (s.planets || []).some(
          (p) =>
            (p.ownerFactionId || s.ownerFactionId) === factionId &&
            (planetMatchesBiome(p, "artifact") ||
              planetMatchesBiome(p, "ruin")),
        ),
      );
      if (hit.length) return hit.map((s) => s.id);
    }
    return owned.map((s) => s.id);
  }

  const restrictions = new Set<string>();
  for (const b of unlocked) {
    for (const r of b.biome_restrictions || []) restrictions.add(r);
  }

  const scored = owned
    .map((s) => {
      let score = 0;
      for (const p of s.planets || []) {
        if ((p.ownerFactionId || s.ownerFactionId) !== factionId) continue;
        for (const b of unlocked) {
          const biomeOk = planetAllowsBuildingBiome(p, b.biome_restrictions);
          if (!biomeOk) continue;
          if (!planetHasFreeSlot(p, b.zone)) continue;
          score += 1;
        }
      }
      return { id: s.id, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length) return scored.map((x) => x.id);
  // Buildings unlocked but no biome match — still show owned systems
  return owned.map((s) => s.id);
}

/** Best owned planet for placing a specific building. */
export function findPlanetForBuilding(
  buildingId: string,
  systems: StarSystem[],
  factionId: string,
): { systemId: string; planetId: string; systemName: string } | null {
  const def = (getCachedContent()?.buildings || {})[buildingId] as
    | BuildingLike
    | undefined;
  const owned = systems.filter((s) => s.ownerFactionId === factionId);

  let fallback: { systemId: string; planetId: string; systemName: string } | null =
    null;

  for (const s of owned) {
    for (const p of s.planets || []) {
      if ((p.ownerFactionId || s.ownerFactionId) !== factionId) continue;
      const cand = {
        systemId: s.id,
        planetId: p.id,
        systemName: s.name,
      };
      if (!fallback) fallback = cand;
      if (!def) return cand;
      const biomeOk = planetAllowsBuildingBiome(p, def.biome_restrictions);
      if (biomeOk && planetHasFreeSlot(p, def.zone)) return cand;
    }
  }
  return fallback;
}
