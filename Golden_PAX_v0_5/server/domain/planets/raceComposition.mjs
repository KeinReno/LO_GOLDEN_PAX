import { rollDie } from "../combat/dice.mjs";

/**
 * NOT a port — GMap never modeled per-race population counts or population
 * transfers (colonization there just hands out a flat number, see
 * colonization.mjs's header). This is new design from the 2026-08-12
 * grill-me session (see notes/2026-08-12-population-race-forces-grill.md,
 * Q1c-Q4). `planet.raceComposition` stores percentages
 * ([{raceId, percent}]); these helpers convert to/from literal counts
 * derived from `planet.population * percent / 100`.
 */
export function raceCountsFromPlanet(planet) {
  const pop = Number(planet?.population) || 0;
  const comp = Array.isArray(planet?.raceComposition) ? planet.raceComposition : [];
  const out = {};
  for (const { raceId, percent } of comp) {
    if (!raceId) continue;
    out[raceId] = (out[raceId] || 0) + (pop * (Number(percent) || 0)) / 100;
  }
  return out;
}

/** Sum of raceCountsFromPlanet across every planet a faction owns. */
export function factionRaceCounts(factionPlanets) {
  const out = {};
  for (const planet of factionPlanets || []) {
    for (const [raceId, count] of Object.entries(raceCountsFromPlanet(planet))) {
      out[raceId] = (out[raceId] || 0) + count;
    }
  }
  return out;
}

function weightedPickRace(counts, excludeIds, rng) {
  const entries = Object.entries(counts).filter(([id, n]) => n > 0 && !excludeIds.includes(id));
  const total = entries.reduce((s, [, n]) => s + n, 0);
  if (!entries.length || total <= 0) return null;
  let r = rng() * total;
  for (const [id, n] of entries) {
    r -= n;
    if (r <= 0) return id;
  }
  return entries[entries.length - 1][0];
}

/**
 * Auto-mode colonization race mix (grill Q1b/Q3): 1d6 purity roll — 1-3
 * pure (100% founder race), 4-5 light mix (80/20), 6 heavy mix
 * (55/25/20, or 55/45 if only one other race exists). Secondary races are
 * drawn weighted from the faction's own existing empire-wide population
 * (`counts`), never from the game's full race list — a faction with no
 * other planets always rolls pure, since there's nothing to mix in.
 * @param {string} founderRaceId
 * @param {Record<string, number>} counts  factionRaceCounts() output
 * @param {() => number} [rng]  injectable for deterministic tests
 */
export function rollAutoComposition(founderRaceId, counts, rng = Math.random) {
  const roll = rollDie(6);
  const others = Object.keys(counts).filter((id) => id !== founderRaceId && counts[id] > 0);

  if (roll <= 3 || others.length === 0) {
    return { roll, composition: [{ raceId: founderRaceId, percent: 100 }] };
  }
  if (roll <= 5) {
    const secondary = weightedPickRace(counts, [founderRaceId], rng);
    if (!secondary) return { roll, composition: [{ raceId: founderRaceId, percent: 100 }] };
    return {
      roll,
      composition: [
        { raceId: founderRaceId, percent: 80 },
        { raceId: secondary, percent: 20 },
      ],
    };
  }
  const secondary1 = weightedPickRace(counts, [founderRaceId], rng);
  if (!secondary1) return { roll, composition: [{ raceId: founderRaceId, percent: 100 }] };
  const secondary2 = weightedPickRace(counts, [founderRaceId, secondary1], rng);
  if (!secondary2) {
    return {
      roll,
      composition: [
        { raceId: founderRaceId, percent: 55 },
        { raceId: secondary1, percent: 45 },
      ],
    };
  }
  return {
    roll,
    composition: [
      { raceId: founderRaceId, percent: 55 },
      { raceId: secondary1, percent: 25 },
      { raceId: secondary2, percent: 20 },
    ],
  };
}

/**
 * Deduct `amount` of `raceId`'s population from one planet, recomputing
 * population + raceComposition percentages. Clamps to what the planet
 * actually has; never goes negative.
 */
export function withDeductedRacePopulation(planet, raceId, amount) {
  const counts = raceCountsFromPlanet(planet);
  const have = counts[raceId] || 0;
  const take = Math.min(have, Math.max(0, Number(amount) || 0));
  if (take <= 0) return planet;

  counts[raceId] = have - take;
  const nextPopulation = Math.max(0, (Number(planet.population) || 0) - take);
  const nextComposition =
    nextPopulation > 0
      ? Object.entries(counts)
          .filter(([, c]) => c > 1e-6)
          .map(([id, c]) => ({ raceId: id, percent: (c / nextPopulation) * 100 }))
      : [];

  return { ...planet, population: nextPopulation, raceComposition: nextComposition };
}

/**
 * Spread deducting `amount` of `raceId` across every faction planet that
 * has it, proportional to each planet's share of the empire-wide count for
 * that race (grill Q2 flag: "which planet(s) does the empire-wide pool
 * draw from" — resolved here as proportional, not first-planet-first or
 * even split; revisit if this reads oddly in play). Returns only the
 * planets that actually changed.
 */
export function deductRaceAcrossPlanets(factionPlanets, raceId, amount) {
  const shares = (factionPlanets || [])
    .map((planet) => ({ planet, have: raceCountsFromPlanet(planet)[raceId] || 0 }))
    .filter((s) => s.have > 0);
  const total = shares.reduce((s, x) => s + x.have, 0);
  if (!shares.length || total <= 0) return [];

  const target = Math.min(total, Math.max(0, Number(amount) || 0));
  const updated = [];
  for (const { planet, have } of shares) {
    const take = Math.min(have, Math.round((have / total) * target));
    if (take <= 0) continue;
    updated.push(withDeductedRacePopulation(planet, raceId, take));
  }
  return updated;
}
