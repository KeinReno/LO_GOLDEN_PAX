/**
 * Build the 6-category flow matrix for a faction (read-only — no ledger
 * writes, no world mutation). Extracted from ../economyTick.mjs.
 */
import { getContent } from "../contentLoader.mjs";
import { planetAllowsBuildingBiome } from "../biomeMatch.mjs";
import { npcProductionMultForSystem } from "../courtGovernance.mjs";
import {
  emptyFlows,
  addPlanetExtraction,
  addBuildingFlows,
  addUpkeepDemand,
  applySpaceObjectEffects,
  computeNets,
  categoryTotals,
  bottlenecks as flowBottlenecks,
  planetBuildingList,
  resolveBuildingDef,
  strategicResourceIdSet,
  CATEGORIES,
} from "../flowEngine.mjs";
import { activeSocketEffects } from "../techSockets.mjs";
import { logisticsProductionMult, logisticsUpkeepMult } from "../logistics.mjs";
import {
  allocateLabor,
  addOccupationCounts,
  buildingStaffingFraction,
  depositStaffingFraction,
  occupationBreakdown,
} from "../laborAllocation.mjs";
import { laborPopulation } from "../populationScale.mjs";
import { forceUpkeepRates } from "../forceEconomy.mjs";
import {
  applyAmbientDE,
  applyFlowConvertPrimary,
  reconcileSecondaryDemand,
} from "../ambientFlow.mjs";
import { fedPopulationForUpkeep, planetCap } from "./helpers.mjs";

/**
 * Build the 6-category flow matrix for a faction (exported for API + tick).
 */
