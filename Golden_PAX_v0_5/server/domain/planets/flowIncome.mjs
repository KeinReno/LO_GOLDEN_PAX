import { emptyFlows, computeNets, categoryTotals, categoryToCurrency, CATEGORIES, reconcileSecondaryDemand } from "../economy/flowEngine.mjs";
import { addPlanetExtraction, addPlanetBuildingFlows, addPlanetUpkeepDemand, popBiosDemand } from "./flowContribution.mjs";
import { addSystemSpaceObjectEffects } from "./spaceObjects.mjs";
import { buildModifierStack, mergeChannels, applyProductionChannel, applyUpkeepChannel } from "../economy/modifierStack.mjs";
import { collectTechModifierEffects } from "../tech/techModifierEffects.mjs";
import { activeSocketEffects } from "../tech/techSocket.mjs";
import { logisticsProductionMult, logisticsUpkeepMult } from "../systems/logistics.mjs";
import { convertPeggedResource, strategicExtractionStocks } from "../economy/currencyPeg.mjs";

/**
 * NOT a port — new design (2026-08-14, see
 * notes/2026-08-14-ambient-flow-economy-grill.md). GMap's ambient D/E was a
 * flat per-inhabited-planet constant (`inhabitedPlanets*2`/`max(1,
 * inhabitedPlanets)`), independent of population or development — a
 * faithful port of that formula still under-performs here because this
 * project's Stage 2 deviation (deposits only extract behind a matching
 * building, GMap extracts for free) makes the tiny ambient trickle far
 * more load-bearing than it was in GMap's original economy. Grounded in
 * total population instead, consistent with this project's "nothing from
 * thin air" principle. Coefficients are first-pass defaults, not hand-tuned.
 */
export const AMBIENT_ENERGIA_PER_POP = 0.6;
export const AMBIENT_BIOS_PER_POP = 0.5;

/**
 * A faction's full category income for one turn. Ported from GMap/server/
 * economyTick.mjs's computeFlowBreakdown, minus the modifier stack /
 * legacy metal-supply bridge / strategic-resource tracking (see
 * flowEngine.mjs's header for why those stay out of scope).
 *
 * Runs as three passes across EVERY owned planet, in this exact order —
 * not bundled per-planet (see flowContribution.mjs's header for the live
 * pass-ordering bug this fixes): (1) extraction + owned-system space-object
 * effects + the ambient population-scaled D/E bonus, which must all be in
 * the grid before any converter runs; (2) buildings' yield_flat/
 * flow_convert/capacity_add — each conversion's primary leg runs
 * immediately per-planet, but secondary/catalyst claims are collected
 * across every planet and reconciled once, after this pass, so a
 * contested category resolves primary-demand-first regardless of building/
 * planet order (2026-08-14 fix for a second live-verified bug — see
 * flowEngine.mjs's `applyFlowConvertPrimary`/`reconcileSecondaryDemand`
 * headers); (3) upkeep demand (buildings' upkeep_slots + population bios).
 * Space-object control is system.ownerFactionId (no presence mechanic);
 * see domain/planets/spaceObjects.mjs.
 *
 * Pass 4: researched techs' `production_mult`/`production_flat`/`upkeep_mult`
 * effects are applied to the final per-category net, via
 * `domain/economy/modifierStack.mjs` — the same post-processing step GMap's
 * `economyTick.mjs` uses (NOT injected into the building-conversion
 * machinery, so this doesn't interact with Pass 2's primary/secondary
 * reconciliation at all). Court faction-scope effects
 * (`collectCourtActiveEffects`) merge into the same stack via
 * `mergeChannels` (COURT_AND_NPC_ROSTER_SPEC Part 4). Race/culture/faith/tax/
 * treaty/faction-trait effects still aren't wired (see modifierStack.mjs).
 *
 * Pass 5 (new, 2026-08-15, CURRENCY_PEG_SPEC): optional `pegContext`. When
 * present, this-turn strategic extraction is credited as raw `map.*` stocks
 * (barter pile) and, if the faction has a treasury peg, uncapped
 * metal/supply from `convertPeggedResource` (non-linear dominance rate).
 * Same post-processing-on-final-totals shape as Pass 4 — never woven into
 * Pass 2. Omitted `pegContext` leaves income identical to pre-peg callers.
 *
 * Logistics (GMap port): per-system `logisticsProductionMult` /
 * `logisticsUpkeepMult` scale Pass 1–3 contributions as they enter the
 * grid — before Pass 4's faction-level modifier stack, matching GMap's
 * application point in economyTick.mjs. Ambient D/E and pop bios demand
 * stay unscaled. A system with no `logistics` object is a no-op (mult 1).
 *
 * @param {object[]} systems  every system in the campaign (matches
 *   listSystemsWithPlanets's shape) — ownership is checked per-planet here,
 *   same as GMap, so the caller doesn't need to pre-filter.
 * @param {string} factionId
 * @param {object} content
 * @param {{ unlockedTechs?: string[], techGrades?: Record<string, number>, techSockets?: Record<string, string> }} [techAccount]
 *   optional — omitting it just means no tech modifiers / sockets apply
 *   (same as a faction that's researched nothing).
 * @param {object[]} [courtEffects]  faction-scope court effects (seats /
 *   postings / traits / expiring npc_task effects). Omit = no court mods.
 * @param {{
 *   faction?: object,
 *   extractionByResource?: Record<string, number>,
 *   globalExtractionTotals?: Record<string, number>,
 *   gmMultipliers?: Record<string, number>,
 *   currentTurn?: number,
 * }} [pegContext]  Pass 5. Omit = no peg conversion / raw map.* credit
 *   (existing callers stay bit-identical).
 * @returns {{ income: Record<string,number>, flows: object, totals: object }}
 */
