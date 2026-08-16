/**
 * Colonize population transfer + race mix (v0.5 port).
 * Auto quantity stays colonies.json `colonizePopulation`; mix is a 1d6
 * purity roll weighted from the source planet. Settlers are deducted from
 * one owned source (explicit `sourcePlanetId`, same-system default, else
 * highest-pop owned world anywhere). Never spawn people from thin air.
 */
import { randomInt } from "node:crypto";

function rollDie6() {
  return randomInt(1, 7);
}

function planetOwnerId(system, planet) {
  return planet?.ownerFactionId || system?.ownerFactionId || null;
}

export function raceCountsFromPlanet(planet, fallbackRaceId) {
  const pop = Number(planet?.population) || 0;
  const comp = Array.isArray(planet?.raceComposition)
    ? planet.raceComposition
    : [];
  const out = {};
  for (const row of comp) {
    const raceId = row?.raceId;
    if (!raceId) continue;
    out[raceId] = (out[raceId] || 0) + (pop * (Number(row.percent) || 0)) / 100;
  }
  if (!Object.keys(out).length && pop > 0 && fallbackRaceId) {
    out[fallbackRaceId] = pop;
  }
  return out;
}

export function majorityRaceId(planet, fallbackRaceId) {
  const counts = raceCountsFromPlanet(planet, fallbackRaceId);
  let best = fallbackRaceId || null;
  let bestN = -1;
  for (const [id, n] of Object.entries(counts)) {
    if (n > bestN) {
      best = id;
      bestN = n;
    }
  }
  return best;
}

