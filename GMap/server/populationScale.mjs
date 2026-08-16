/**
 * Census (lore headcount) ↔ labor units (job-slots / ambient / raise).
 *
 * Owner+Claude Q6: mechanics use abstract tens/hundreds, not millions.
 * Live polities store census in `planet.population` (target 400k–600k
 * per faction). Values below `censusThreshold` are already labor units
 * (v0.5 tests, leftover abstract saves).
 */
const DEFAULTS = {
  censusPerLaborUnit: 1000,
  censusThreshold: 10_000,
  factionCensusMin: 400_000,
  factionCensusMax: 600_000,
  factionCensusTarget: 500_000,
};

export function populationScaleCfg(content) {
  const raw = content?.economy_balance?.population || {};
  return {
    censusPerLaborUnit: Math.max(
      1,
      Number(raw.censusPerLaborUnit) || DEFAULTS.censusPerLaborUnit,
    ),
    censusThreshold: Math.max(
      1,
      Number(raw.censusThreshold) || DEFAULTS.censusThreshold,
    ),
    factionCensusMin: Math.max(
      0,
      Number(raw.factionCensusMin) || DEFAULTS.factionCensusMin,
    ),
    factionCensusMax: Math.max(
      1,
      Number(raw.factionCensusMax) || DEFAULTS.factionCensusMax,
    ),
    factionCensusTarget: Math.max(
      1,
      Number(raw.factionCensusTarget) || DEFAULTS.factionCensusTarget,
    ),
  };
}

export function isCensusPopulation(value, content) {
  const n = Math.max(0, Number(value) || 0);
  return n >= populationScaleCfg(content).censusThreshold;
}

/** Job-slot / ambient population for one planet. */
export function laborPopulation(planet, content) {
  const n = Math.max(0, Number(planet?.population) || 0);
  if (n <= 0) return 0;
  const cfg = populationScaleCfg(content);
  const census =
    planet?.censusLocked === true || n >= cfg.censusThreshold;
  if (!census) return Math.floor(n);
  return Math.floor(n / cfg.censusPerLaborUnit);
}

export function laborToCensus(laborUnits, planet, content) {
  const labor = Math.max(0, Math.floor(Number(laborUnits) || 0));
  if (labor <= 0) return 0;
  const cfg = populationScaleCfg(content);
  const census =
    planet?.censusLocked === true ||
    isCensusPopulation(planet?.population, content);
  if (!census) return labor;
  return labor * cfg.censusPerLaborUnit;
}

/** Sum of labor units on systems this faction owns. */
export function factionLaborPopulation(world, factionId, content) {
  let sum = 0;
  for (const sys of world?.systems ?? []) {
    if (sys.ownerFactionId !== factionId) continue;
    for (const p of sys.planets ?? []) sum += laborPopulation(p, content);
  }
  return sum;
}
