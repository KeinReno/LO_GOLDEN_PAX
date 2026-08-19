/**
 * runEconomyTick: mutates world planet population; updates ledger stocks
 * from flows + legacy bridge. Kept as one function — every intermediate
 * value (categoryNet, channels, metalDelta, supplyDelta, treasuryPeg…)
 * threads through the whole faction loop; splitting it raises real risk
 * of dropping a field for modest line-count benefit (same judgment call
 * as applyPlanetAction / the stability revolt state machine).
 * Extracted from ../economyTick.mjs.
 */
import { getContent } from "../contentLoader.mjs";
import {
  buildModifierStack,
  applyFlatThenMult,
  collectRaceEffects,
  resolvePlanetRaceComposition,
  explainStack,
} from "../modifierStack.mjs";
import { resolveEmpireApMax } from "../apBudget.mjs";
import { collectSystemPoiEffects, spawnRefugees } from "../narrative.mjs";
import { depleteWorldSpaceObjects } from "../spaceObjects.mjs";
import { collectTreatyEffects } from "../opinionTick.mjs";
import { courtPopGrowthEffects } from "../courtGovernance.mjs";
import {
  readLedger,
  writeLedger,
  ensureAllFactions,
  ensureFactionEco,
  adjustStock,
  sanitizeEconomyExplain,
} from "../ledger.mjs";
import { categoryToCurrency, CATEGORIES } from "../flowEngine.mjs";
import { logisticsProductionMult } from "../logistics.mjs";
import { resolveTreasuryPeg, applyTreasuryPegIncome } from "../currencyPeg.mjs";
import { applyCurrencyUnionIncome } from "../economicTrack.mjs";
import { refreshFxExchange } from "../fxExchange.mjs";
import { applyRoleScores } from "../roleScores.mjs";
import { collectFactionEffects } from "./factionEffects.mjs";
import { computeFlowBreakdown } from "./flowBreakdown.mjs";
import {
  floor,
  applyProductionChannel,
  applyUpkeepChannel,
  mergeChannels,
  mapResourceYieldLegacyOnly,
  fleetUpkeep,
  taxRateFor,
  primaryTaxSlots,
  updateDeficit,
  planetCap,
  habitabilityForPlanet,
  collectPlanetBuildingGrowthEffects,
  naturalPopDeltaBeforeModifiers,
} from "./helpers.mjs";

export { resolveTreasuryPeg };

/**
 * Mutates world planets population; updates ledger stocks from flows + bridge.
 */
