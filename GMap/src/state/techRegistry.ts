/**
 * Client tech registry — UI reads descriptions; never hardcode tech ids.
 */
import {
  getCachedContent,
  type TechnologyDef,
  type TechUpgrade,
  type EconomyCategory,
} from "./contentCatalog";

export type TechIconDef = {
  glyph: string;
  label: string;
};

const CAT_FALLBACK_ICON: Record<EconomyCategory, string> = {
  A: "extraction",
  B: "metallurgy",
  C: "industry",
  D: "energy",
  E: "biology",
  F: "psionics",
};

export function listTechnologies(): TechnologyDef[] {
  return Object.values(getCachedContent()?.technologies || {});
}

export function getTechnology(techId: string): TechnologyDef | undefined {
  return getCachedContent()?.technologies?.[techId];
}

export function getTechIcons(): Record<string, TechIconDef> {
  return getCachedContent()?.tech_icons || {};
}

/** Resolve icon glyph from iconTag, else category fallback. */
export function techIconGlyph(tech: TechnologyDef): string {
  const icons = getTechIcons();
  const tag =
    tech.iconTag ||
    CAT_FALLBACK_ICON[(tech.category as EconomyCategory) || "A"] ||
    "extraction";
  return icons[tag]?.glyph ?? "•";
}

export function techIconLabel(tech: TechnologyDef): string {
  const icons = getTechIcons();
  const tag =
    tech.iconTag ||
    CAT_FALLBACK_ICON[(tech.category as EconomyCategory) || "A"];
  return icons[tag]?.label ?? tag ?? "";
}

export function findUpgrade(
  techId: string,
  upgradeId: string,
): { tech: TechnologyDef; upgrade: TechUpgrade } | null {
  const tech = getTechnology(techId);
  if (!tech) return null;
  const upgrade = (tech.upgrades || []).find((u) => u.id === upgradeId);
  if (!upgrade) return null;
  return { tech, upgrade };
}

/**
 * Soft availability mirror of server locks (no race-share calc here —
 * caller passes raceOk / traitOk).
 */
export function techVisibleToFaction(
  tech: TechnologyDef,
  opts: {
    availableRaces?: string[];
    traitIds?: string[];
    raceShareOk?: boolean;
  },
): boolean {
  const tags = tech.tags || [];
  const races = opts.availableRaces || [];
  if (tags.length && !tags.includes("general")) {
    const raceTags = tags.filter((t) => t.startsWith("race_"));
    const factionTags = tags.filter((t) => t.startsWith("faction_"));
    const traitTags = tags.filter((t) => t.startsWith("trait."));
    let ok = false;
    if (raceTags.length === 0 && factionTags.length === 0 && traitTags.length === 0) {
      ok = true;
    }
    if (raceTags.some((t) => races.includes(t) || races.includes(t.replace(/^race_/, "race_")))) {
      ok = true;
    }
    // unique faction tags: visible if trait lock matches or no lock
    if (factionTags.length && !tech.factionTraitLock) ok = true;
    if (traitTags.some((t) => (opts.traitIds || []).includes(t))) ok = true;
    if (!ok && raceTags.length === 0 && !factionTags.length && !traitTags.length) ok = true;
    if (!ok) return false;
  }
  if (tech.raceLock && opts.raceShareOk === false) return false;
  if (
    tech.factionTraitLock &&
    !(opts.traitIds || []).includes(tech.factionTraitLock)
  ) {
    return false;
  }
  return true;
}
