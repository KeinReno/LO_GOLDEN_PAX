import { buildingDefFromInstance } from "./buildingDefs.mjs";
import { allocateLabor } from "./laborAllocation.mjs";
import { planetCapFromBuildings } from "./populationCap.mjs";
import { rpsEdges, applyFlowConvertPrimary, reconcileSecondaryDemand, inferSecondary, currencyToCategory } from "../economy/flowEngine.mjs";

/**
 * Stage 2 of the resource-extraction port (see README.md and
 * notes/2026-08-13-resource-extraction-grill.md): planet/building-specific
 * contributions into the shared flows grid (domain/economy/flowEngine.mjs).
 * Supersedes Stage 1's extraction.mjs/buildingYields.mjs, which computed
 * currency directly instead of feeding a shared grid other buildings could
 * draw from — see those files' updated headers.
 *
 * Ported from GMap/server/flowEngine.mjs's addPlanetExtraction/
 * addBuildingFlows and economyTick.mjs's addUpkeepDemand call site +
 * fedPopulationForUpkeep, with four explicit, already-agreed deviations:
 * (1) deposits only extract behind a matching-category building (GMap
 * extracts for free), (2) every building/extraction's output is scaled by
 * this planet's real job-slots labor-staffing fraction (allocateLabor),
 * not GMap's biosLaborScale (a faction-wide currency-bios-stock proxy),
 * (3) a `flow_convert`'s secondary/catalyst input is no longer consumed
 * greedily in building-processing order — see `applyFlowConvertPrimary`/
 * `reconcileSecondaryDemand` in flowEngine.mjs (2026-08-14, a live-verified
 * starvation bug this deviation fixes),
 * (4) Tech Tree 2.0 resource sockets (NOT a GMap port — GMap has no
 * empire-wide tech-socket upkeep swap): `addUpkeepDemand` may remap a
 * building's upkeep category from a pre-resolved `socketEffects` list
 * (see domain/tech/techSocket.mjs). Omitting the list is a no-op.
 *
 * Strategic-resource dual-tracking and the modifier stack are still out of
 * scope (see flowEngine.mjs's header) — not needed for this stage.
 */

function categoryStaffingByBuilding(planet, content, staffing) {
  const buildings = [...(planet.surfaceBuildings ?? []), ...(planet.orbitalBuildings ?? [])].filter((b) => !b.disabled);
  const byCategory = {};
  for (const b of buildings) {
    const def = buildingDefFromInstance(content, b);
    if (!def?.category) continue;
    const fraction = staffing[b.id] ?? 0;
    byCategory[def.category] = Math.max(byCategory[def.category] ?? 0, fraction);
  }
  return byCategory;
}

/** Same units `addExtraction` adds to the category cell — peg conversion reuses this so the two can't drift. */
function extractionYieldUnits(def) {
  const yieldTotal = Object.values(def.yield || {}).reduce((s, v) => s + Number(v || 0), 0);
  return yieldTotal > 0 ? yieldTotal : 1;
}

/** Deposits (planet.resources) contribute rate to their category, gated by a matching-category building. */
function addExtraction(flows, planet, content, categoryStaffing, rateScale = 1) {
  for (const resourceId of planet.resources || []) {
    const def = content.map_resources?.[resourceId];
    if (!def || def.category == null || def.tier == null) continue;
    const fraction = categoryStaffing[def.category] ?? 0;
    if (fraction <= 0) continue;
    const t = Number(def.tier);
    const cell = flows[def.category]?.[t];
    if (!cell) continue;
    cell.rate += extractionYieldUnits(def) * fraction * rateScale;
  }
}

/**
 * Each building's own yield_flat/flow_convert/capacity_add contribution,
 * scaled by ITS OWN staffing fraction. `flow_convert`'s primary leg runs
 * immediately (unchanged — real chain dependencies need this); its
 * secondary/catalyst leg is only *registered* into `pendingSecondary` and
 * `primaryCategoriesUsed` — actually resolved once per faction-turn by
 * `reconcileSecondaryDemand`, after every planet's buildings have had
 * their primary leg run (see flowIncome.mjs). See
 * domain/economy/flowEngine.mjs's `applyFlowConvertPrimary` header for why
 * (2026-08-14 fix for a live-verified starvation bug — not a GMap port).
 */