export function runEconomyTick(world, turn) {
  const content = getContent();
  const ledger = ensureAllFactions(readLedger(), world);
  const journal = [];
  const breakdowns = {};
  /** Aggregate strategic extraction by peg resource for FX (A5). */
  const extractionByPeg = {};

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

    // Strategic map resources: dual-write named stocks from extraction (B1 T1.3).
    // Gross extraction → eco.stocks[resourceId]; category net still goes to currency.*
    // for RPS dashboard. One production unit must NOT also pay metal/supply (bridge below).
    const strategicExtraction = flowBreak.strategicExtraction || {};
    for (const [resourceId, raw] of Object.entries(strategicExtraction)) {
      const amt = floor(raw);
      if (amt <= 0) continue;
      adjustStock(ledger, fac.id, resourceId, amt, {
        turn,
        reason: "strategic_extraction",
      });
      extractionByPeg[resourceId] =
        (extractionByPeg[resourceId] || 0) + amt;
    }
    // RoleScore once per faction per tick (bulk + strategic). Never spent.
    // Do not also pass strategicExtraction — named stocks are already in roleExtraction.
    applyRoleScores(eco, content, flowBreak.roleExtraction || strategicExtraction);

    // B1 T1.6: strategic slotFills spend named stocks (not category buckets).
    const namedSlotUpkeep = flowBreak.namedSlotUpkeep || {};
    for (const [resourceId, raw] of Object.entries(namedSlotUpkeep)) {
      const amt = floor(raw);
      if (amt <= 0) continue;
      adjustStock(ledger, fac.id, resourceId, -amt, {
        turn,
        reason: "slot_upkeep_named",
      });
    }

    const namedModuleProduction = flowBreak.namedModuleProduction || {};
    for (const [resourceId, raw] of Object.entries(namedModuleProduction)) {
      const amt = floor(raw);
      if (amt <= 0) continue;
      adjustStock(ledger, fac.id, resourceId, amt, {
        turn,
        reason: "module_production",
      });
    }

    // --- Legacy metal/supply bridge (B1 / C1.T1.1) ---
    // Rule: do NOT mirror positive categoryNet (materia/energia/bios) into
    // currency.metal / currency.supply. Category stocks + named strategic stocks
    // are the spendable truth for B/D/E production — one unit pays one treasury.
    // Legacy metal/supply only receive:
    //   (1) mapResourceYieldLegacyOnly (uncategorized deposits + soft pop supply)
    //   (2) metal fleet upkeep debit (shipyard compatibility)
    //   (3) soft drain when category nets are negative (deficit pressure)
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

    // No categoryNet mirror — only legacy-only yields (+ baseline supply soft).
    const bridgeMetal = legacyGross["currency.metal"] || 0;
    const bridgeSupply = legacyGross["currency.supply"] || 0;

    let metalAfter = floor(bridgeMetal);
    let supplyAfter = floor(bridgeSupply);

    // Tax only applies to genuine legacy bridge income (not mirrored category nets).
    const taxInd = taxRateFor(eco, content, "tax.materia");
    const taxSup = taxRateFor(eco, content, "tax.bios");
    const taxMetal = floor(metalAfter * taxInd);
    const taxSupply = floor(supplyAfter * taxSup);
    if (content.rules?.tax?.defaultMode === "sink") {
      metalAfter -= taxMetal;
      supplyAfter -= taxSupply;
    }

    // Legacy fleet metal upkeep still on metal (ships cost metal to maintain).
    // Supply fleet/pop already represented as D/E demand in flows — avoid full double.
    let metalUpkeep = fleetUpkeep(world, fac.id, content)["currency.metal"] || 0;
    metalUpkeep = applyFlatThenMult(metalUpkeep, stack.channels["upkeep:currency.metal"]);

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
      bridgedFrom: "legacy_only",
    };
    channels["currency.supply"] = {
      base: floor(bridgeSupply),
      afterProd: floor(supplyAfter),
      taxRate: taxSup,
      tax: taxSupply,
      upkeep: floor(supplyUpkeepFlat),
      net: supplyDelta,
      bridgedFrom: "legacy_only",
    };

    if (metalDelta !== 0) {
      adjustStock(ledger, fac.id, "currency.metal", metalDelta, {
        turn,
        reason: metalDelta >= 0 ? "bridge_income" : "bridge_upkeep",
      });
    }
    // Treasury peg (B1 T1.4): Казна = named anchor extraction, NOT B.materia bridge.
    // Named stock already credited above via strategic_extraction — no second adjustStock.
    const treasuryPeg = resolveTreasuryPeg(fac, content);
    if (treasuryPeg && treasuryPeg !== "currency.metal") {
      const pegExtracted = floor(strategicExtraction[treasuryPeg] || 0);
      channels[treasuryPeg] = {
        base: pegExtracted,
        afterProd: pegExtracted,
        taxRate: 0,
        tax: 0,
        upkeep: 0,
        net: pegExtracted,
        bridgedFrom: `${treasuryPeg}→treasury`,
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
    // Cap accumulated tax pressure — without a ceiling, high materia tax
    // equilibrates near ~40 and zeros loyalty across the empire.
    const PRESSURE_MAX = 12;
    eco.pressure = Math.max(
      0,
      Math.min(PRESSURE_MAX, floor((eco.pressure || 0) * 0.85 + pressureAdd)),
    );

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

  // P4b field depletion only (asteroid/comet/debris). Planet deposits stay infinite.
  depleteWorldSpaceObjects(world, content);

  // Peg → metal/supply AFTER all factions' extraction (complete galaxy totals).
  // Legacy floor above is untouched; this add is uncapped.
  const gmPegMultipliers = world.meta?.gmPegMultipliers || {};
  for (const fac of world.factions ?? []) {
    const bd = breakdowns[fac.id];
    const strategicExtraction = bd?.flows?.strategicExtraction || {};
    const conv = applyTreasuryPegIncome(
      fac,
      strategicExtraction,
      extractionByPeg,
      content,
      { gmMultipliers: gmPegMultipliers, currentTurn: turn },
    );
    const pegMetal = conv["currency.metal"] || 0;
    const pegSupply = conv["currency.supply"] || 0;
    if (pegMetal) {
      adjustStock(ledger, fac.id, "currency.metal", pegMetal, {
        turn,
        reason: "peg_conversion",
      });
    }
    if (pegSupply) {
      adjustStock(ledger, fac.id, "currency.supply", pegSupply, {
        turn,
        reason: "peg_conversion",
      });
    }
    if (!bd) continue;
    if (bd.channels?.["currency.metal"] && pegMetal) {
      bd.channels["currency.metal"].pegConverted = pegMetal;
      bd.channels["currency.metal"].net =
        (bd.channels["currency.metal"].net || 0) + pegMetal;
    }
    if (bd.channels?.["currency.supply"] && pegSupply) {
      bd.channels["currency.supply"].pegConverted = pegSupply;
      bd.channels["currency.supply"].net =
        (bd.channels["currency.supply"].net || 0) + pegSupply;
    }
    const entry = journal.find((j) => j.type === "economy" && j.factionId === fac.id);
    if (entry?.net) {
      entry.net["currency.metal"] = (entry.net["currency.metal"] || 0) + pegMetal;
      entry.net["currency.supply"] = (entry.net["currency.supply"] || 0) + pegSupply;
    }
    if (bd.explain) {
      const eco = ensureFactionEco(ledger, fac.id);
      eco.explain = sanitizeEconomyExplain(bd.explain, {
        channels: bd.channels,
        deficit: eco.deficit,
      });
      bd.explainPublic = eco.explain;
    }
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
        growthEffects.push(...courtPopGrowthEffects(fac));
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

  // A5: refresh fx.* quotes via Exchange Credit + EMA inertia.
  let fxState = null;
  try {
    fxState = refreshFxExchange(content, ledger, extractionByPeg, turn);
  } catch (err) {
    console.warn("[economyTick] fx exchange refresh failed", err?.message || err);
  }

  // Currency-union additive metal/supply (fx EC × peg). Not a category redirect.
  try {
    applyCurrencyUnionIncome(
      world,
      ledger,
      breakdowns,
      extractionByPeg,
      content,
      turn,
      fxState,
    );
  } catch (err) {
    console.warn("[economyTick] currency union income failed", err?.message || err);
  }

  writeLedger(ledger);
  return { breakdowns, journal, ledger };
}
