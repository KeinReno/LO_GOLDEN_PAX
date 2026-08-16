/**
 * Player-facing research directions (TECH_TREE_2 P2).
 * Mapping layer over A–F categories / paths / tags / iconTags.
 * Content: content/core/tech_directions.json — not hardcoded tech ids.
 */
import { getContent } from "./contentLoader.mjs";

export const FALLBACK_DIRECTION_IDS = Object.freeze([
  "industry",
  "military",
  "culture",
  "commerce",
  "diplomacy",
  "governance",
]);

const FALLBACK_LABELS = Object.freeze({
  industry: "Индустрия",
  military: "Военное дело",
  culture: "Культура",
  commerce: "Коммерция",
  diplomacy: "Дипломатия",
  governance: "Управление",
});

const FALLBACK_COLOR_VARS = Object.freeze({
  industry: "--eco-dir-industry",
  military: "--eco-dir-military",
  culture: "--eco-dir-culture",
  commerce: "--eco-dir-commerce",
  diplomacy: "--eco-dir-diplomacy",
  governance: "--eco-dir-governance",
});

const AF = Object.freeze(["A", "B", "C", "D", "E", "F"]);

function table(content) {
  const raw = content?.tech_directions || {};
  const dirs = raw.directions && typeof raw.directions === "object" ? raw.directions : {};
  return dirs;
}

export function listDirectionIds(content) {
  const c = content || getContent();
  const raw = c?.tech_directions;
  const order = Array.isArray(raw?.order) ? raw.order.map(String) : [];
  const dirs = table(c);
  const fromOrder = order.filter((id) => dirs[id]);
  if (fromOrder.length) return fromOrder;
  const keys = Object.keys(dirs);
  if (keys.length) return keys;
  return [...FALLBACK_DIRECTION_IDS];
}

export function directionDef(id, content) {
  const spec = table(content)[id];
  if (spec && typeof spec === "object") return spec;
  if (FALLBACK_DIRECTION_IDS.includes(id)) {
    return {
      id,
      label: FALLBACK_LABELS[id],
      colorVar: FALLBACK_COLOR_VARS[id],
      categories: id === "industry" ? [...AF] : [],
    };
  }
  return null;
}

export function directionLabel(id, content) {
  const spec = directionDef(id, content);
  return spec?.label || FALLBACK_LABELS[id] || id;
}

export function directionColorVar(id, content) {
  const spec = directionDef(id, content);
  return spec?.colorVar || FALLBACK_COLOR_VARS[id] || "--eco-dir-industry";
}

export function categoriesForDirection(id, content) {
  const spec = directionDef(id, content);
  const cats = Array.isArray(spec?.categories) ? spec.categories.map(String) : [];
  return cats.filter((k) => AF.includes(k));
}

function asList(value) {
  return Array.isArray(value) ? value.map(String) : [];
}

function matchesSpecific(def, spec) {
  if (!spec) return false;
  const lock = def?.factionTraitLock ? String(def.factionTraitLock) : "";
  if (lock && asList(spec.factionTraitLocks).includes(lock)) return true;
  const tags = asList(def?.tags);
  if (asList(spec.tags).some((t) => t && t !== "general" && tags.includes(t))) {
    return true;
  }
  const icon = def?.iconTag ? String(def.iconTag) : "";
  if (icon && asList(spec.iconTags).includes(icon)) return true;
  const path = def?.researchPath ? String(def.researchPath) : "";
  if (path && asList(spec.paths).includes(path)) return true;
  const civic = def?.civicPath ? String(def.civicPath) : "";
  if (civic && asList(spec.civicPaths).includes(civic)) return true;
  return false;
}

/**
 * Resolve player-facing direction for a tech def.
 * Precedence: explicit `direction` → specific mapping (tags/locks/icon/path)
 * → industry via A–F category. Null if nothing matches.
 */
export function resolveTechDirection(def, content) {
  if (!def) return null;
  const ids = listDirectionIds(content);
  const explicit = typeof def.direction === "string" ? def.direction.trim() : "";
  if (explicit && ids.includes(explicit)) return explicit;

  for (const id of ids) {
    if (id === "industry") continue;
    if (matchesSpecific(def, directionDef(id, content))) return id;
  }

  const industry = directionDef("industry", content);
  const cat = typeof def.category === "string" ? def.category.trim() : "";
  if (cat && asList(industry?.categories).includes(cat)) return "industry";
  const path = def.researchPath ? String(def.researchPath) : "";
  if (path && asList(industry?.paths).includes(path)) return "industry";
  if (ids.includes("industry") && AF.includes(cat)) return "industry";
  return null;
}

/** A–F (or unknown) → direction id. Used by reroll API compat. */
export function normalizeOfferAxis(value, content) {
  if (!value) return null;
  const v = String(value).trim();
  const ids = listDirectionIds(content);
  if (ids.includes(v)) return v;
  if (AF.includes(v)) {
    const mapped = resolveTechDirection({ category: v }, content);
    return mapped || "industry";
  }
  return null;
}

/**
 * Group persisted currentOffers (direction keys, or legacy A–F) into
 * 6 player-facing direction rows. Candidate techs are re-bucketed by
 * resolveTechDirection when defs are present; otherwise the offer key maps.
 */
export function groupOffersByDirection(currentOffers, content) {
  const c = content || getContent();
  const ids = listDirectionIds(c);
  const techs = c?.technologies && typeof c.technologies === "object"
    ? c.technologies
    : {};
  const src = currentOffers && typeof currentOffers === "object" ? currentOffers : {};
  const out = {};
  for (const id of ids) {
    out[id] = { candidates: [], rerolled: false };
  }

  for (const [key, offer] of Object.entries(src)) {
    if (!offer || !Array.isArray(offer.candidates)) continue;
    const keyDir = normalizeOfferAxis(key, c);
    for (const raw of offer.candidates) {
      const s = String(raw);
      if (!s) continue;
      const def = techs[s];
      const dir = (def ? resolveTechDirection(def, c) : null) || keyDir;
      if (!dir || !out[dir]) continue;
      if (!out[dir].candidates.includes(s)) out[dir].candidates.push(s);
      if (offer.rerolled) out[dir].rerolled = true;
    }
  }
  return out;
}

/** Drop legacy A–F offer keys after grouping into directions. */
export function migrateOfferKeys(eco, content) {
  if (!eco.currentOffers || typeof eco.currentOffers !== "object") return false;
  const keys = Object.keys(eco.currentOffers);
  if (!keys.length) return false;
  const ids = new Set(listDirectionIds(content));
  const hasLegacy = keys.some((k) => AF.includes(k));
  const onlyDirections = keys.every((k) => ids.has(k));
  if (!hasLegacy || onlyDirections) return false;
  eco.currentOffers = groupOffersByDirection(eco.currentOffers, content);
  return true;
}
