/**
 * Economy-tick pure helpers: population growth math, habitability, channel
 * (production/upkeep) application, legacy metal/supply bridge yields, fleet
 * upkeep, tax slot resolution, deficit banding.
 * Extracted from ../economyTick.mjs.
 */
import { applyFlatThenMult } from "../modifierStack.mjs";
import { resolveAlias } from "../normalizeWorld.mjs";
import { planetCapFromBuildings } from "../planetActions.mjs";
import { forceUpkeepRates } from "../forceEconomy.mjs";
import { planetBuildingList, resolveBuildingDef } from "../flowEngine.mjs";
import { readLedger, writeLedger, ensureAllFactions, ensureFactionEco } from "../ledger.mjs";

export function floor(n) {
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
export function fedPopulationForUpkeep(pop, cap) {
  const p = Math.max(0, Number(pop) || 0);
  if (p <= 0) return 0;
  const safeCap = Math.max(1, Number(cap) || 1);
  return Math.min(p, safeCap);
}

export function planetCap(planet, content) {
  return planetCapFromBuildings(planet, content);
}

export function habitabilityForPlanet(planet, racesContent, composition) {
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
export function collectPlanetBuildingGrowthEffects(planet, content) {
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
export function pruneActiveEffects(faction, turn) {
  if (!Array.isArray(faction?.activeEffects)) return;
  faction.activeEffects = faction.activeEffects.filter((e) => {
    if (e?.expiresTurn == null) return true;
    return Number(e.expiresTurn) > turn;
  });
}

export function applyProductionChannel(delta, channel) {
  if (!channel) return delta;
  if (delta > 0) return floor(applyFlatThenMult(delta, channel));
  if (channel.flat) return delta + floor(applyFlatThenMult(0, channel));
  return delta;
}

export function applyUpkeepChannel(delta, channel) {
  if (!channel) return delta;
  // upkeep = flat * mult (flat counted once); apply whether net stays >= 0 or not
  const upkeep = floor(applyFlatThenMult(0, channel));
  return delta - upkeep;
}

/** Merge specific resource channel with wildcard production:* / upkeep:* */
export function mergeChannels(specific, wildcard) {
  if (!specific && !wildcard) return null;
  return {
    flat: (specific?.flat || 0) + (wildcard?.flat || 0),
    mult: (specific?.mult ?? 1) * (wildcard?.mult ?? 1),
  };
}

/**
 * Legacy map yields — only used as soft fallback for resources WITHOUT category/tier
 * (e.g. trade_value). Category deposits go through flow extraction only.
 */
export function mapResourceYieldLegacyOnly(sys, content) {
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

export function fleetUpkeep(world, factionId, content) {
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

export function resolveTaxSlotId(content, slot) {
  const def = content?.taxes?.[slot];
  if (def?.aliasOf && content?.taxes?.[def.aliasOf]) return def.aliasOf;
  return slot;
}

export function taxRateFor(eco, content, slot) {
  const resolved = resolveTaxSlotId(content, slot);
  const tierId = eco.taxes?.[resolved] || eco.taxes?.[slot] || "none";
  const def = content.taxes?.[resolved] || content.taxes?.[slot];
  const tier = def?.tiers?.find((t) => t.id === tierId);
  return tier?.rate ?? 0;
}

/** Primary (non-hidden) tax slots for category taxation. */
export function primaryTaxSlots(content) {
  return Object.values(content?.taxes || {}).filter((t) => t?.id && !t.hidden);
}

/**
 * Soft-deficit from critical category stocks after B1 bridge.
 * Critical empty: B Materia, D Energia, E Bios, supply.
 * Legacy metal alone must NOT mark empty (many empires have metal=0 while materia>0).
 */
export function updateDeficit(eco, content) {
  const lowRatio = content.rules?.deficit?.lowRatio ?? 0.15;
  const critical = {
    "currency.materia": 40,
    "currency.energia": 40,
    "currency.bios": 40,
    "currency.supply": 80,
  };
  const soft = {
    "currency.metal": 80,
  };
  let anyEmpty = false;
  let anyLow = false;
  for (const [cur, ref] of Object.entries(critical)) {
    const v = Number(eco.stocks[cur] ?? 0);
    if (v <= 0) anyEmpty = true;
    else if (v < ref * lowRatio) anyLow = true;
  }
  for (const [cur, ref] of Object.entries(soft)) {
    const v = Number(eco.stocks[cur] ?? 0);
    if (v > 0 && v < ref * lowRatio) anyLow = true;
  }
  if (anyEmpty) eco.deficit = "empty";
  else if (anyLow) eco.deficit = "low";
  else eco.deficit = "ok";
}
