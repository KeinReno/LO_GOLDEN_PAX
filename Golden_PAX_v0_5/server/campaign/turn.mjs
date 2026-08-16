import { listFactions, getCurrentTurn, setCurrentTurn, bumpTableRevision } from "./campaignStore.mjs";
import { loadEconomyAccount, saveEconomyAccount } from "./economyStore.mjs";
import { loadTechAccount, saveTechAccount } from "./techStore.mjs";
import { loadCivicAccount, saveCivicAccount } from "./civicStore.mjs";
import { loadDiplomacyAccount, saveDiplomacyAccount, loadRelations } from "./diplomacyStore.mjs";
import { listFactionPlanets, listSystemsWithPlanets, savePlanet, saveSystemSpaceObjects } from "./planetStore.mjs";
import { listCampaignForces, saveForce } from "./forcesStore.mjs";
import { listSystemLinks } from "./systemLinksStore.mjs";
import { loadFxExchangeState, saveFxExchangeState, loadPegRateOverrides } from "./fxExchangeStore.mjs";
import { loadFactionCourt, saveFactionCourt } from "./npcStore.mjs";
import { runEconomyTick } from "../domain/economy/economyTick.mjs";
import { runCivicTick } from "../domain/court/civicTick.mjs";
import { tickNpcTasks } from "../domain/court/npcTasks.mjs";
import { collectCourtActiveEffects, factionScopeEffects } from "../domain/court/courtActiveEffects.mjs";
import { recomputeInternalBlocs } from "../domain/court/internalBlocs.mjs";
import { tickOpinions } from "../domain/diplomacy/opinion.mjs";
import { planetCapFromBuildings } from "../domain/planets/populationCap.mjs";
import { computeFactionFlowIncome } from "../domain/planets/flowIncome.mjs";
import { factionResourceExtraction } from "../domain/planets/flowContribution.mjs";
import { fleetUpkeep } from "../domain/forces/upkeep.mjs";
import { computeLegacyFloorIncome } from "../domain/economy/legacyIncome.mjs";
import { computeFxExchangeState } from "../domain/economy/fxExchange.mjs";
import { resolveTreasuryPeg, sumGlobalExtractionTotals } from "../domain/economy/currencyPeg.mjs";
import { depleteSystemSpaceObjects } from "../domain/planets/spaceObjects.mjs";
import { computeAllFactionLogistics } from "../domain/systems/logistics.mjs";
import { refillMovementPoints } from "../domain/forces/movement.mjs";
import { tickFactionStability, applyAllRevolts } from "./revoltTick.mjs";
import { writeCampaignTurnJournal } from "./tickJournalStore.mjs";

function mergeIncome(computed, override) {
  const merged = { ...computed };
  for (const [currencyId, amount] of Object.entries(override || {})) {
    merged[currencyId] = (merged[currencyId] || 0) + Number(amount || 0);
  }
  return merged;
}

/**
 * Runs one turn for a campaign: economy tick -> court civic tick ->
 * diplomacy opinion tick, persisting every domain's account after each
 * step (each step reads the previous step's persisted state, same order
 * GMap's processTurn.mjs runs them in — economy before civic/loyalty).
 *
 * Not included yet (see each domain's README "Status" + this project's
 * broader gap list): tech's research queue isn't auto-processed (research
 * stays a player-triggered action, see campaign.mjs's persisted /research
 * route), combat isn't turn-driven (it's resolved per-engagement, not per-
 * tick), and quests aren't persisted yet at all.
 *
 * `factionInputs[factionId]` supplies the pieces no domain computes yet on
 * its own (cultureMetrics, marketVol, treatyCount, pressureAdd) — same
 * caller-supplied pattern documented in domain/economy's README, just
 * supplied at the orchestrator boundary instead of per-request. Two real
 * exceptions, no longer placeholders: diplomacy relations come from
 * `diplomacy_relations`, and — as of domain/planets — a faction's
 * `categoryIncome` is computed from its actual persisted planets/buildings/
 * deposits via `computeFactionFlowIncome` (`domain/planets/flowIncome.mjs`
 * — Stage 2 of the flow-engine port, real RPS conversion across all 6
 * categories, see its header), plus Priority 0's legacy metal/supply floor
 * (`domain/economy/legacyIncome.mjs`) and the currency-peg Pass 5 inside
 * `computeFactionFlowIncome` (uncapped metal/supply from this-turn peg
 * extraction × non-linear dominance rate — NOT GMap EC), with
 * `factionInputs`' values merged in on top
 * (income adds; planets not backed by a persisted row are appended) rather
 * than silently overridden — a faction with no planets yet still works
 * exactly as before, caller-fed. A third: every persisted fleet/legion's
 * per-turn upkeep (`domain/forces/upkeep.mjs`'s `fleetUpkeep`) is
 * subtracted from `categoryIncome` automatically too — a faction with no
 * forces yet pays nothing, same caller-fed-if-absent shape.
 *
 * @param {import("better-sqlite3").Database} db
 * @param {string} campaignId
 * @param {object} content
 * @param {Record<string, { categoryIncome?: object, planets?: object[], pressureAdd?: number, marketVol?: number, treatyCount?: number, cultureMetrics?: object }>} [factionInputs]
 */
