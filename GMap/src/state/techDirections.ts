/**
 * Client mirror of server/techDirections.mjs — mapping from content,
 * never hardcoded tech ids.
 */
import { getCachedContent, type TechnologyDef } from "./contentCatalog";

export const FALLBACK_DIRECTION_IDS = [
  "industry",
  "military",
  "culture",
  "commerce",
  "diplomacy",
  "governance",
] as const;

export type TechDirectionId = (typeof FALLBACK_DIRECTION_IDS)[number] | string;

const FALLBACK_LABELS: Record<string, string> = {
  industry: "Индустрия",
  military: "Военное дело",
  culture: "Культура",
  commerce: "Коммерция",
  diplomacy: "Дипломатия",
  governance: "Управление",
};

const FALLBACK_COLOR_VARS: Record<string, string> = {
  industry: "--eco-dir-industry",
  military: "--eco-dir-military",
  culture: "--eco-dir-culture",
  commerce: "--eco-dir-commerce",
  diplomacy: "--eco-dir-diplomacy",
  governance: "--eco-dir-governance",
};

const AF = ["A", "B", "C", "D", "E", "F"] as const;

type DirectionSpec = {
  id?: string;
  label?: string;
  colorVar?: string;
  categories?: string[];
  paths?: string[];
  civicPaths?: string[];
  iconTags?: string[];
  tags?: string[];
  factionTraitLocks?: string[];
};

function content() {
  return getCachedContent();
}

function table(c = content()) {
  return c?.tech_directions?.directions || {};
}

export function listDirectionIds(c = content()): string[] {
  const raw = c?.tech_directions;
  const dirs = table(c);
  const order = (raw?.order || []).filter((id) => dirs[id]);
  if (order.length) return order;
  const keys = Object.keys(dirs);
  if (keys.length) return keys;
  return [...FALLBACK_DIRECTION_IDS];
}

export function directionDef(id: string, c = content()): DirectionSpec | null {
  const spec = table(c)[id];
  if (spec) return spec;
  if ((FALLBACK_DIRECTION_IDS as readonly string[]).includes(id)) {
    return {
      id,
      label: FALLBACK_LABELS[id],
      colorVar: FALLBACK_COLOR_VARS[id],
      categories: id === "industry" ? [...AF] : [],
    };
  }
  return null;
}

export function directionLabel(id: string, c = content()): string {
  return directionDef(id, c)?.label || FALLBACK_LABELS[id] || id;
}

export function directionColor(id: string, c = content()): string {
  const v = directionDef(id, c)?.colorVar || FALLBACK_COLOR_VARS[id] || "--eco-dir-industry";
  return `var(${v})`;
}

export function categoriesForDirection(id: string, c = content()): string[] {
  return (directionDef(id, c)?.categories || []).filter((k) =>
    (AF as readonly string[]).includes(k),
  );
}

function asList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function matchesSpecific(def: TechnologyDef, spec: DirectionSpec | null): boolean {
  if (!spec) return false;
  const lock = def.factionTraitLock ? String(def.factionTraitLock) : "";
  if (lock && asList(spec.factionTraitLocks).includes(lock)) return true;
  const tags = asList(def.tags);
  if (asList(spec.tags).some((t) => t && t !== "general" && tags.includes(t))) {
    return true;
  }
  const icon = def.iconTag ? String(def.iconTag) : "";
  if (icon && asList(spec.iconTags).includes(icon)) return true;
  const path = def.researchPath ? String(def.researchPath) : "";
  if (path && asList(spec.paths).includes(path)) return true;
  const civic = (def as TechnologyDef & { civicPath?: string }).civicPath
    ? String((def as TechnologyDef & { civicPath?: string }).civicPath)
    : "";
  if (civic && asList(spec.civicPaths).includes(civic)) return true;
  return false;
}

export function resolveTechDirection(
  def: TechnologyDef | undefined | null,
  c = content(),
): string | null {
  if (!def) return null;
  const ids = listDirectionIds(c);
  const explicit = typeof def.direction === "string" ? def.direction.trim() : "";
  if (explicit && ids.includes(explicit)) return explicit;

  for (const id of ids) {
    if (id === "industry") continue;
    if (matchesSpecific(def, directionDef(id, c))) return id;
  }

  const industry = directionDef("industry", c);
  const cat = typeof def.category === "string" ? def.category.trim() : "";
  if (cat && asList(industry?.categories).includes(cat)) return "industry";
  const path = def.researchPath ? String(def.researchPath) : "";
  if (path && asList(industry?.paths).includes(path)) return "industry";
  if (ids.includes("industry") && (AF as readonly string[]).includes(cat)) {
    return "industry";
  }
  return null;
}

export function normalizeOfferAxis(value: string | null | undefined, c = content()): string | null {
  if (!value) return null;
  const v = String(value).trim();
  const ids = listDirectionIds(c);
  if (ids.includes(v)) return v;
  if ((AF as readonly string[]).includes(v)) return "industry";
  return null;
}

export function groupOffersByDirection(
  currentOffers: Record<string, { candidates?: string[]; rerolled?: boolean }> | undefined,
  c = content(),
): Record<string, { candidates: string[]; rerolled: boolean }> {
  const ids = listDirectionIds(c);
  const techs = c?.technologies || {};
  const src = currentOffers || {};
  const out: Record<string, { candidates: string[]; rerolled: boolean }> = {};
  for (const id of ids) {
    out[id] = { candidates: [], rerolled: false };
  }
  for (const [key, offer] of Object.entries(src)) {
    if (!offer || !Array.isArray(offer.candidates)) continue;
    const keyDir = normalizeOfferAxis(key, c);
    for (const id of offer.candidates) {
      if (!id) continue;
      const def = techs[id];
      const dir = (def ? resolveTechDirection(def, c) : null) || keyDir;
      if (!dir || !out[dir]) continue;
      if (!out[dir].candidates.includes(id)) out[dir].candidates.push(id);
      if (offer.rerolled) out[dir].rerolled = true;
    }
  }
  return out;
}

export const RESEARCH_DIRECTION_BY_DIGIT: Record<string, string> = Object.fromEntries(
  FALLBACK_DIRECTION_IDS.map((id, i) => [String(i + 1), id]),
);
