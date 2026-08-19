/**
 * Biome / planet-type gates for buildings with biome_restrictions.
 * Keep in sync with src/state/biomeMatch.ts
 */

/**
 * @param {{ type?: string, climate?: string }} planet
 * @param {string} restriction
 */
export function planetMatchesBiome(planet, restriction) {
  const r = String(restriction || "").toLowerCase();
  if (!r) return true;
  const typeRaw = String(planet?.type || "").toLowerCase();
  const type = typeRaw === "terrestrial" ? "rocky" : typeRaw;
  const climate = String(planet?.climate || "").toLowerCase();
  if (type === r || climate === r) return true;
  if (r === "gas_giant" && (type === "gas" || type === "gas_giant")) return true;
  if (r === "ruin" && type === "artifact") return true;
  if (r === "artifact" && type === "artifact") return true;
  if (r === "mountainous" && (type === "rocky" || climate === "mountainous")) return true;
  if (r === "volcanic" && (climate === "infernal" || climate === "hot" || type === "volcanic"))
    return true;
  if (r === "swamp" && (type === "ocean" || type === "toxic" || climate === "swamp")) return true;
  if (r === "ice" && (climate === "cold" || climate === "frozen" || type === "ice")) return true;
  if (r === "desert" && (climate === "arid" || climate === "hot" || type === "desert")) return true;
  if (r === "toxic" && (type === "toxic" || climate === "toxic")) return true;
  if (r === "ocean" && (type === "ocean" || climate === "ocean")) return true;
  if (r === "anomaly" && type === "toxic") return true;
  return false;
}

/**
 * @param {{ type?: string, climate?: string }} planet
 * @param {string[]|undefined} restrictions
 */
export function planetAllowsBuildingBiome(planet, restrictions) {
  if (!Array.isArray(restrictions) || restrictions.length === 0) return true;
  return restrictions.some((r) => planetMatchesBiome(planet, r));
}