function weightedPickRace(counts, excludeIds, rng) {
  const entries = Object.entries(counts).filter(
    ([id, n]) => n > 0 && !excludeIds.includes(id),
  );
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
 * 1d6 purity: 1–3 pure founder, 4–5 80/20, 6 55/25/20 (or 55/45).
 * Secondary races come from `counts` (source planet), never the global list.
 */
export function rollAutoComposition(
  founderRaceId,
  counts,
  { rng = Math.random, rollDieFn = rollDie6 } = {},
) {
  const roll = rollDieFn();
  const others = Object.keys(counts).filter(
    (id) => id !== founderRaceId && counts[id] > 0,
  );

  if (roll <= 3 || others.length === 0) {
    return { roll, composition: [{ raceId: founderRaceId, percent: 100 }] };
  }
  if (roll <= 5) {
    const secondary = weightedPickRace(counts, [founderRaceId], rng);
    if (!secondary) {
      return { roll, composition: [{ raceId: founderRaceId, percent: 100 }] };
    }
    return {
      roll,
      composition: [
        { raceId: founderRaceId, percent: 80 },
        { raceId: secondary, percent: 20 },
      ],
    };
  }
  const secondary1 = weightedPickRace(counts, [founderRaceId], rng);
  if (!secondary1) {
    return { roll, composition: [{ raceId: founderRaceId, percent: 100 }] };
  }
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

export function withDeductedRacePopulation(planet, raceId, amount) {
  const fallback = majorityRaceId(planet, raceId);
  const counts = raceCountsFromPlanet(planet, fallback);
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

  return {
    ...planet,
    population: nextPopulation,
    raceComposition: nextComposition,
  };
}

export function listOwnedPlanetRefs(world, factionId) {
  const out = [];
  for (const system of world?.systems ?? []) {
    for (const planet of system.planets ?? []) {
      if (planetOwnerId(system, planet) === factionId) {
        out.push({ system, planet });
      }
    }
  }
  return out;
}

function populatedOwnedExcludingDest(owned, destPlanetId) {
  return (owned || []).filter(
    (o) => o.planet.id !== destPlanetId && (o.planet.population ?? 0) > 0,
  );
}

function byPopulationDesc(a, b) {
  return (b.planet.population ?? 0) - (a.planet.population ?? 0);
}

/**
 * Explicit source if given; else highest-pop owned world in the dest system;
 * else highest-pop owned world anywhere. Fail closed when missing, unowned,
 * empty, or the destination itself — never invent population.
 */
export function pickColonizeSource({
  owned,
  destPlanetId,
  destSystemId,
  sourcePlanetId,
}) {
  if (sourcePlanetId) {
    const found = (owned || []).find((o) => o.planet.id === sourcePlanetId);
    if (!found) {
      return {
        ok: false,
        error: "Планета-источник не под вашим контролем",
        code: "source_not_owned",
      };
    }
    if (found.planet.id === destPlanetId) {
      return {
        ok: false,
        error: "Нельзя переселять с целевой планеты",
        code: "source_is_destination",
      };
    }
    if ((found.planet.population ?? 0) <= 0) {
      return {
        ok: false,
        error: "На планете-источнике не хватает населения",
        code: "source_lacks_people",
      };
    }
    return { ok: true, source: found };
  }

  const eligible = populatedOwnedExcludingDest(owned, destPlanetId);
  const sameSystem = eligible
    .filter((o) => o.system.id === destSystemId)
    .sort(byPopulationDesc);
  if (sameSystem[0]) return { ok: true, source: sameSystem[0] };

  const anywhere = eligible.slice().sort(byPopulationDesc);
  if (anywhere[0]) return { ok: true, source: anywhere[0] };
  return {
    ok: false,
    error: "Нет своей населённой планеты для переселения",
    code: "source_lacks_people",
  };
}

function compositionCounts(percentRows, totalSettlers) {
  const composition = (percentRows || [])
    .filter((c) => c?.raceId)
    .map((c) => ({
      raceId: c.raceId,
      count: Math.round((Number(c.percent) / 100) * totalSettlers),
    }));
  if (!composition.length) return [];
  const sum = composition.reduce((s, c) => s + c.count, 0);
  composition[0].count += totalSettlers - sum;
  return composition.filter((c) => c.count > 0);
}

/**
 * Resolve settlers, deduct from source, return dest mix. Mutates the live
 * source planet on `world` (population + raceComposition only).
 */
export function transferColonizePopulation({
  world,
  destSystem,
  destPlanet,
  factionId,
  settlerCount,
  sourcePlanetId,
  founderRaceId,
  rng = Math.random,
  rollDieFn,
} = {}) {
  const totalSettlers = Math.max(0, Math.round(Number(settlerCount) || 0));
  if (totalSettlers <= 0) {
    return { ok: false, error: "Нет переселенцев", code: "no_settlers" };
  }

  const owned = listOwnedPlanetRefs(world, factionId);
  const picked = pickColonizeSource({
    owned,
    destPlanetId: destPlanet?.id,
    destSystemId: destSystem?.id,
    sourcePlanetId,
  });
  if (!picked.ok) return picked;
  const source = picked.source.planet;

  const founder =
    founderRaceId || majorityRaceId(source, null);
  if (!founder) {
    return {
      ok: false,
      error: "Неизвестна раса основателя",
      code: "founder_race_unknown",
    };
  }

  const counts = raceCountsFromPlanet(source, founder);
  if ((Number(source.population) || 0) + 1e-6 < totalSettlers) {
    return {
      ok: false,
      error: "На планете-источнике не хватает населения",
      code: "source_lacks_people",
    };
  }

  const rolled = rollAutoComposition(founder, counts, { rng, rollDieFn });
  const composition = compositionCounts(rolled.composition, totalSettlers);
  if (!composition.length) {
    return { ok: false, error: "Нет переселенцев", code: "no_settlers" };
  }

  for (const { raceId, count } of composition) {
    if ((counts[raceId] || 0) + 1e-6 < count) {
      return {
        ok: false,
        error: `На планете-источнике не хватает населения (${raceId})`,
        code: "source_lacks_people",
      };
    }
  }

  let updated = source;
  for (const { raceId, count } of composition) {
    updated = withDeductedRacePopulation(updated, raceId, count);
  }
  source.population = updated.population;
  source.raceComposition = updated.raceComposition;

  const destComposition = composition.map((c) => ({
    raceId: c.raceId,
    percent: (c.count / totalSettlers) * 100,
  }));

  return {
    ok: true,
    destPopulation: totalSettlers,
    destComposition,
    sourcePlanet: source,
    diceRoll: rolled.roll,
  };
}
