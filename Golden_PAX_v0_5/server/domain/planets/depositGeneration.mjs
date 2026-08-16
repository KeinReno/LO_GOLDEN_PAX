import { planetMatchesBiome } from "./biomeMatch.mjs";

/**
 * NOT a port — GMap's deposits are map-editor authored; this project's
 * grill (notes/2026-08-13-resource-extraction-grill.md Q1) accepted
 * procedural biome-based generation as a follow-up. Inverse of
 * biomeMatch.mjs's planetAllowsBuildingBiome: given a planet, which
 * map_resources.json deposits match its type/climate.
 *
 * Empty biome_tags do NOT match (unlike empty building restrictions, which
 * allow everywhere). Untagged deposits stay GM-authored only.
 *
 * Count 1–3 is a first-pass default (spec Priority 3c), capped by how
 * many deposits actually match.
 */

export const DEFAULT_DEPOSIT_MIN = 1;
export const DEFAULT_DEPOSIT_MAX = 3;

/** True when at least one of the deposit's biome_tags matches the planet. */
export function resourceMatchesPlanet(planet, biomeTags) {
  if (!Array.isArray(biomeTags) || biomeTags.length === 0) return false;
  return biomeTags.some((tag) => planetMatchesBiome(planet, tag));
}

export function depositsMatchingPlanet(planet, content) {
  const defs = Object.values(content?.map_resources || {});
  const ids = [];
  for (const def of defs) {
    if (!def?.id) continue;
    if (resourceMatchesPlanet(planet, def.biome_tags)) ids.push(def.id);
  }
  return ids;
}

function shuffleInPlace(items, rng) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
  return items;
}

/**
 * Roll a random subset of biome-matching deposit ids.
 * @param {{ type?: string, climate?: string }} planet
 * @param {object} content
 * @param {{ min?: number, max?: number, rng?: () => number }} [opts]
 */
export function generatePlanetResources(planet, content, opts = {}) {
  const min = opts.min ?? DEFAULT_DEPOSIT_MIN;
  const max = opts.max ?? DEFAULT_DEPOSIT_MAX;
  const rng = opts.rng ?? Math.random;
  const pool = depositsMatchingPlanet(planet, content);
  if (pool.length === 0) return [];
  const want = min + Math.floor(rng() * (max - min + 1));
  const count = Math.min(pool.length, Math.max(min, want));
  return shuffleInPlace(pool.slice(), rng).slice(0, count);
}

/**
 * Create-planet resource policy: explicit `resources` (including []) always
 * wins; otherwise auto-generate when the flag is set; otherwise [].
 */
export function resolvePlanetResources({ resources, autoGenerateResources, type, climate }, content, opts) {
  if (Array.isArray(resources)) return resources.slice();
  if (autoGenerateResources) return generatePlanetResources({ type, climate }, content, opts);
  return [];
}