function addBuildingFlows(flows, planet, content, staffing, pendingSecondary, primaryCategoriesUsed, rateScale = 1) {
  const buildings = [...(planet.surfaceBuildings ?? []), ...(planet.orbitalBuildings ?? [])].filter((b) => !b.disabled);
  for (const b of buildings) {
    const def = buildingDefFromInstance(content, b);
    if (!def) continue;
    const fraction = staffing[b.id] ?? 0;
    const cat = def.category;
    const tier = Number(def.tier) || 1;
    const effects = def.effects || [];
    const hasConvert = effects.some((e) => e.effect === "flow_convert");

    for (const e of effects) {
      if (e.effect === "flow_convert") {
        const args = { ...e.args };
        if (!args.secondary && args.from?.category && args.to?.category) {
          args.secondary = inferSecondary(args.from.category, args.to.category, tier);
        }
        primaryCategoriesUsed.add(args.from?.category);
        const result = applyFlowConvertPrimary(flows, args, {
          buildingTier: tier,
          rateScale: fraction * rateScale,
          throughput: Number(e.args?.amount) || Math.max(1, Math.ceil(tier / 2) + 1),
        });
        if (result.produced > 0 && result.secondary?.category) {
          pendingSecondary.push({ toCat: result.toCat, toTier: result.toTier, secondary: result.secondary, amount: result.produced });
        }
      } else if (e.effect === "capacity_add") {
        const cc = e.args?.category;
        const tt = Number(e.args?.tier);
        const amt = Number(e.args?.amount) || 0;
        if (cc && tt && flows[cc]?.[tt]) flows[cc][tt].capacity += amt;
      } else if ((e.effect === "yield_flat" || e.effect === "production_flat") && !hasConvert) {
        const cur = e.args?.currency || e.args?.resource;
        const amt = (Number(e.args?.amount) || 0) * fraction * rateScale;
        const mapped = currencyToCategory(cur, content) || cat;
        if (mapped && flows[mapped]?.[tier]) flows[mapped][tier].rate += amt;
      }
    }

    // Auto-convert fallback (GMap): an unlabeled factory/lab/farm with no
    // declared yield_flat/flow_convert/capacity_add implicitly runs the RPS
    // edge feeding its own category.
    const hasOtherEffect = effects.some((e) => ["yield_flat", "production_flat", "capacity_add"].includes(e.effect));
    if (!hasConvert && !hasOtherEffect) {
      const edge = rpsEdges(content).find((ed) => ed.to === cat);
      if (edge && ["factory", "lab", "farm"].includes(def.kind)) {
        primaryCategoriesUsed.add(edge.from);
        const secondary = inferSecondary(edge.from, edge.to, tier);
        const result = applyFlowConvertPrimary(
          flows,
          { from: { category: edge.from, tier: `>=${Math.max(1, tier - 1)}` }, to: { category: edge.to, tier: `>=${tier}` }, secondary },
          { buildingTier: tier, rateScale: fraction * rateScale },
        );
        if (result.produced > 0 && result.secondary?.category) {
          pendingSecondary.push({ toCat: result.toCat, toTier: result.toTier, secondary: result.secondary, amount: result.produced });
        }
      }
    }
  }
}

/** Buildings' upkeep_slots add demand to their required category/tier — an operating cost, not gated by staffing (the building either runs, staffed or not, and still needs upkeep to stay standing).
 * `socketEffects` (deviation 4): empire-wide tech sockets may swap which
 * category a matching building class demands. Pre-resolved by the caller
 * from techAccount — this file does not import domain/tech. */
function addUpkeepDemand(flows, planet, content, socketEffects, demandScale = 1) {
  const buildings = [...(planet.surfaceBuildings ?? []), ...(planet.orbitalBuildings ?? [])].filter((b) => !b.disabled);
  for (const b of buildings) {
    const def = buildingDefFromInstance(content, b);
    for (const slot of def?.upkeep_slots || []) {
      const amt = Number(slot.count) || 0;
      if (amt <= 0) continue;
      const cat = resolveUpkeepCategory(slot.require?.category, def, socketEffects);
      const tierMin = Number(String(slot.require?.tier || "").match(/(\d+)/)?.[1]) || 1;
      if (cat && flows[cat]?.[tierMin]) flows[cat][tierMin].demand += amt * demandScale;
    }
  }
}

