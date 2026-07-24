/**
 * Economy + population tick (P4).
 */
import { getContent } from "./contentLoader.mjs";
import {
  buildModifierStack,
  applyFlatThenMult,
  resolveApMax,
  collectRaceEffects,
  explainStack,
} from "./modifierStack.mjs";
import {
  readLedger,
  writeLedger,
  ensureAllFactions,
  ensureFactionEco,
  adjustStock,
} from "./ledger.mjs";
import { resolveAlias } from "./normalizeWorld.mjs";

function floor(n) {
  return Math.floor(Number(n) || 0);
}

function planetCap(planet, content) {
  const base = 20;
  let cap = base;
  for (const b of planet.buildings ?? []) {
    if (b.disabled) continue;
    if (b.kind === "residential" || b.kind === "habitat") cap += 15;
    if (b.kind === "capitol") cap += 10;
  }
  if (planet.colonyType === "core") cap += 25;
  if (planet.colonyType === "outpost") cap += 5;
  return cap;
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
    const hv = map[climate] ?? map[planet.type] ?? 0.8;
    hSum += hv * w;
    wSum += w;
  }
  if (wSum > 0) h = hSum / wSum;
  return h;
}

function collectFactionEffects(world, factionId, eco, content) {
  const effects = [];

  // Tax tier side-effects
  for (const [slot, tierId] of Object.entries(eco.taxes || {})) {
    const def = content.taxes?.[slot];
    const tier = def?.tiers?.find((t) => t.id === tierId);
    for (const e of tier?.effects || []) {
      effects.push({
        ...e,
        source: { kind: "tax", id: `${slot}:${tierId}`, label: def?.name },
      });
    }
  }

  // Race traits on owned inhabited planets
  for (const sys of world.systems ?? []) {
    if (sys.ownerFactionId !== factionId) continue;
    for (const p of sys.planets ?? []) {
      if ((p.population ?? 0) <= 0) continue;
      effects.push(
        ...collectRaceEffects(content.races, p.raceComposition || []),
      );
    }
  }

  // Deficit
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

  // Pressure thresholds
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

  return effects;
}

function mapResourceYield(sys, content) {
  const yields = { "currency.metal": 0, "currency.supply": 0 };
  for (const r of sys.resources ?? []) {
    const key = resolveAlias("resources", r);
    // also try matching by name in map_resources
    let def = content.map_resources?.[key];
    if (!def) {
      def = Object.values(content.map_resources || {}).find(
        (x) => x.name === r || x.id === key,
      );
    }
    if (!def?.yield) continue;
    for (const [cur, amt] of Object.entries(def.yield)) {
      yields[cur] = (yields[cur] || 0) + Number(amt || 0);
    }
  }
  // inhabited bonus supply
  const pop = (sys.planets ?? []).reduce((s, p) => s + (p.population || 0), 0);
  if (pop > 0) yields["currency.supply"] += 1;
  return yields;
}

function fleetUpkeep(world, factionId) {
  let metal = 0;
  let supply = 0;
  for (const f of world.fleets ?? []) {
    if (f.factionId !== factionId) continue;
    const n = (f.composition ?? []).reduce((s, g) => s + (g.count || 0), 0) || 1;
    metal += Math.ceil(n * 0.5);
    supply += Math.ceil(n * 0.3);
  }
  for (const l of world.legions ?? []) {
    if (l.factionId !== factionId) continue;
    const n =
      (l.composition ?? []).reduce((s, g) => s + (g.count || 0), 0) ||
      l.strength ||
      1;
    supply += Math.ceil(n * 0.4);
  }
  return { "currency.metal": metal, "currency.supply": supply };
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
  for (const [slot, tierId] of Object.entries(pending)) {
    eco.taxes[slot] = tierId;
  }
  eco.pendingPolicy.taxes = {};
}

/** Activate tax changes queued on previous day (next_tick semantics). */
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
  const tierId = eco.taxes?.[slot] || "none";
  const def = content.taxes?.[slot];
  const tier = def?.tiers?.find((t) => t.id === tierId);
  return tier?.rate ?? 0;
}

function updateDeficit(eco, content) {
  const metal = eco.stocks["currency.metal"] ?? 0;
  const supply = eco.stocks["currency.supply"] ?? 0;
  const lowRatio = content.rules?.deficit?.lowRatio ?? 0.15;
  // soft thresholds vs starting-ish 80
  const ref = 80;
  if (metal <= 0 || supply <= 0) eco.deficit = "empty";
  else if (metal < ref * lowRatio || supply < ref * lowRatio) eco.deficit = "low";
  else eco.deficit = "ok";
}

/**
 * Mutates world planets population; updates ledger stocks.
 * @returns {{ breakdowns: object, journal: object[] }}
 */
