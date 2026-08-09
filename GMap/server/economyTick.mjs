/**
 * Economy + population tick.
 * Authoritative path: 6×10 flow matrix → category stocks → legacy metal/supply bridge.
 */
import { getContent } from "./contentLoader.mjs";
import {
  buildModifierStack,
  applyFlatThenMult,
  collectRaceEffects,
  resolvePlanetRaceComposition,
  explainStack,
} from "./modifierStack.mjs";
import { resolveEmpireApMax } from "./apBudget.mjs";
import {
  collectPoiEffects,
  collectSystemPoiEffects,
  spawnRefugees,
  ownedDepotSystemIds,
} from "./narrative.mjs";
import { collectTreatyEffects } from "./opinionTick.mjs";
import {
  factionScopedActiveEffects,
  npcProductionMultForSystem,
} from "./courtGovernance.mjs";
import {
  readLedger,
  writeLedger,
  ensureAllFactions,
  ensureFactionEco,
  adjustStock,
  sanitizeEconomyExplain,
} from "./ledger.mjs";
import { resolveAlias } from "./normalizeWorld.mjs";
import { planetCapFromBuildings } from "./planetActions.mjs";
import { forceUpkeepRates } from "./forceEconomy.mjs";
import {
  emptyFlows,
  addPlanetExtraction,
  addBuildingFlows,
  addUpkeepDemand,
  applySpaceObjectEffects,
  computeNets,
  categoryTotals,
  bottlenecks as flowBottlenecks,
  biosLaborScale,
  planetBuildingList,
  resolveBuildingDef,
  categoryToCurrency,
  CATEGORIES,
} from "./flowEngine.mjs";
import { getEffectiveMarketRates } from "./marketRates.mjs";
import { collectLoyaltyTierEffects } from "./loyalty.mjs";
import { collectTechModifierEffects } from "./techActions.mjs";
import {
  collectCultureEffects,
  collectFaithEffects,
  resolvePlanetCultureId,
  resolvePlanetFaithShares,
  primaryRaceFromComposition,
} from "./cultureFaith.mjs";
import {
  applyLogisticsEffects,
  logisticsProductionMult,
  logisticsUpkeepMult,
} from "./logistics.mjs";

function floor(n) {
  return Math.floor(Number(n) || 0);
}

/**
 * Core natural growth before pop_growth_flat/mult modifiers.
 * Over cap → emigration/pressure loss (never a fixed 20% growth floor).
 */
export function naturalPopDeltaBeforeModifiers(
  pop,
  cap,
  rate,
  habEff,
  supplyFactor,
  maxLossPerTurn,
) {
  if (pop <= 0) return 0;
  const safeCap = Math.max(1, Number(cap) || 1);
  if (pop > safeCap) {
    const excessRatio = (pop - safeCap) / safeCap;
    const lossRate = Math.min(
      maxLossPerTurn,
      0.03 + 0.02 * Math.min(excessRatio, 20),
    );
    return -pop * lossRate;
  }
  const headroomFactor = (safeCap - pop) / safeCap;
  return pop * rate * habEff * supplyFactor * headroomFactor;
}

/** Bios flow upkeep: only population within planetary housing counts. */
function fedPopulationForUpkeep(pop, cap) {
  const p = Math.max(0, Number(pop) || 0);
  if (p <= 0) return 0;
  const safeCap = Math.max(1, Number(cap) || 1);
  return Math.min(p, safeCap);
}

function planetCap(planet, content) {
  return planetCapFromBuildings(planet, content);
}

function habitabilityForPlanet(planet, racesContent, composition) {
  let h = 1;
  const climate = planet.climate || planet.type || "rocky";
  let wSum = 0;
  let hSum = 0;
  for (const share of composition || []) {
    const race = racesContent?.[share.raceId];
    if (!race) continue;
    const w = (share.percent ?? 0) / 100;
    const map = race.habitability || {};
    // Missing climate key → 1.0 (neutral), never invent a soft 0.8 penalty.
    const hv = map[climate] ?? map[planet.type] ?? 1.0;
    hSum += hv * w;
    wSum += w;
  }
  if (wSum > 0) h = hSum / wSum;
  return h;
}

