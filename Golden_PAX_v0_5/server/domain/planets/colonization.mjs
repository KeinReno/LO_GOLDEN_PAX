import { colonyDefForType, normalizeColonyType } from "./buildingDefs.mjs";
import { canAffordCost } from "../tech/afford.mjs";
import { adjustStock } from "../economy/adjustStock.mjs";
import { raceCountsFromPlanet, factionRaceCounts, rollAutoComposition, withDeductedRacePopulation, deductRaceAcrossPlanets } from "./raceComposition.mjs";

/**
 * Ported verbatim from GMap/server/planetActions.mjs's canColonizePlanet —
 * already pure, but module-private there (never exported), so this is
 * behavior-tested in colonization.test.mjs rather than diffed directly.
 */
export function canColonizePlanet(system, planet, factionId) {
  if (system.ownerFactionId !== factionId) return false;
  if ((planet.population ?? 0) > 0) return false;
  const ct = normalizeColonyType(planet.colonyType);
  if (ct && ct !== "none") return false;
  if (planet.ownerFactionId && planet.ownerFactionId !== factionId) return false;
  if (planet.colonizable === false) return false;
  return !!(planet.habitable || planet.colonizable !== false);
}

/**
 * Resolve which races settle a new colony and how many settlers total —
 * NOT a port, new design from the 2026-08-12 grill session (Q1c-Q4). Auto
 * mode keeps GMap's original flat colonizePopulation-by-type quantity and
 * only randomizes the race mix (rollAutoComposition). Manual mode takes the
 * caller's exact per-race settler counts as-is.
 * @returns {{ ok: boolean, error?: string, composition?: {raceId:string, count:number}[], diceRoll?: number }}
 */
function resolveComposition(cdef, opts) {
  if (opts.mode === "manual") {
    const composition = (opts.manualComposition || []).filter((r) => r?.raceId && Number(r.count) > 0);
    if (!composition.length) return { ok: false, error: "manual composition required" };
    return { ok: true, composition: composition.map((r) => ({ raceId: r.raceId, count: Math.round(Number(r.count)) })) };
  }

  if (!opts.founderRaceId) return { ok: false, error: "founderRaceId required for auto mode" };
  const totalSettlers = Math.max(1, Math.round(cdef.colonizePopulation ?? 2));
  const counts = factionRaceCounts(opts.factionPlanets || []);
  const rolled = rollAutoComposition(opts.founderRaceId, counts);
  const composition = rolled.composition.map((c) => ({ raceId: c.raceId, count: Math.round((c.percent / 100) * totalSettlers) }));
  const sum = composition.reduce((s, c) => s + c.count, 0);
  if (sum !== totalSettlers) composition[0].count += totalSettlers - sum; // rounding fixup, keeps the founder's share
  return { ok: true, composition, diceRoll: rolled.roll };
}

/**
 * Deduct the composition's population from its source(s). A faction with no
 * owned planets yet (its very first colony) is exempt — there's nothing to
 * transfer from, same as GMap's original "population from nowhere" behavior
 * for a founding world; every colony after that is a real transfer (grill
 * Q2). Manual mode + an explicit sourcePlanetId deducts entirely from that
 * one planet; otherwise the draw spreads proportionally across every
 * faction planet that has the race (deductRaceAcrossPlanets).
 * @returns {{ ok: boolean, error?: string, updatedPlanets?: object[] }}
 */
function deductSourcePopulation(composition, opts) {
  const factionPlanets = opts.factionPlanets || [];
  if (!factionPlanets.length) return { ok: true, updatedPlanets: [] };

  if (opts.mode === "manual" && opts.sourcePlanetId) {
    let source = factionPlanets.find((p) => p.id === opts.sourcePlanetId);
    if (!source) return { ok: false, error: "source planet not found" };
    const available = raceCountsFromPlanet(source);
    for (const { raceId, count } of composition) {
      if ((available[raceId] || 0) + 1e-6 < count) {
        return { ok: false, error: `source planet lacks enough ${raceId} population (have ${Math.floor(available[raceId] || 0)}, need ${count})` };
      }
    }
    for (const { raceId, count } of composition) source = withDeductedRacePopulation(source, raceId, count);
    return { ok: true, updatedPlanets: [source] };
  }

  const empireCounts = factionRaceCounts(factionPlanets);
  for (const { raceId, count } of composition) {
    if ((empireCounts[raceId] || 0) + 1e-6 < count) {
      return { ok: false, error: `not enough ${raceId} population available empire-wide (have ${Math.floor(empireCounts[raceId] || 0)}, need ${count})` };
    }
  }
  const updatedPlanets = composition.flatMap(({ raceId, count }) => deductRaceAcrossPlanets(factionPlanets, raceId, count));
  return { ok: true, updatedPlanets };
}