export function runEconomyTick(world, turn) {
  const content = getContent();
  const ledger = ensureAllFactions(readLedger(), world);
  const journal = [];
  const breakdowns = {};

  for (const fac of world.factions ?? []) {
    const eco = ensureFactionEco(ledger, fac.id);
    // pending taxes activated at start of processTurn (next_tick)

    const effects = collectFactionEffects(world, fac.id, eco, content);
    const stack = buildModifierStack(effects, {
      mergeOrder: content.rules?.economyMergeOrder,
    });

    // Gross income
    const gross = { "currency.metal": 0, "currency.supply": 2 }; // base supply
    for (const sys of world.systems ?? []) {
      if (sys.ownerFactionId !== fac.id) continue;
      const y = mapResourceYield(sys, content);
      for (const [k, v] of Object.entries(y)) {
        gross[k] = (gross[k] || 0) + v;
      }
    }

    const channels = {};
    const net = {};
    let pressureAdd = 0;

    for (const cur of Object.keys(content.currencies || {})) {
      const base = gross[cur] || 0;
      const ch = stack.channels[`production:${cur}`];
      let afterProd = applyFlatThenMult(base, ch);

      // Tax
      let taxTaken = 0;
      const slot =
        cur === "currency.metal"
          ? "tax.industry"
          : cur === "currency.supply"
            ? "tax.supply"
            : null;
      if (slot) {
        const rate = taxRateFor(eco, content, slot);
        taxTaken = floor(afterProd * rate);
        // treasury mode: tax is accounting + side effects; stock gets net after "rate" display
        // Spec: treasury — collected returns to same stock; meaning is side-effects.
        // Practical: player stock changes by afterProd - upkeep; tax only for pressure/journal.
        if (content.rules?.tax?.defaultMode === "sink") {
          afterProd -= taxTaken;
        }
        // pressure from tier effects already in stack; also accumulate tax_pressure flats
      }

      const upkeepCh = stack.channels[`upkeep:${cur}`];
      let upkeep = 0;
      if (cur === "currency.metal") {
        upkeep += fleetUpkeep(world, fac.id)["currency.metal"] || 0;
      }
      if (cur === "currency.supply") {
        upkeep += fleetUpkeep(world, fac.id)["currency.supply"] || 0;
        upkeep += popUpkeep(world, fac.id)["currency.supply"] || 0;
      }
      upkeep = applyFlatThenMult(upkeep, upkeepCh);

      const delta = floor(afterProd - upkeep);
      channels[cur] = {
        base,
        afterProd: floor(afterProd),
        taxRate: slot ? taxRateFor(eco, content, slot) : 0,
        tax: taxTaken,
        upkeep: floor(upkeep),
        net: delta,
      };
      net[cur] = delta;
      if (delta !== 0) {
        adjustStock(ledger, fac.id, cur, delta, {
          turn,
          reason: delta >= 0 ? "income_net" : "upkeep_net",
        });
      }
    }

    const pressureCh = stack.channels.tax_pressure;
    pressureAdd = pressureCh?.flat ?? 0;
    eco.pressure = Math.max(0, floor((eco.pressure || 0) * 0.85 + pressureAdd));

    updateDeficit(eco, content);

    const apMax = resolveApMax(content.rules?.apPerTurn ?? 3, stack);

    breakdowns[fac.id] = {
      factionId: fac.id,
      channels,
      pressure: eco.pressure,
      deficit: eco.deficit,
      taxes: { ...eco.taxes },
      apMax,
      explain: explainStack(stack),
    };

    journal.push({
      type: "economy",
      factionId: fac.id,
      net,
      deficit: eco.deficit,
      pressure: eco.pressure,
      apMax,
    });
  }

  // Population
  const maxLoss = content.rules?.population?.maxLossPerTurn ?? 0.15;
  const baseGrowth = content.rules?.population?.baseGrowth ?? 0.012;

  for (const sys of world.systems ?? []) {
    const owner = sys.ownerFactionId;
    const eco = owner ? ensureFactionEco(ledger, owner) : null;
    const supplyOk = !eco || (eco.stocks["currency.supply"] ?? 0) > 0;
    const supplyFactor = !eco
      ? 1
      : eco.deficit === "empty"
        ? 0.4
        : eco.deficit === "low"
          ? 0.75
          : supplyOk
            ? 1
            : 0.5;

    for (const p of sys.planets ?? []) {
      if ((p.population ?? 0) <= 0 && !(p.habitable || p.colonyType)) continue;
      let pop = p.population || 0;
      if (pop <= 0) continue;

      const composition =
        p.raceComposition?.length > 0
          ? p.raceComposition
          : [{ raceId: "race_human", percent: 100 }];

      let rate = 0;
      for (const share of composition) {
        const race = content.races?.[share.raceId];
        const br = race?.growth?.baseRate ?? baseGrowth;
        rate += br * ((share.percent ?? 0) / 100);
      }
      const hab = habitabilityForPlanet(p, content.races, composition);
      const cap = planetCap(p, content);
      const overcrowd = pop > cap ? Math.max(0.2, 1 - (pop - cap) / cap) : 1;

      // quarantine POI
      let growthMult = 1;
      const objs = sys.spaceObjects || (sys.poiType && sys.poiType !== "none" ? [sys.poiType] : []);
      if (objs.includes("quarantine")) growthMult *= 0.5;

      let natural = pop * rate * hab * supplyFactor * overcrowd * growthMult;
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

      // Soft emigration → note only (full refugee POI in P6)
      if (delta < 0 && Math.abs(delta) >= 2 && owner) {
        journal.push({
          type: "emigration_pressure",
          systemId: sys.id,
          factionId: owner,
          amount: Math.abs(delta),
        });
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