/** Building effects that feed planet growth / habitability. */
function collectPlanetBuildingGrowthEffects(planet, content) {
  const out = [];
  for (const b of planetBuildingList(planet)) {
    const def = resolveBuildingDef(content, b);
    if (!def?.effects?.length) continue;
    for (const e of def.effects) {
      if (
        e?.effect === "habitability_mult" ||
        e?.effect === "pop_growth_mult" ||
        e?.effect === "pop_growth_flat"
      ) {
        out.push({
          ...e,
          source: {
            kind: "building",
            id: def.id || b.buildingId || b.kind,
            label: def.name || def.id,
          },
        });
      }
    }
  }
  return out;
}

/** Drop expired NPC/quest lasting effects. */
function pruneActiveEffects(faction, turn) {
  if (!Array.isArray(faction?.activeEffects)) return;
  faction.activeEffects = faction.activeEffects.filter((e) => {
    if (e?.expiresTurn == null) return true;
    return Number(e.expiresTurn) > turn;
  });
}

function applyProductionChannel(delta, channel) {
  if (!channel) return delta;
  if (delta > 0) return floor(applyFlatThenMult(delta, channel));
  if (channel.flat) return delta + floor(applyFlatThenMult(0, channel));
  return delta;
}

function applyUpkeepChannel(delta, channel) {
  if (!channel) return delta;
  // upkeep = flat * mult (flat counted once); apply whether net stays >= 0 or not
  const upkeep = floor(applyFlatThenMult(0, channel));
  return delta - upkeep;
}

/** Merge specific resource channel with wildcard production:* / upkeep:* */
function mergeChannels(specific, wildcard) {
  if (!specific && !wildcard) return null;
  return {
    flat: (specific?.flat || 0) + (wildcard?.flat || 0),
    mult: (specific?.mult ?? 1) * (wildcard?.mult ?? 1),
  };
}

function collectFactionEffects(world, factionId, eco, content, turn = 0) {
  const effects = [];
  const faction = world.factions?.find((f) => f.id === factionId) ?? null;
  const raceOpts = { factionId, turn };

  for (const [slot, tierId] of Object.entries(eco.taxes || {})) {
    const def = content.taxes?.[slot];
    if (!def || def.hidden || def.aliasOf) continue;
    const tier = def?.tiers?.find((t) => t.id === tierId);
    for (const e of tier?.effects || []) {
      effects.push({
        ...e,
        source: { kind: "tax", id: `${slot}:${tierId}`, label: def?.name },
      });
    }
  }

  for (const sys of world.systems ?? []) {
    if (sys.ownerFactionId !== factionId) continue;
    for (const p of sys.planets ?? []) {
      if ((p.population ?? 0) <= 0) continue;
      effects.push(
        ...collectRaceEffects(
          content.races,
          resolvePlanetRaceComposition(p, faction),
          raceOpts,
        ),
      );
      const composition = resolvePlanetRaceComposition(p, faction);
      const cultureId = resolvePlanetCultureId(p, faction);
      const primaryRace = primaryRaceFromComposition(composition);
      effects.push(
        ...collectCultureEffects(content, cultureId, { raceId: primaryRace }),
      );
      effects.push(
        ...collectFaithEffects(
          content,
          resolvePlanetFaithShares(p, faction),
          eco,
        ),
      );
    }
  }

  if (eco.deficit === "low" && content.rules?.deficit?.lowPenalty === "ap_minus_1") {
    effects.push({
      effect: "ap_add",
      args: { amount: -1 },
      source: { kind: "deficit", id: "low", label: "Дефицит" },
    });
  }
  if (eco.deficit === "empty") {
    effects.push({
      effect: "forbid_intent",
      args: { intentId: "intent.build" },
      source: { kind: "deficit", id: "empty", label: "Пустая казна" },
    });
  }

  for (const th of content.rules?.tax?.pressureThresholds || []) {
    if ((eco.pressure ?? 0) >= (th.min ?? 99)) {
      for (const e of th.effects || []) {
        effects.push({
          ...e,
          source: {
            kind: "pressure",
            id: `p${th.min}`,
            label: "Налоговое давление",
          },
        });
      }
    }
  }

  effects.push(...collectPoiEffects(world, factionId, content));
  effects.push(...collectLoyaltyTierEffects(world, factionId, content));
  effects.push(...collectTechModifierEffects(eco, content));

  if (faction) {
    effects.push(...collectTreatyEffects(faction));
  }

  // Faction doctrine traits (A1)
  for (const trait of faction?.traits || []) {
    const traitId = typeof trait === "string" ? trait : trait.id;
    const fromCatalog =
      typeof trait === "string"
        ? content.faction_traits?.traits?.[trait]
        : null;
    const effectsList =
      fromCatalog?.effects ||
      (typeof trait === "object" ? trait.effects : null) ||
      [];
    const label =
      (typeof trait === "object" && trait.label) ||
      fromCatalog?.name ||
      traitId;
    for (const e of effectsList) {
      effects.push({
        ...e,
        source: {
          kind: "faction",
          id: traitId,
          label,
        },
      });
    }
  }

  effects.push(...applyLogisticsEffects(world, factionId, content));

  // Completed NPC court tasks / quest lasting effects (A10) — prune first
  // Only faction-scoped actives enter the realm ModifierStack; system-scoped
  // apply via npcProductionMultForSystem / loyalty.
  if (faction) pruneActiveEffects(faction, turn);
  for (const e of factionScopedActiveEffects(faction)) {
    if (!e?.effect) continue;
    effects.push({
      ...e,
      source: e.source || {
        kind: "npc_task",
        id: e.effect,
        label: "Эффект двора",
      },
    });
  }

  if (
    ownedDepotSystemIds(world, factionId).length === 0 &&
    content.rules?.depot?.noDepotUpkeepMult
  ) {
    effects.push({
      effect: "upkeep_mult",
      args: {
        resource: "currency.supply",
        mult: content.rules.depot.noDepotUpkeepMult,
      },
      source: { kind: "depot", id: "missing", label: "Нет депо" },
    });
  }

  return effects;
}

