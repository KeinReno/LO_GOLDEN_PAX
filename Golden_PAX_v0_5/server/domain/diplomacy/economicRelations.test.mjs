/**
 * Economic-track relations + barter/deal settlement. NOT a port.
 */
import { describe, it, expect } from "vitest";
import { syncTreatiesFromEdge } from "./treaties.mjs";
import { defaultDiplomacyAccount } from "./diplomacyAccount.mjs";
import {
  applyExchangeDeal,
  applyCurrencyUnion,
  barterStrategicSwap,
  settleExchangeDeal,
  findEconomicTreaty,
  EXCHANGE_DEAL,
} from "./economicRelations.mjs";

function faction(id, extras = {}) {
  return { id, diplomacy: defaultDiplomacyAccount(), ...extras };
}

function eco(factionId, stocks) {
  return { factionId, stocks: { ...stocks } };
}

const stances = {
  alliance: { track: "political", effects: [] },
  currency_exchange: { track: "economic", effects: [] },
  currency_union: { track: "economic", effects: [] },
};

const content = {
  economy_schema: { resource_ranks: { strategic: ["map.titan", "map.glasssteel"] } },
};

describe("applyExchangeDeal / applyCurrencyUnion", () => {
  it("coexists with a political alliance and stores frozen deal terms", () => {
    const allied = syncTreatiesFromEdge(faction("a"), faction("b"), "alliance", 1, stances);
    const deal = applyExchangeDeal(
      { ...allied.factionA, pegResourceId: "map.titan" },
      { ...allied.factionB, pegResourceId: "map.glasssteel" },
      2,
      stances,
      { unitsQuotePerBase: 2 },
    );
    expect(deal.ok).toBe(true);
    expect(deal.factionA.diplomacy.treaties.map((t) => t.type).sort()).toEqual(["alliance", "currency_exchange"]);
    const t = findEconomicTreaty(deal.factionA, "b", EXCHANGE_DEAL);
    expect(t).toMatchObject({ basePeg: "map.titan", quotePeg: "map.glasssteel", unitsQuotePerBase: 2, track: "economic" });
  });

  it("currency union reports the host peg without wiping the political track", () => {
    const allied = syncTreatiesFromEdge(faction("a"), faction("b"), "alliance", 1, stances);
    const union = applyCurrencyUnion(
      { ...allied.factionA, pegResourceId: "map.titan" },
      { ...allied.factionB, pegResourceId: "map.glasssteel" },
      3,
      stances,
    );
    expect(union.ok).toBe(true);
    expect(union.adoptedPeg).toBe("map.glasssteel");
    expect(union.factionA.diplomacy.treaties.map((t) => t.type).sort()).toEqual(["alliance", "currency_union"]);
  });
});

describe("barterStrategicSwap vs settleExchangeDeal", () => {
  it("barter moves raw stocks 1:1 (or any quoted amounts) with no treaty", () => {
    const result = barterStrategicSwap(
      eco("a", { "map.titan": 5, "map.glasssteel": 0 }),
      eco("b", { "map.titan": 0, "map.glasssteel": 8 }),
      { resourceId: "map.titan", amount: 2 },
      { resourceId: "map.glasssteel", amount: 2 },
      content,
    );
    expect(result.ok).toBe(true);
    expect(result.fromEco.stocks["map.titan"]).toBe(3);
    expect(result.fromEco.stocks["map.glasssteel"]).toBe(2);
    expect(result.toEco.stocks["map.titan"]).toBe(2);
    expect(result.toEco.stocks["map.glasssteel"]).toBe(6);
  });

  it("rejects a non-strategic id", () => {
    const result = barterStrategicSwap(
      eco("a", { "currency.metal": 10 }),
      eco("b", { "currency.metal": 10 }),
      { resourceId: "currency.metal", amount: 1 },
      null,
      content,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe("not_strategic_resource");
  });

  it("exchange-deal settlement uses the frozen rate, not 1:1", () => {
    const deal = applyExchangeDeal(
      { ...faction("a"), pegResourceId: "map.titan" },
      { ...faction("b"), pegResourceId: "map.glasssteel" },
      1,
      stances,
      { unitsQuotePerBase: 2 },
    );
    const treaty = findEconomicTreaty(deal.factionA, "b", EXCHANGE_DEAL);
    const settled = settleExchangeDeal(
      eco("a", { "map.titan": 4, "map.glasssteel": 0 }),
      eco("b", { "map.titan": 0, "map.glasssteel": 10 }),
      2,
      treaty,
    );
    expect(settled.ok).toBe(true);
    expect(settled.giveAmt).toBe(2);
    expect(settled.takeAmt).toBe(4);
    expect(settled.fromEco.stocks["map.titan"]).toBe(2);
    expect(settled.fromEco.stocks["map.glasssteel"]).toBe(4);
    expect(settled.toEco.stocks["map.titan"]).toBe(2);
    expect(settled.toEco.stocks["map.glasssteel"]).toBe(6);
  });

  it("refuses settlement without a deal treaty", () => {
    const settled = settleExchangeDeal(eco("a", { "map.titan": 4 }), eco("b", { "map.glasssteel": 4 }), 1, null);
    expect(settled.ok).toBe(false);
    expect(settled.error).toBe("no_exchange_deal");
  });
});