export function computeFactionFlowIncome(systems, factionId, content, techAccount, courtEffects, pegContext) {
  const flows = emptyFlows();

  // Pass 1: extraction + space-object effects + ambient baselines —
  // must exist before converters. Space objects sit in GMap's per-system
  // loop next to extraction (economyTick.mjs), before Pass 2 buildings.
  // Logistics prodScale is applied here per system, same as GMap.
  let totalPopulation = 0;
  for (const sys of systems ?? []) {
    const prodScale = logisticsProductionMult(sys, content);
    for (const planet of sys.planets ?? []) {
      if ((planet.ownerFactionId ?? sys.ownerFactionId) !== factionId) continue;
      addPlanetExtraction(flows, planet, content, { rateScale: prodScale });
      totalPopulation += Math.max(0, Number(planet.population) || 0);
    }
    addSystemSpaceObjectEffects(flows, sys, factionId, content, { rateScale: prodScale });
  }
  if (totalPopulation > 0) {
    flows.D[1].rate += Math.max(1, Math.ceil(totalPopulation * AMBIENT_ENERGIA_PER_POP)); // ambient energy (sun/geo)
    flows.E[1].rate += Math.max(1, Math.ceil(totalPopulation * AMBIENT_BIOS_PER_POP)); // subsistence bios
  }

  // Pass 2: building yields/converts (after inputs exist). Primary legs run
  // immediately per-planet (real chain dependencies); secondary/catalyst
  // claims are collected across EVERY owned planet and reconciled once,
  // below, so a contested category resolves primary-demand-first
  // regardless of which planet or building happened to run first.
  const pendingSecondary = [];
  const primaryCategoriesUsed = new Set();
  for (const sys of systems ?? []) {
    const prodScale = logisticsProductionMult(sys, content);
    for (const planet of sys.planets ?? []) {
      if ((planet.ownerFactionId ?? sys.ownerFactionId) !== factionId) continue;
      addPlanetBuildingFlows(flows, planet, content, pendingSecondary, primaryCategoriesUsed, { rateScale: prodScale });
    }
  }
  reconcileSecondaryDemand(flows, pendingSecondary, primaryCategoriesUsed);

  // Pass 3: upkeep demand (buildings + population). Socket-driven category
  // swaps (Tech Tree 2.0, deviation 4 in flowContribution.mjs) land here —
  // after conversion, same pass as ordinary upkeep, so they cannot starve
  // Pass 2 converters. Disconnected systems pay logisticsUpkeepMult.
  const socketEffects = activeSocketEffects(techAccount, content);
  let totalPopBiosDemand = 0;
  for (const sys of systems ?? []) {
    const demandScale = logisticsUpkeepMult(sys, content);
    for (const planet of sys.planets ?? []) {
      if ((planet.ownerFactionId ?? sys.ownerFactionId) !== factionId) continue;
      addPlanetUpkeepDemand(flows, planet, content, socketEffects, { demandScale });
      totalPopBiosDemand += popBiosDemand(planet, content);
    }
  }
  if (totalPopBiosDemand > 0) flows.E[1].demand += totalPopBiosDemand;

  const nets = computeNets(flows);
  const totals = categoryTotals(nets);

  // Pass 4: tech production/upkeep modifiers, applied to the final net per
  // category — see this function's header for why this is a clean
  // post-processing step, not woven into Pass 2.
  const stack = buildModifierStack([
    ...collectTechModifierEffects(techAccount, content),
    ...(courtEffects || []),
  ]);
  const income = {};
  for (const cat of CATEGORIES) {
    const cur = categoryToCurrency(cat);
    let delta = Math.floor(totals[cat]?.net || 0);
    delta = applyProductionChannel(delta, mergeChannels(stack.channels[`production:${cur}`], stack.channels["production:*"]));
    delta = applyUpkeepChannel(delta, mergeChannels(stack.channels[`upkeep:${cur}`], stack.channels["upkeep:*"]));
    income[cur] = delta;
  }

  // Pass 5: raw strategic stocks + peg → metal/supply. Post-processing on
  // the final totals, same shape as Pass 4 — never woven into Pass 2.
  if (pegContext) {
    const extracted = pegContext.extractionByResource || {};
    for (const [id, units] of Object.entries(strategicExtractionStocks(extracted, content))) {
      income[id] = (income[id] || 0) + units;
    }
    const faction = {
      id: factionId,
      treasuryPeg: pegContext.faction?.treasuryPeg ?? pegContext.faction?.pegResourceId ?? null,
      pegResourceId: pegContext.faction?.pegResourceId ?? null,
      pegChangedTurn: pegContext.faction?.pegChangedTurn ?? null,
      extractionByResource: extracted,
    };
    const pegId = faction.treasuryPeg || faction.pegResourceId;
    const converted = convertPeggedResource(faction, pegId ? extracted[pegId] || 0 : 0, content, {
      globalExtractionTotals: pegContext.globalExtractionTotals,
      gmMultipliers: pegContext.gmMultipliers,
      currentTurn: pegContext.currentTurn,
    });
    for (const [currencyId, amount] of Object.entries(converted)) {
      if (!amount) continue;
      income[currencyId] = (income[currencyId] || 0) + amount;
    }
  }

  return { income, flows: nets, totals };
}