/**
 * Legacy map yields — only used as soft fallback for resources WITHOUT category/tier
 * (e.g. trade_value). Category deposits go through flow extraction only.
 */
function mapResourceYieldLegacyOnly(sys, content) {
  const yields = { "currency.metal": 0, "currency.supply": 0 };
  for (const r of sys.resources ?? []) {
    const key = resolveAlias("resources", r);
    let def = content.map_resources?.[key];
    if (!def) {
      def = Object.values(content.map_resources || {}).find(
        (x) => x.name === r || x.id === key,
      );
    }
    if (!def?.yield) continue;
    // Skip categorized resources — handled by flow engine
    if (def.category != null && def.tier != null) continue;
    for (const [cur, amt] of Object.entries(def.yield)) {
      yields[cur] = (yields[cur] || 0) + Number(amt || 0);
    }
  }
  const pop = (sys.planets ?? []).reduce((s, p) => s + (p.population || 0), 0);
  if (pop > 0) yields["currency.supply"] += 1;
  return yields;
}

function fleetUpkeep(world, factionId, content) {
  let metal = 0;
  let supply = 0;
  const ships = content?.ships || {};
  const units = content?.units || {};
  for (const f of world.fleets ?? []) {
    if (f.factionId !== factionId) continue;
    const groups = f.composition ?? [];
    if (!groups.length) {
      const rates = forceUpkeepRates("ship", 1, 1);
      metal += rates.metal;
      continue;
    }
    for (const g of groups) {
      const def = ships[g.defId] || ships[g.type];
      const tier = Number(def?.tier ?? 1) || 1;
      const rates = forceUpkeepRates("ship", tier, g.count || 0);
      metal += rates.metal;
    }
  }
  for (const l of world.legions ?? []) {
    if (l.factionId !== factionId) continue;
    const groups = l.composition ?? [];
    if (!groups.length) {
      const n = l.strength || 1;
      const rates = forceUpkeepRates("unit", 2, n);
      supply += Math.ceil(rates.e);
      continue;
    }
    for (const g of groups) {
      const def = units[g.defId] || units[g.type];
      const tier = Number(def?.tier ?? 2) || 2;
      const rates = forceUpkeepRates("unit", tier, g.count || 0);
      supply += rates.e;
    }
  }
  return {
    "currency.metal": Math.ceil(metal),
    "currency.supply": Math.ceil(supply),
  };
}

function popUpkeep(world, factionId) {
  let supply = 0;
  for (const sys of world.systems ?? []) {
    if (sys.ownerFactionId !== factionId) continue;
    for (const p of sys.planets ?? []) {
      supply += Math.ceil((p.population || 0) * 0.05);
    }
  }
  return { "currency.supply": supply };
}

function applyPendingTaxes(eco) {
  const pending = eco.pendingPolicy?.taxes || {};
  if (!eco.taxes) eco.taxes = {};
  for (const [slot, tierId] of Object.entries(pending)) {
    eco.taxes[slot] = tierId;
  }
  if (eco.pendingPolicy) eco.pendingPolicy.taxes = {};
}