/**
 * Colonize a planet: pay the colony type's cost, resolve race
 * composition/quantity, transfer that population from the faction's other
 * planets, set population/owner. Scoped from GMap's "colonize" branch of
 * applyPlanetAction — real affordability/effects, no AP gating or intent
 * recording (this project hasn't ported GMap's AP-budget system, see
 * README.md "Status"). Population transfer itself is new design, not a
 * port — see resolveComposition/deductSourcePopulation above.
 *
 * @param {object} system @param {object} planet @param {string} factionId
 * @param {string} colonyType  e.g. "outpost" | "colony" | "core"
 * @param {Record<string, number>} stocks
 * @param {object} content
 * @param {object} [opts]
 * @param {"auto"|"manual"} [opts.mode]  default "auto"
 * @param {string} [opts.founderRaceId]  required for auto mode — the faction's own race
 * @param {object[]} [opts.factionPlanets]  every OTHER planet this faction owns (population source pool); omit/[] for a founding colony
 * @param {{raceId:string, count:number}[]} [opts.manualComposition]  manual mode: exact settlers per race
 * @param {string} [opts.sourcePlanetId]  manual mode: deduct entirely from this one planet instead of spreading across the empire
 * @returns {{ ok: boolean, error?: string, planet?: object, stocks?: object, journal?: object[], sourcePlanets?: object[], diceRoll?: number }}
 */
export function colonizePlanet(system, planet, factionId, colonyType, stocks, content, opts = {}) {
  if (!canColonizePlanet(system, planet, factionId)) {
    return { ok: false, error: "cannot colonize (needs your own system + an empty planet)" };
  }
  const targetType = normalizeColonyType(colonyType || "outpost");
  if (targetType === "none") return { ok: false, error: "colony type required" };
  const cdef = colonyDefForType(content, targetType);
  if (!cdef) return { ok: false, error: "unknown colony type" };

  const cost = cdef.colonizeCost || {};
  const afford = canAffordCost(stocks, cost);
  if (!afford.ok) return afford;

  const resolved = resolveComposition(cdef, opts);
  if (!resolved.ok) return resolved;
  const { composition, diceRoll } = resolved;
  const totalSettlers = composition.reduce((s, c) => s + c.count, 0);
  if (totalSettlers <= 0) return { ok: false, error: "no settlers to send" };

  const deducted = deductSourcePopulation(composition, opts);
  if (!deducted.ok) return deducted;

  let nextStocks = stocks;
  const journal = [];
  for (const [currencyId, amount] of Object.entries(cost)) {
    const n = Number(amount || 0);
    if (!n) continue;
    const result = adjustStock({ factionId, stocks: nextStocks }, currencyId, -n, { reason: "colonize" });
    nextStocks = result.stocks;
    if (result.journalEntry) journal.push(result.journalEntry);
  }

  const nextPlanet = {
    ...planet,
    colonyType: targetType,
    population: totalSettlers,
    ownerFactionId: factionId,
    habitable: planet.habitable ?? true,
    colonizable: true,
    raceComposition: composition.map((c) => ({ raceId: c.raceId, percent: (c.count / totalSettlers) * 100 })),
    surfaceBuildings: planet.surfaceBuildings || [],
    orbitalBuildings: planet.orbitalBuildings || [],
  };

  return { ok: true, planet: nextPlanet, stocks: nextStocks, journal, sourcePlanets: deducted.updatedPlanets, diceRoll };
}