function resolveUpkeepCategory(slotCat, def, socketEffects) {
  let cat = slotCat;
  for (const fx of socketEffects || []) {
    const swap = fx.swapUpkeepCurrency;
    if (!swap) continue;
    const matchKind = swap.match?.kind ?? swap.buildingKind;
    const matchCat = swap.match?.category ?? swap.buildingCategory;
    if (matchKind && def?.kind !== matchKind) continue;
    if (matchCat && def?.category !== matchCat) continue;
    const from = swap.fromCategory || swap.from;
    const to = swap.toCategory || swap.to;
    if (from && cat !== from) continue;
    if (to) cat = to;
  }
  return cat;
}

/**
 * Exported one pass at a time — NOT bundled per-planet — because GMap's
 * computeFlowBreakdown runs each pass across EVERY planet before the next
 * pass starts (its own comment: "extraction + ambient baselines... must
 * exist before converters"). Bundling all three passes into one
 * per-planet call (an earlier version of this file did) breaks that: a
 * converter on planet 1 would run before the ambient D/E bonus (added
 * once, after all planets, in GMap) even exists — caught live via
 * `materia.smelter`'s secondary D-category input silently starving.
 * `flowIncome.mjs` calls these three functions in three separate loops
 * over every owned planet, matching GMap's real pass order exactly.
 */
export function addPlanetExtraction(flows, planet, content, opts = {}) {
  const staffing = allocateLabor(planet, content);
  const categoryStaffing = categoryStaffingByBuilding(planet, content, staffing);
  addExtraction(flows, planet, content, categoryStaffing, opts.rateScale ?? 1);
}

/**
 * Per-resource extraction this turn (staffing-gated, same units as the
 * category grid). Used by peg-conversion; additive with category income,
 * not a redirect. Returns `{ [resourceId]: number }`.
 */
export function planetResourceExtraction(planet, content) {
  const staffing = allocateLabor(planet, content);
  const categoryStaffing = categoryStaffingByBuilding(planet, content, staffing);
  const byResource = {};
  for (const resourceId of planet.resources || []) {
    const def = content.map_resources?.[resourceId];
    if (!def || def.category == null || def.tier == null) continue;
    const fraction = categoryStaffing[def.category] ?? 0;
    if (fraction <= 0) continue;
    byResource[resourceId] = (byResource[resourceId] || 0) + extractionYieldUnits(def) * fraction;
  }
  return byResource;
}

/** Sum `planetResourceExtraction` across every planet this faction owns. */
export function factionResourceExtraction(systems, factionId, content) {
  const totals = {};
  for (const sys of systems ?? []) {
    for (const planet of sys.planets ?? []) {
      if ((planet.ownerFactionId ?? sys.ownerFactionId) !== factionId) continue;
      for (const [resourceId, amount] of Object.entries(planetResourceExtraction(planet, content))) {
        totals[resourceId] = (totals[resourceId] || 0) + amount;
      }
    }
  }
  return totals;
}

/**
 * `pendingSecondary`/`primaryCategoriesUsed` are shared accumulators the
 * caller passes across EVERY owned planet (the flows grid is faction-wide,
 * not per-planet) so `reconcileSecondaryDemand` can run once, after every
 * planet's primary leg has run — see flowIncome.mjs's Pass 2. If omitted
 * (e.g. a caller working with a single planet in isolation), this function
 * falls back to resolving secondary demand immediately for just this
 * planet's own buildings, same as calling it used to behave.
 */
export function addPlanetBuildingFlows(flows, planet, content, pendingSecondary, primaryCategoriesUsed, opts = {}) {
  const staffing = allocateLabor(planet, content);
  const ownPending = pendingSecondary ?? [];
  const ownPrimaryCats = primaryCategoriesUsed ?? new Set();
  addBuildingFlows(flows, planet, content, staffing, ownPending, ownPrimaryCats, opts.rateScale ?? 1);
  if (!pendingSecondary) reconcileSecondaryDemand(flows, ownPending, ownPrimaryCats);
}

export function addPlanetUpkeepDemand(flows, planet, content, socketEffects, opts = {}) {
  addUpkeepDemand(flows, planet, content, socketEffects, opts.demandScale ?? 1);
}

/** Population's per-capita bios (food) demand — ported from GMap's fedPopulationForUpkeep usage in economyTick.mjs. */
export function popBiosDemand(planet, content) {
  const pop = Math.max(0, Number(planet.population) || 0);
  if (pop <= 0) return 0;
  const cap = Math.max(1, planetCapFromBuildings(planet, content) || 1);
  const fed = Math.min(pop, cap);
  return Math.ceil(fed * 0.05);
}