export function runCampaignTurn(db, campaignId, content, factionInputs = {}) {
  const factions = listFactions(db, campaignId);
  const turn = (getCurrentTurn(db, campaignId) ?? 0) + 1;
  const inputFor = (factionId) => factionInputs[factionId] || {};

  // --- Economy ---
  const baseGrowth = content.rules?.population?.baseGrowth ?? 0.012;
  const systems = listSystemsWithPlanets(db, campaignId);
  const links = listSystemLinks(db, campaignId);
  const relations = loadRelations(db, campaignId);
  computeAllFactionLogistics({ systems, links, factions, relations, meta: { turn } }, content);
  const factionPlanetsById = new Map(factions.map((f) => [f.id, listFactionPlanets(db, campaignId, f.id)]));
  const allForces = listCampaignForces(db, campaignId);
  const fleets = allForces.filter((f) => f.kind === "fleet");
  const legions = allForces.filter((f) => f.kind === "legion");

  // Court tasks tick before economy so this-turn completions (expiresTurn
  // effects) land in the same Pass-4 / pop-growth stack GMap gets by running
  // processNpcTasks then syncNpcPassiveEffects at the start of the tick.
  const courtByFaction = new Map();
  for (const f of factions) {
    const court = loadFactionCourt(db, campaignId, f.id, content);
    const ticked = tickNpcTasks({
      npcs: court.npcs,
      turn,
      activeEffects: court.activeEffects,
      courtEffects: collectCourtActiveEffects(court, court.npcs, content, { factionId: f.id, systems, turn }),
    });
    const nextCourt = {
      ...court,
      npcs: ticked.npcs,
      activeEffects: ticked.activeEffects,
      internalBlocs: recomputeInternalBlocs(court, ticked.npcs, content),
    };
    saveFactionCourt(db, campaignId, f.id, nextCourt);
    courtByFaction.set(f.id, nextCourt);
  }

  const extractionByFaction = new Map(factions.map((f) => [f.id, factionResourceExtraction(systems, f.id, content)]));
  const globalExtractionTotals = sumGlobalExtractionTotals(extractionByFaction);
  const gmMultipliers = loadPegRateOverrides(db, campaignId);

  const stabilityByFaction = new Map();
  const economyFactions = factions.map((f) => {
    const ownedPlanets = factionPlanetsById.get(f.id) ?? [];
    // Stage 2 of the flow-engine port (domain/planets/flowIncome.mjs, see
    // its header + notes/2026-08-13-resource-extraction-grill.md): deposits
    // + buildings' yield_flat/flow_convert + upkeep_slots all feed one
    // shared 6-category flows grid, real RPS conversion with the bottleneck
    // rule, scaled by job-slots labor (not GMap's biosLaborScale — explicit
    // deviation). Pass 4 (2026-08-14): researched techs' production/upkeep
    // modifiers apply on top, via the real techAccount, so unlocking tech
    // finally has a mechanical payoff (notes/2026-08-14-tech-tree-audit.md).
    // Only the final per-category NET becomes category income.
    const court = courtByFaction.get(f.id);
    const courtEffects = factionScopeEffects(
      collectCourtActiveEffects(court, court?.npcs, content, { factionId: f.id, systems, turn }),
    );
    const stab = tickFactionStability(db, campaignId, f, turn, courtEffects, content);
    stabilityByFaction.set(f.id, stab.value);
    const computedIncome = computeFactionFlowIncome(
      systems,
      f.id,
      content,
      loadTechAccount(db, campaignId, f.id),
      [...courtEffects, ...stab.effects],
      {
        faction: f,
        extractionByResource: extractionByFaction.get(f.id) || {},
        globalExtractionTotals,
        gmMultipliers,
        currentTurn: turn,
      },
    ).income;
    // Standing forces cost upkeep every turn (domain/forces/upkeep.mjs) — a
    // real, ongoing consequence of the recruits/population military
    // mobilized in domain/forces/recruitment.mjs, not a placeholder.
    const upkeep = fleetUpkeep(fleets, legions, f.id, content);
    const negatedUpkeep = Object.fromEntries(Object.entries(upkeep).map(([k, v]) => [k, -v]));
    const totalPopulation = ownedPlanets.reduce((s, p) => s + Number(p.population || 0), 0);
    const floorIncome = computeLegacyFloorIncome(ownedPlanets.length, totalPopulation);
    const computedPlanets = ownedPlanets.map((p) => ({
      id: p.id,
      pop: p.population,
      cap: planetCapFromBuildings(p, content),
      growthRate: baseGrowth,
      habEff: 1,
      supplyFactor: 1,
    }));
    return {
      id: f.id,
      eco: loadEconomyAccount(db, campaignId, f.id),
      categoryIncome: mergeIncome(
        mergeIncome(mergeIncome(computedIncome, negatedUpkeep), floorIncome),
        inputFor(f.id).categoryIncome,
      ),
      pressureAdd: inputFor(f.id).pressureAdd,
      planets: [...computedPlanets, ...(inputFor(f.id).planets || [])],
      popGrowthEffects: courtEffects,
    };
  });

  // FX reference quotes (GMap EC/EMA port) — market display only. Income
  // conversion already ran as flowIncome Pass 5 (dominance formula).
  const extractionByPeg = {};
  for (const extracted of extractionByFaction.values()) {
    for (const [pegId, amount] of Object.entries(extracted)) {
      extractionByPeg[pegId] = (extractionByPeg[pegId] || 0) + amount;
    }
  }
  const ledger = {
    factions: Object.fromEntries(economyFactions.map((f) => [f.id, { stocks: f.eco?.stocks || {} }])),
  };
  const extraPegIds = factions
    .map((f) => resolveTreasuryPeg({ id: f.id, treasuryPeg: f.pegResourceId }, content))
    .filter(Boolean);
  const fxState = computeFxExchangeState(
    content,
    ledger,
    extractionByPeg,
    loadFxExchangeState(db, campaignId),
    turn,
    extraPegIds,
  );
  saveFxExchangeState(db, campaignId, fxState);

  const economyResult = runEconomyTick(economyFactions, turn, content);
  for (const f of economyFactions) {
    saveEconomyAccount(db, campaignId, f.id, f.eco, { turn, journal: economyResult.journal.filter((j) => j.factionId === f.id && j.currencyId) });
    // Write real planets' new population back — planets not backed by a
    // persisted row (caller-supplied extras) have no `id` match here and are skipped.
    const owned = new Map((factionPlanetsById.get(f.id) ?? []).map((p) => [p.id, p]));
    for (const result of f.planets) {
      const persisted = owned.get(result.id);
      if (persisted) savePlanet(db, campaignId, { ...persisted, population: result.pop });
    }
  }

  // Space-object depletion (NOT a port — Q4d: planet deposits stay infinite).
  // Debit after this turn's flow income has already used the objects.
  for (const sys of systems) {
    const next = depleteSystemSpaceObjects(sys, content);
    if (next.changed) saveSystemSpaceObjects(db, campaignId, sys.id, next.spaceObjects);
  }

  const revoltEvents = applyAllRevolts(
    db,
    campaignId,
    factions.map((f) => ({ ...f, stability: stabilityByFaction.get(f.id) })),
    turn,
    content,
  );

  // --- Court (civic) — shares techAccount.unlockedProperties with domain/tech, see civicAccount.mjs ---
  const civicFactions = factions.map((f) => ({
    id: f.id,
    civicAccount: loadCivicAccount(db, campaignId, f.id),
    techAccount: loadTechAccount(db, campaignId, f.id),
    inputs: {
      marketVol: inputFor(f.id).marketVol ?? 0,
      treatyCount: inputFor(f.id).treatyCount ?? 0,
      cultureMetrics: inputFor(f.id).cultureMetrics ?? { cultureShare: 0, avgLoyalty: 50, faithShare: 0 },
    },
  }));
  const civicResult = runCivicTick(civicFactions, content);
  for (const f of civicResult.factions) {
    saveCivicAccount(db, campaignId, f.id, f.civicAccount);
    saveTechAccount(db, campaignId, f.id, f.techAccount, { turn });
  }

  // --- Diplomacy ---
  const diplomacyFactions = factions.map((f) => ({ id: f.id, diplomacy: loadDiplomacyAccount(db, campaignId, f.id) }));
  const diplomacyResult = tickOpinions(diplomacyFactions, relations, content);
  for (const f of diplomacyResult.factions) {
    saveDiplomacyAccount(db, campaignId, f.id, f.diplomacy);
  }

  // Movement-points refill to max every turn, regardless of location
  // (NEW DESIGN — not in GMap; see domain/forces/movement.mjs).
  for (const force of listCampaignForces(db, campaignId)) {
    saveForce(db, campaignId, refillMovementPoints(force, content));
  }

  setCurrentTurn(db, campaignId, turn);
  bumpTableRevision(db, campaignId);

  const economyByFaction = {};
  for (const [factionId, breakdown] of Object.entries(economyResult.breakdowns || {})) {
    economyByFaction[factionId] = {
      channels: breakdown.channels,
      deficit: breakdown.deficit,
      pressure: breakdown.pressure,
    };
  }
  const extraEvents = (revoltEvents || []).map((e) => ({ ...e, type: e.type || "revolt" }));
  const journal = writeCampaignTurnJournal(db, campaignId, turn - 1, turn, {
    economy: economyByFaction,
    extraEvents,
  });

  return {
    turn,
    economy: economyResult,
    civic: civicResult,
    diplomacy: diplomacyResult,
    fx: fxState,
    revolt: revoltEvents,
    journal,
  };
}
