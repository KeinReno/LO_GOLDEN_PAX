import { adjustStock } from "./adjustStock.mjs";
import { resolveDeficit } from "./deficit.mjs";
import { taxRateFor } from "./taxes.mjs";
import { naturalPopDeltaBeforeModifiers, applyPopGrowthModifiers } from "./populationGrowth.mjs";

/**
 * One faction's turn: population growth on its planets, category income
 * taxed and applied to stocks, deficit re-evaluated. Ported real formulas
 * (see adjustStock.mjs, deficit.mjs, taxes.mjs, populationGrowth.mjs) —
 * this file is the orchestration, not a reimplementation of the math.
 *
 * What's real: the tax/clamp/reserve math, the deficit thresholds, the
 * population growth/emigration curve, the empty-treasury emigration
 * penalty, and the tax-pressure decay/cap — byte-parity tested against
 * GMap where GMap exports the piece (see this domain's *.test.mjs files).
 *
 * What's NOT here yet, deliberately (see README.md "Status"): the actual
 * *amount* of category income is a caller-supplied input
 * (`faction.categoryIncome`), not computed — that requires the flow-matrix
 * engine (GMap/server/flowEngine.mjs), building yields, the faction-effects
 * modifier stack (GMap/server/modifierStack.mjs), and the rest of the
 * world/planet/building model, none of which exist in this project yet.
 * Same reasoning for `faction.pressureAdd`: GMap derives it from
 * `stack.channels.tax_pressure` on that same modifier stack — this port
 * takes the already-computed add as an input and does the real decay/cap
 * math around it (see PRESSURE_MAX below).
 * Porting the flow matrix is what turns this from "a real but input-fed
 * tick" into "the real economy" — tracked as the next step after this
 * foundation.
 *
 * @param {{
 *   id: string,
 *   eco: { stocks: Record<string, number>, taxes: Record<string,string>, stockReserves?: object, pressure?: number },
 *   categoryIncome?: Record<string, number>,
 *   pressureAdd?: number,
 *   planets?: { pop: number, cap: number, growthRate: number, habEff: number, supplyFactor: number }[],
 * }[]} factions
 * @param {number} turn
 * @param {object} content  loaded via server/contentLoader.mjs
 */
const PRESSURE_MAX = 12;

export function runEconomyTick(factions, turn, content) {
  const maxLoss = content?.rules?.population?.maxLossPerTurn ?? 0.15;
  const taxSinkMode = content?.rules?.tax?.defaultMode === "sink";
  const breakdowns = {};
  const journal = [];

  for (const faction of factions) {
    let eco = { ...faction.eco, factionId: faction.id };
    const channels = {};

    for (const [currencyId, grossIncome] of Object.entries(faction.categoryIncome || {})) {
      const taxSlot = currencyToTaxSlot(currencyId);
      let delta = Math.floor(Number(grossIncome) || 0);
      let taxRate = 0;
      let taxAmt = 0;
      if (taxSlot) {
        taxRate = taxRateFor(eco, content, taxSlot);
        if (taxRate > 0 && delta > 0) {
          taxAmt = Math.floor(delta * taxRate);
          if (taxSinkMode) delta -= taxAmt;
        }
      }
      const { stocks, appliedDelta, journalEntry } = adjustStock(eco, currencyId, delta, {
        turn,
        reason: delta >= 0 ? "flow_income" : "flow_upkeep",
      });
      eco = { ...eco, stocks };
      if (journalEntry) journal.push(journalEntry);
      channels[currencyId] = { gross: Math.floor(Number(grossIncome) || 0), taxRate, tax: taxAmt, net: appliedDelta };
    }

    const deficit = resolveDeficit(eco.stocks, content);
    const pressure = Math.max(0, Math.min(PRESSURE_MAX, Math.floor((eco.pressure || 0) * 0.85 + (faction.pressureAdd || 0))));
    eco = { ...eco, deficit, pressure };

    const planetResults = (faction.planets || []).map((p) => {
      let natural = naturalPopDeltaBeforeModifiers(p.pop, p.cap, p.growthRate, p.habEff, p.supplyFactor, maxLoss);
      natural = applyPopGrowthModifiers(natural, faction.popGrowthEffects);
      if (deficit === "empty") natural = Math.min(natural, -p.pop * 0.02);
      let delta = Math.floor(natural);
      const minDelta = -Math.floor(p.pop * maxLoss);
      if (delta < minDelta) delta = minDelta;
      const nextPop = Math.max(0, p.pop + delta);
      return { ...p, pop: nextPop, delta };
    });

    breakdowns[faction.id] = { factionId: faction.id, channels, deficit, pressure, planets: planetResults };
    journal.push({ type: "economy", factionId: faction.id, deficit, pressure, turn });

    faction.eco = eco;
    faction.planets = planetResults;
  }

  return { breakdowns, journal };
}

const CATEGORY_TAX_SLOT = {
  "currency.materia": "tax.materia",
  "currency.energia": "tax.energia",
  "currency.bios": "tax.bios",
};

function currencyToTaxSlot(currencyId) {
  return CATEGORY_TAX_SLOT[currencyId] || null;
}
