/**
 * v0.5: a map deposit pays named extraction only if the planet has a matching
 * building. Bare deposit tiles yield nothing.
 *
 * Match (first hit wins per building):
 *   1. `extractsDeposits` includes the deposit id
 *   2. `extractsCategory` equals / includes the deposit category
 *   3. otherwise same A–F `category` (v0.5 Q6)
 *
 * Disabled buildings do not match. Uncategorized deposits are not named
 * extraction (legacy metal/supply floor stays on its own path).
 */
import {
  lookupMapResource,
  planetBuildingList,
  resolveBuildingDef,
} from "./flowEngine.mjs";
import { isMapDeposit } from "./slotResolver.mjs";
import { planetAllowsBuildingBiome } from "./biomeMatch.mjs";

function asList(value) {
  if (value == null || value === "") return [];
  return Array.isArray(value) ? value : [value];
}

export function depositResourceId(content, depositType) {
  const def = lookupMapResource(content, depositType);
  return def?.id ?? null;
}

export function buildingUnlocksDeposit(buildingDef, depositDef) {
  if (!buildingDef || !depositDef) return false;
  const depositId = depositDef.id;
  const named = asList(buildingDef.extractsDeposits);
  if (depositId && named.includes(depositId)) return true;
  // Explicit extractsCategory (including none/empty) never falls through to A–F.
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

export function canExtractDeposit({
  buildings = [],
  depositType,
  content,
  planet = null,
} = {}) {
  const depositDef = lookupMapResource(content, depositType);
  const resourceId = depositDef?.id ?? null;
  if (
    !depositDef ||
    !isMapDeposit(depositDef) ||
    depositDef.category == null ||
    depositDef.tier == null
  ) {
    return { allowed: false, resourceId };
  }
  for (const inst of buildings) {
    if (inst?.disabled) continue;
    const def = resolveBuildingDef(content, inst);
    if (
      planet &&
      def?.biome_restrictions?.length &&
      !planetAllowsBuildingBiome(planet, def.biome_restrictions)
    ) {
      continue;
    }
    if (buildingUnlocksDeposit(def, depositDef)) {
      return { allowed: true, resourceId };
    }
  }
  return { allowed: false, resourceId };
}

/** Deposit names on this planet that a matching building unlocks. */
export function extractableDepositIds(planet, content) {
  const buildings = planetBuildingList(planet);
  const out = [];
  for (const name of planet?.resources || []) {
    const { allowed } = canExtractDeposit({
      buildings,
      depositType: name,
      content,
      planet,
    });
    if (allowed) out.push(name);
  }
  return out;
}

/** Content-declared extractor → deposit mapping (explicit keys only). */
export function extractorDepositMap(content) {
  const out = {};
  for (const def of Object.values(content?.buildings || {})) {
    if (!def?.id) continue;
    const extractsCategory = asList(def.extractsCategory);
    const extractsDeposits = asList(def.extractsDeposits);
    if (extractsCategory.length === 0 && extractsDeposits.length === 0) continue;
    out[def.id] = { extractsCategory, extractsDeposits };
  }
  return out;
}