export function activatePendingPolicies(world) {
  const ledger = ensureAllFactions(readLedger(), world);
  for (const fac of world.factions ?? []) {
    const eco = ensureFactionEco(ledger, fac.id);
    applyPendingTaxes(eco);
  }
  writeLedger(ledger);
  return ledger;
}

function taxRateFor(eco, content, slot) {
  const resolved = resolveTaxSlotId(content, slot);
  const tierId = eco.taxes?.[resolved] || eco.taxes?.[slot] || "none";
  const def = content.taxes?.[resolved] || content.taxes?.[slot];
  const tier = def?.tiers?.find((t) => t.id === tierId);
  return tier?.rate ?? 0;
}

function resolveTaxSlotId(content, slot) {
  const def = content?.taxes?.[slot];
  if (def?.aliasOf && content?.taxes?.[def.aliasOf]) return def.aliasOf;
  return slot;
}

/** Primary (non-hidden) tax slots for category taxation. */
function primaryTaxSlots(content) {
  return Object.values(content?.taxes || {}).filter((t) => t?.id && !t.hidden);
}

/**
 * Soft-deficit from critical category stocks + legacy bridge currencies.
 * Critical: B Materia, D Energia, E Bios (+ metal/supply).
 */
function updateDeficit(eco, content) {
  const lowRatio = content.rules?.deficit?.lowRatio ?? 0.15;
  const refs = {
    "currency.metal": 80,
    "currency.supply": 80,
    "currency.materia": 40,
    "currency.energia": 40,
    "currency.bios": 40,
  };
  let anyEmpty = false;
  let anyLow = false;
  for (const [cur, ref] of Object.entries(refs)) {
    const v = Number(eco.stocks[cur] ?? 0);
    if (v <= 0) anyEmpty = true;
    else if (v < ref * lowRatio) anyLow = true;
  }
  if (anyEmpty) eco.deficit = "empty";
  else if (anyLow) eco.deficit = "low";
  else eco.deficit = "ok";
}

/**
 * Build the 6-category flow matrix for a faction (exported for API + tick).
 */