export function computeFlowBreakdown(world, factionId, content, eco = null) {
  const namedModuleProduction = {};
  const c = content || getContent();
  const flows = emptyFlows();
  const strategicExtraction = {};
  const roleExtraction = {};
  const occupations = {};
  const maxTiers = eco?.techTiers || null;
  const treasuryPeg =
    (world.factions || []).find((f) => f.id === factionId)?.treasuryPeg ||
    null;

  // Pass 1: extraction + ambient baselines (must exist before converters)
  let pop = 0;
  let popBiosDemand = 0;
  for (const sys of world.systems ?? []) {
    if (sys.ownerFactionId !== factionId) continue;
    const govSupply = npcProductionMultForSystem(
      world,
      factionId,
      sys.id,
      "currency.supply",
    );
    const govMateria = npcProductionMultForSystem(
      world,
      factionId,
      sys.id,
      "currency.materia",
    );
    const npcScale =
      govSupply !== 1 || govMateria !== 1
        ? (govSupply + govMateria) / 2
        : 1;
    const prodScale = logisticsProductionMult(sys, c) * npcScale;
    for (const p of sys.planets ?? []) {
      const staffing = allocateLabor(p, c);
      addOccupationCounts(occupations, occupationBreakdown(p, c));
      addPlanetExtraction(flows, p.resources || [], c, {
        maxTiers,
        treasuryPeg,
        rateScale: prodScale,
        strategicExtraction,
        roleExtraction,
        planet: p,
        laborScaleForDeposit: (def) =>
          depositStaffingFraction(p, c, staffing, def),
      });
      const pPop = laborPopulation(p, c);
      pop += pPop;
      if (pPop > 0) {
        popBiosDemand += Math.ceil(
          fedPopulationForUpkeep(pPop, planetCap(p, c)) * 0.05,
        );
      }
    }
    // Belt deposits: extracted when the polity has a mining station in-system.
    const ownBeltMine = (sys.stations ?? []).some(
      (st) => st.kind === "mining" && st.factionId === factionId,
    );
    if (ownBeltMine && (sys.resources?.length ?? 0) > 0) {
      addPlanetExtraction(flows, sys.resources || [], c, {
        maxTiers,
        treasuryPeg,
        rateScale: prodScale,
        strategicExtraction,
        roleExtraction,
        skipExtractGate: true,
      });
    }
    const objs = c.space_objects?.objects || {};
    for (const poiType of sys.spaceObjects || []) {
      const objDef = objs[poiType];
      if (objDef) applySpaceObjectEffects(flows, objDef, { rateScale: prodScale });
    }
  }
  applyAmbientDE(flows, pop);

  // Pass 2: building yields / converts (after inputs exist).
  // Primary legs run immediately; secondary/catalyst claims reconcile once
  // after every owned planet (ambientFlow.mjs — primary before secondary).
  const pendingSecondary = [];
  const primaryCategoriesUsed = new Set();
  for (const sys of world.systems ?? []) {
    if (sys.ownerFactionId !== factionId) continue;
    const govSupply = npcProductionMultForSystem(
      world,
      factionId,
      sys.id,
      "currency.supply",
    );
    const govMateria = npcProductionMultForSystem(
      world,
      factionId,
      sys.id,
      "currency.materia",
    );
    const npcScale =
      govSupply !== 1 || govMateria !== 1
        ? (govSupply + govMateria) / 2
        : 1;
    const prodScale = logisticsProductionMult(sys, c) * npcScale;
    const pri =
      eco?.flowPriorities?.[sys.id] || eco?.flowPriorities?._faction || null;
    for (const p of sys.planets ?? []) {
      const staffing = allocateLabor(p, c);
      const buildings = planetBuildingList(p);
      buildings.forEach((b, i) => {
        if (b.disabled) return;
        const def = resolveBuildingDef(c, b);
        if (!def) return;
        if (
          def.biome_restrictions?.length &&
          !planetAllowsBuildingBiome(p, def.biome_restrictions)
        ) {
          return;
        }
        const frac = buildingStaffingFraction(c, staffing, b, i);
        addBuildingFlows(flows, def, c, b, {
          biosScale: 1,
          maxTiers,
          rateScale: prodScale * frac,
          priorityEdge: pri,
          pendingSecondary,
          primaryCategoriesUsed,
          convertPrimary: applyFlowConvertPrimary,
          namedProduction: namedModuleProduction,
        });
      });
    }
  }
  reconcileSecondaryDemand(flows, pendingSecondary, primaryCategoriesUsed);

  // Pass 3: upkeep demand (buildings + fleet + pop)
  // Strategic slotFills debit named stocks (namedSlotUpkeep), not category buckets.
  // Tech sockets may swap which category a matching building class demands (empire-wide).
  const namedSlotUpkeep = {};
  const strategicIds = strategicResourceIdSet(c);
  const socketEffects = activeSocketEffects(eco, c);
  for (const sys of world.systems ?? []) {
    if (sys.ownerFactionId !== factionId) continue;
    const upkeepScale = logisticsUpkeepMult(sys, c);
    for (const p of sys.planets ?? []) {
      for (const b of planetBuildingList(p)) {
        if (b.disabled) continue;
        const def = resolveBuildingDef(c, b);
        if (def) {
          addUpkeepDemand(flows, def, {
            demandScale: upkeepScale,
            buildingInst: b,
            namedDemand: namedSlotUpkeep,
            content: c,
            strategicIds,
            socketEffects,
          });
        }
      }
    }
  }

  let fleetD = 0;
  let fleetE = 0;
  let legionE = 0;
  const ships = c.ships || {};
  const units = c.units || {};
  for (const f of world.fleets ?? []) {
    if (f.factionId !== factionId) continue;
    for (const g of f.composition ?? []) {
      const def = ships[g.defId] || ships[g.type];
      const tier = Number(def?.tier ?? 1) || 1;
      const rates = forceUpkeepRates("ship", tier, g.count || 0);
      fleetD += rates.d;
      fleetE += rates.e;
    }
  }
  for (const l of world.legions ?? []) {
    if (l.factionId !== factionId) continue;
    const groups = l.composition ?? [];
    if (!groups.length) {
      legionE += forceUpkeepRates("unit", 2, l.strength || 1).e;
      continue;
    }
    for (const g of groups) {
      const def = units[g.defId] || units[g.type];
      const tier = Number(def?.tier ?? 2) || 2;
      legionE += forceUpkeepRates("unit", tier, g.count || 0).e;
    }
  }
  if (fleetD > 0) flows.D[2].demand += Math.ceil(fleetD);
  if (fleetE > 0) flows.E[3].demand += Math.ceil(fleetE);
  if (legionE > 0) flows.E[3].demand += Math.ceil(legionE);
  if (popBiosDemand > 0) flows.E[1].demand += popBiosDemand;

  const nets = computeNets(flows);
  return {
    flows: nets,
    totals: categoryTotals(nets),
    bottlenecks: flowBottlenecks(nets),
    categories: CATEGORIES,
    biosScale: 1,
    strategicExtraction,
    roleExtraction,
    namedSlotUpkeep,
    namedModuleProduction,
    occupations,
  };
}