export function computeFlowBreakdown(world, factionId, content, eco = null) {
  const c = content || getContent();
  const flows = emptyFlows();
  const labor = biosLaborScale(eco || { stocks: {} });
  const maxTiers = eco?.techTiers || null;

  // Pass 1: extraction + ambient baselines (must exist before converters)
  let inhabitedPlanets = 0;
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
      addPlanetExtraction(flows, p.resources || [], c, {
        maxTiers,
        rateScale: prodScale,
      });
      const pPop = p.population || 0;
      pop += pPop;
      if (pPop > 0) {
        popBiosDemand += Math.ceil(
          fedPopulationForUpkeep(pPop, planetCap(p, c)) * 0.05,
        );
      }
      if (pPop > 0 || p.colonyType) inhabitedPlanets += 1;
    }
    // Belt deposits: extracted when the polity has a mining station in-system.
    const ownBeltMine = (sys.stations ?? []).some(
      (st) => st.kind === "mining" && st.factionId === factionId,
    );
    if (ownBeltMine && (sys.resources?.length ?? 0) > 0) {
      addPlanetExtraction(flows, sys.resources || [], c, {
        maxTiers,
        rateScale: prodScale,
      });
    }
    const objs = c.space_objects?.objects || {};
    for (const poiType of sys.spaceObjects || []) {
      const objDef = objs[poiType];
      if (objDef) applySpaceObjectEffects(flows, objDef, { rateScale: prodScale });
    }
  }
  if (inhabitedPlanets > 0) {
    flows.D[1].rate += inhabitedPlanets * 2; // ambient energy (sun/geo)
    flows.E[1].rate += Math.max(1, inhabitedPlanets); // subsistence bios
  }

  // Pass 2: building yields / converts (after inputs exist)
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
      for (const b of planetBuildingList(p)) {
        if (b.disabled) continue;
        const def = resolveBuildingDef(c, b);
        if (!def) continue;
        addBuildingFlows(flows, def, c, b, {
          biosScale: labor,
          maxTiers,
          rateScale: prodScale,
          priorityEdge: pri,
        });
      }
    }
  }

  // Pass 3: upkeep demand (buildings + fleet + pop)
  for (const sys of world.systems ?? []) {
    if (sys.ownerFactionId !== factionId) continue;
    const upkeepScale = logisticsUpkeepMult(sys, c);
    for (const p of sys.planets ?? []) {
      for (const b of planetBuildingList(p)) {
        if (b.disabled) continue;
        const def = resolveBuildingDef(c, b);
        if (def) addUpkeepDemand(flows, def, { demandScale: upkeepScale });
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
    biosScale: labor,
  };
}

/**
 * Mutates world planets population; updates ledger stocks from flows + bridge.
 */
export function runEconomyTick(world, turn) {
  const content = getContent();
  const ledger = ensureAllFactions(readLedger(), world);
  const journal = [];
  const breakdowns = {};

  for (const fac of world.factions ?? []) {
    const eco = ensureFactionEco(ledger, fac.id);

    const effects = collectFactionEffects(world, fac.id, eco, content, turn);
    const stack = buildModifierStack(effects, {
      mergeOrder: content.rules?.economyMergeOrder,
      modifierCaps: content.rules?.modifierCaps,
    });

    // --- Authoritative flow economy ---
    const flowBreak = computeFlowBreakdown(world, fac.id, content, eco);
    const totals = flowBreak.totals;
    const categoryNet = {};
    const channels = {};

    for (const cat of CATEGORIES) {
      const cur = categoryToCurrency(cat);
      let delta = floor(totals[cat]?.net || 0);
      delta = applyProductionChannel(
        delta,
        mergeChannels(
          stack.channels[`production:${cur}`],
          stack.channels["production:*"],
        ),
      );
      delta = applyUpkeepChannel(
        delta,
        mergeChannels(
          stack.channels[`upkeep:${cur}`],
          stack.channels["upkeep:*"],
        ),
      );

      // Category tax (materia/energia/bios slots) — treasury records; sink subtracts.
      let taxRate = 0;
      let taxAmt = 0;
      for (const slot of primaryTaxSlots(content)) {
        if (slot.resource !== cur) continue;
        taxRate = taxRateFor(eco, content, slot.id);
        if (taxRate > 0 && delta > 0) {
          taxAmt = floor(delta * taxRate);
          if (content.rules?.tax?.defaultMode === "sink") delta -= taxAmt;
        }
      }

      categoryNet[cur] = delta;
      channels[cur] = {
        base: floor(totals[cat]?.rate || 0),
        demand: floor(totals[cat]?.demand || 0),
        afterProd: floor(totals[cat]?.rate || 0),
        taxRate,
        tax: taxAmt,
        upkeep: floor(totals[cat]?.demand || 0),
        net: delta,
        category: cat,
      };
      if (delta !== 0) {
        adjustStock(ledger, fac.id, cur, delta, {
          turn,
          reason: delta >= 0 ? "flow_income" : "flow_upkeep",
        });
      }
    }

    // --- Legacy bridge: metal ≈ Materia net, supply ≈ Bios+Energia nets ---
    // Plus tiny non-category leftovers + fleet/pop already counted in D/E demand;
    // still apply metal fleet upkeep as metal spend for shipyard compatibility.
    const materiaNet = categoryNet["currency.materia"] || 0;
    const energiaNet = categoryNet["currency.energia"] || 0;
    const biosNet = categoryNet["currency.bios"] || 0;

    let legacyGross = { "currency.metal": 0, "currency.supply": 2 };
    for (const sys of world.systems ?? []) {
      if (sys.ownerFactionId !== fac.id) continue;
      const y = mapResourceYieldLegacyOnly(sys, content);
      const scale = logisticsProductionMult(sys, content);
      for (const [k, v] of Object.entries(y)) {
        legacyGross[k] = (legacyGross[k] || 0) + v * scale;
      }
      // Do NOT call collectPlanetYields — buildings already in flows (avoids double count)
    }

    // Bridge income: mirror positive category nets into legacy stocks.
    // Category nets already ran applyProductionChannel — do NOT re-apply
    // production flats/mults here (only tax below).
    const bridgeMetal = Math.max(0, materiaNet) + (legacyGross["currency.metal"] || 0);
    const bridgeSupply =
      Math.max(0, biosNet) + Math.max(0, energiaNet) + (legacyGross["currency.supply"] || 0);

    let metalAfter = floor(bridgeMetal);
    let supplyAfter = floor(bridgeSupply);

    // Legacy bridge tax mirrors category slots (materia→metal, bios→supply).
    const taxInd = taxRateFor(eco, content, "tax.materia");
    const taxSup = taxRateFor(eco, content, "tax.bios");
    const taxMetal = floor(metalAfter * taxInd);
    const taxSupply = floor(supplyAfter * taxSup);
    if (content.rules?.tax?.defaultMode === "sink") {
      metalAfter -= taxMetal;
      supplyAfter -= taxSupply;
    }

    // Legacy fleet metal upkeep still on metal (ships cost metal to maintain)
    // Supply fleet/pop already represented as D/E demand in flows — avoid full double.
    // Keep a light metal fleet upkeep only.
    let metalUpkeep = fleetUpkeep(world, fac.id, content)["currency.metal"] || 0;
    metalUpkeep = applyFlatThenMult(metalUpkeep, stack.channels["upkeep:currency.metal"]);

    // When category nets are negative, also drain legacy bridge stocks
    const supplyUpkeepFlat = floor(
      stack.channels["upkeep:currency.supply"]?.flat || 0,
    );
    const metalDelta = floor(metalAfter - metalUpkeep + Math.min(0, materiaNet));
    const supplyDelta = floor(
      supplyAfter +
        Math.min(0, biosNet) +
        Math.min(0, energiaNet) -
        supplyUpkeepFlat,
    );

    channels["currency.metal"] = {
      base: floor(bridgeMetal),
      afterProd: floor(metalAfter),
      taxRate: taxInd,
      tax: taxMetal,
      upkeep: floor(metalUpkeep),
      net: metalDelta,
      bridgedFrom: "B.materia",
    };
    channels["currency.supply"] = {
      base: floor(bridgeSupply),
      afterProd: floor(supplyAfter),
      taxRate: taxSup,
      tax: taxSupply,
      upkeep: floor(supplyUpkeepFlat),
      net: supplyDelta,
      bridgedFrom: "E.bios+D.energia",
    };

    if (metalDelta !== 0) {
      adjustStock(ledger, fac.id, "currency.metal", metalDelta, {
        turn,
        reason: metalDelta >= 0 ? "bridge_income" : "bridge_upkeep",
      });
    }
    // Treasury peg (solarit / blumatid / …): mirror fiscal bridge into the
    // faction's commodity peg so Казна tracks state currency, not scrap metal.
    const treasuryPeg =
      typeof fac.treasuryPeg === "string" && fac.treasuryPeg.trim()
        ? fac.treasuryPeg.trim()
        : null;
    if (
      treasuryPeg &&
      treasuryPeg !== "currency.metal" &&
      metalDelta !== 0
    ) {
      adjustStock(ledger, fac.id, treasuryPeg, metalDelta, {
        turn,
        reason: metalDelta >= 0 ? "treasury_income" : "treasury_upkeep",
      });
      channels[treasuryPeg] = {
        base: floor(bridgeMetal),
        afterProd: floor(metalAfter),
        taxRate: taxInd,
        tax: taxMetal,
        upkeep: floor(metalUpkeep),
        net: metalDelta,
        bridgedFrom: "B.materia→treasuryPeg",
      };
    }
    if (supplyDelta !== 0) {
      adjustStock(ledger, fac.id, "currency.supply", supplyDelta, {
        turn,
        reason: supplyDelta >= 0 ? "bridge_income" : "bridge_upkeep",
      });
    }

    const pressureCh = stack.channels.tax_pressure;
    const pressureAdd = pressureCh?.flat ?? 0;
    eco.pressure = Math.max(0, floor((eco.pressure || 0) * 0.85 + pressureAdd));

    updateDeficit(eco, content);
    eco.bottlenecks = flowBreak.bottlenecks || {};

    const apMax = resolveEmpireApMax(content.rules, stack);

    const net = {
      ...categoryNet,
      "currency.metal": metalDelta,
      "currency.supply": supplyDelta,
    };

    const explainRaw = explainStack(stack);
    eco.explain = sanitizeEconomyExplain(explainRaw, {
      channels,
      deficit: eco.deficit,
    });

    breakdowns[fac.id] = {
      factionId: fac.id,
      channels,
      pressure: eco.pressure,
      deficit: eco.deficit,
      taxes: { ...eco.taxes },
      apMax,
      explain: explainRaw,
      explainPublic: eco.explain,
      flows: flowBreak,
      bottlenecks: flowBreak.bottlenecks,
    };

    journal.push({
      type: "economy",
      factionId: fac.id,
      net,
      deficit: eco.deficit,
      pressure: eco.pressure,
      apMax,
      bottlenecks: flowBreak.bottlenecks,
    });
  }

  // Population
  const maxLoss = content.rules?.population?.maxLossPerTurn ?? 0.15;
  const baseGrowth = content.rules?.population?.baseGrowth ?? 0.012;

  for (const sys of world.systems ?? []) {
    const owner = sys.ownerFactionId;
    const eco = owner ? ensureFactionEco(ledger, owner) : null;
    const biosOk = !eco || (eco.stocks["currency.bios"] ?? 0) > 0;
    const supplyOk = !eco || (eco.stocks["currency.supply"] ?? 0) > 0;
    const supplyFactor = !eco
      ? 1
      : eco.deficit === "empty"
        ? 0.4
        : eco.deficit === "low"
          ? 0.75
          : biosOk && supplyOk
            ? 1
            : 0.5;

    for (const p of sys.planets ?? []) {
      if ((p.population ?? 0) <= 0 && !(p.habitable || p.colonyType)) continue;
      let pop = p.population || 0;
      if (pop <= 0) continue;

      const fac = owner
        ? world.factions?.find((f) => f.id === owner) ?? null
        : null;
      const composition = resolvePlanetRaceComposition(p, fac);

      let rate = 0;
      for (const share of composition) {
        const race = content.races?.[share.raceId];
        const br = race?.growth?.baseRate ?? baseGrowth;
        rate += br * ((share.percent ?? 0) / 100);
      }
      const hab = habitabilityForPlanet(p, content.races, composition);
      const cap = planetCap(p, content);

      const growthEffects = [
        ...collectSystemPoiEffects(sys, content),
        ...collectRaceEffects(content.races, composition, {
          factionId: owner || undefined,
          turn,
        }),
        ...collectPlanetBuildingGrowthEffects(p, content),
      ];
      if (fac) {
        growthEffects.push(...collectTreatyEffects(fac));
        for (const trait of fac.traits || []) {
          const traitId = typeof trait === "string" ? trait : trait.id;
          const fromCatalog =
            typeof trait === "string"
              ? content.faction_traits?.traits?.[trait]
              : null;
          const effectsList =
            fromCatalog?.effects ||
            (typeof trait === "object" ? trait.effects : null) ||
            [];
          for (const e of effectsList) {
            if (
              e?.effect === "pop_growth_mult" ||
              e?.effect === "pop_growth_flat" ||
              e?.effect === "habitability_mult"
            ) {
              growthEffects.push({
                ...e,
                source: {
                  kind: "faction",
                  id: traitId,
                  label: fromCatalog?.name || traitId,
                },
              });
            }
          }
        }
      }
      const growthStack = buildModifierStack(growthEffects, {
        mergeOrder: content.rules?.economyMergeOrder,
        modifierCaps: content.rules?.modifierCaps,
      });
      let habEff = hab;
      if (growthStack.channels.habitability) {
        habEff = applyFlatThenMult(hab, growthStack.channels.habitability);
      }
      // GM/census lock: keep authored large populations (e.g. Amalfea ≤3M)
      // without over-cap emigration; Bios upkeep still uses housing `cap`.
      const growthCap =
        p.censusLocked || p.censusLocked === true
          ? Math.max(cap, pop)
          : cap;
      let natural = naturalPopDeltaBeforeModifiers(
        pop,
        growthCap,
        rate,
        habEff,
        supplyFactor,
        maxLoss,
      );
      natural = applyFlatThenMult(natural, growthStack.channels.pop_growth);

      if (eco?.deficit === "empty") natural = Math.min(natural, -pop * 0.02);

      let delta = floor(natural);
      const minDelta = -floor(pop * maxLoss);
      if (delta < minDelta) delta = minDelta;

      const before = pop;
      pop = Math.max(0, pop + delta);
      p.population = pop;

      if (delta !== 0) {
        journal.push({
          type: "population",
          systemId: sys.id,
          planetId: p.id,
          from: before,
          to: pop,
          delta,
        });
      }

      const refugeeMin = content.rules?.population?.emigrationRefugeeMin ?? 2;
      if (delta < 0 && Math.abs(delta) >= refugeeMin) {
        spawnRefugees(world, sys.id, Math.abs(delta), journal);
      }
    }
  }

  writeLedger(ledger);
  return { breakdowns, journal, ledger };
}

export function queueTaxChange(factionId, taxSlot, tierId) {
  const content = getContent();
  const def = content.taxes?.[taxSlot];
  if (!def) return { ok: false, error: "unknown tax slot" };
  if (!def.tiers?.some((t) => t.id === tierId)) {
    return { ok: false, error: "unknown tier" };
  }
  const ledger = readLedger();
  const eco = ensureFactionEco(ledger, factionId);
  eco.pendingPolicy = eco.pendingPolicy || { taxes: {} };
  eco.pendingPolicy.taxes[taxSlot] = tierId;
  writeLedger(ledger);
  return { ok: true, eco };
}

/** Parse "currency.a → currency.b" from placeholder_rates pair string. */
function parseRatePair(pairStr) {
  const parts = String(pairStr || "")
    .split(/→|->/)
    .map((s) => s.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { from: parts[0], to: parts[1] };
}

/**
 * Resolve stub market rate for from→to. Forward uses sell; inverse uses buy.
 * @returns {{ direction: "forward"|"inverse", sell?: number, buy?: number } | null}
 */
export function lookupMarketRate(fromCurrency, toCurrency, content) {
  const rates = getEffectiveMarketRates(content);
  for (const row of rates) {
    const pair = parseRatePair(row.pair);
    if (!pair) continue;
    if (pair.from === fromCurrency && pair.to === toCurrency) {
      const sell = Number(row.sell ?? row.buy);
      if (!Number.isFinite(sell) || sell <= 0) return null;
      return { direction: "forward", sell, buy: Number(row.buy) };
    }
    if (pair.from === toCurrency && pair.to === fromCurrency) {
      const buy = Number(row.buy ?? row.sell);
      if (!Number.isFinite(buy) || buy <= 0) return null;
      return { direction: "inverse", buy, sell: Number(row.sell) };
    }
  }
  return null;
}

function computeMarketAmounts(rateInfo, amountFrom, amountTo) {
  if (rateInfo.direction === "forward") {
    const sell = rateInfo.sell;
    if (amountFrom != null && amountFrom > 0) {
      const from = floor(amountFrom);
      return { amountFrom: from, amountTo: floor(from * sell) };
    }
    if (amountTo != null && amountTo > 0) {
      const to = floor(amountTo);
      const from = Math.ceil(to / sell);
      return { amountFrom: from, amountTo: to };
    }
  } else {
    const buy = rateInfo.buy;
    if (amountFrom != null && amountFrom > 0) {
      const from = floor(amountFrom);
      return { amountFrom: from, amountTo: floor(from / buy) };
    }
    if (amountTo != null && amountTo > 0) {
      const to = floor(amountTo);
      const from = floor(to * buy);
      return { amountFrom: from, amountTo: to };
    }
  }
  return null;
}

export function marketConvert(
  factionId,
  fromCurrency,
  toCurrency,
  amountFrom,
  amountTo,
  turn,
  intentId,
) {
  if (!fromCurrency || !toCurrency) {
    return { ok: false, error: "currencies required" };
  }
  if (fromCurrency === toCurrency) {
    return { ok: false, error: "same currency" };
  }

  const content = getContent();
  const rateInfo = lookupMarketRate(fromCurrency, toCurrency, content);
  if (!rateInfo) return { ok: false, error: "rate_missing" };

  const amounts = computeMarketAmounts(rateInfo, amountFrom, amountTo);
  if (!amounts || amounts.amountFrom <= 0 || amounts.amountTo <= 0) {
    return { ok: false, error: "amount too small" };
  }

  const ledger = readLedger();
  ensureFactionEco(ledger, factionId);
  const have = ledger.factions[factionId].stocks[fromCurrency] ?? 0;
  if (have < amounts.amountFrom) {
    return { ok: false, error: "insufficient funds" };
  }

  adjustStock(ledger, factionId, fromCurrency, -amounts.amountFrom, {
    turn,
    reason: "market_convert_out",
    intentId,
  });
  adjustStock(ledger, factionId, toCurrency, amounts.amountTo, {
    turn,
    reason: "market_convert_in",
    intentId,
  });
  writeLedger(ledger);
  return { ok: true, ...amounts, rate: rateInfo };
}

export function transferResources(fromId, toId, currencyId, amount, turn, intentId) {
  const amt = floor(amount);
  if (amt <= 0) return { ok: false, error: "amount must be > 0" };
  const ledger = readLedger();
  ensureFactionEco(ledger, fromId);
  ensureFactionEco(ledger, toId);
  const have = ledger.factions[fromId].stocks[currencyId] ?? 0;
  if (have < amt) return { ok: false, error: "insufficient funds" };
  adjustStock(ledger, fromId, currencyId, -amt, {
    turn,
    reason: "transfer_out",
    intentId,
  });
  adjustStock(ledger, toId, currencyId, amt, {
    turn,
    reason: "transfer_in",
    intentId,
  });
  writeLedger(ledger);
  return { ok: true };
}

