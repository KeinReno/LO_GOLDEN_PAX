/**
 * Economic track: union / barter / frozen quote vs no-treaty.
 * Run: node --test server/economicTrack.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { syncTreatiesFromEdge, getRelation, TRACK_POLITICAL } from "./opinionTick.mjs";
import {
  applyExchangeDeal,
  applyCurrencyUnion,
  barterStrategicSwap,
  settleExchangeDeal,
  findEconomicTreaty,
  applyCurrencyUnionIncome,
  unionIncomeForJoiner,
  EXCHANGE_DEAL,
  CURRENCY_UNION,
} from "./economicTrack.mjs";
import { convertPeggedResource } from "./currencyPeg.mjs";
import { ensureFactionEco } from "./ledger.mjs";

const stances = {
  alliance: { track: "political", effects: [{ effect: "combat_assist" }] },
  currency_exchange: { track: "economic", effects: [] },
  currency_union: { track: "economic", effects: [] },
};

const content = {
  diplomacy_stances: stances,
  economy_schema: { resource_ranks: { strategic: ["map.titan", "map.glasssteel"] } },
  economy_balance: {
    currencyPeg: {
      baseRate: 1,
      dominanceK: 1.5,
      rarityRef: 20,
      rarityExp: 0.35,
      rateMin: 0.01,
      rateMax: 12,
      unionIncomeShare: 0.1,
    },
  },
};

function faction(id, extras = {}) {
  return {
    id,
    diplomacy: { opinions: {}, treaties: [], history: [] },
    ...extras,
  };
}

function worldOf(a, b, edges = []) {
  return { meta: { turn: 1 }, factions: [a, b], diplomacy: edges };
}

function ledgerOf(stocksByFaction) {
  const ledger = { factions: {}, entries: [] };
  for (const [id, stocks] of Object.entries(stocksByFaction)) {
    const eco = ensureFactionEco(ledger, id);
    eco.stocks = { ...eco.stocks, ...stocks };
  }
  return ledger;
}

describe("treaties keyed by (pair, track)", () => {
  it("keeps a political alliance when an economic deal is signed", () => {
    const a = faction("a", { treasuryPeg: "map.titan" });
    const b = faction("b", { treasuryPeg: "map.glasssteel" });
    const world = worldOf(a, b);
    syncTreatiesFromEdge(world, "a", "b", "alliance", 1, stances);
    const deal = applyExchangeDeal(world, "a", "b", 2, { unitsQuotePerBase: 2 }, content);
    assert.equal(deal.ok, true);
    const types = a.diplomacy.treaties.map((t) => t.type).sort();
    assert.deepEqual(types, ["alliance", "currency_exchange"]);
    assert.equal(getRelation(world, "a", "b"), "neutral");
    const t = findEconomicTreaty(a, "b", EXCHANGE_DEAL);
    assert.equal(t.unitsQuotePerBase, 2);
    assert.equal(t.track, "economic");
    assert.equal(t.basePeg, "map.titan");
    assert.equal(t.quotePeg, "map.glasssteel");
  });

  it("union replaces the economic track only and adopts the host peg", () => {
    const a = faction("a", { treasuryPeg: "map.titan" });
    const b = faction("b", { treasuryPeg: "map.glasssteel" });
    const world = worldOf(a, b, [
      { aId: "a", bId: "b", relation: "alliance", track: TRACK_POLITICAL },
    ]);
    syncTreatiesFromEdge(world, "a", "b", "alliance", 1, stances);
    applyExchangeDeal(world, "a", "b", 2, { unitsQuotePerBase: 2 }, content);
    const union = applyCurrencyUnion(world, "b", "a", 3, content);
    assert.equal(union.ok, true);
    assert.equal(union.adoptedPeg, "map.titan");
    assert.equal(b.treasuryPeg, "map.titan");
    assert.equal(a.treasuryPeg, "map.titan");
    const types = b.diplomacy.treaties.map((t) => t.type).sort();
    assert.deepEqual(types, ["alliance", "currency_union"]);
    assert.equal(findEconomicTreaty(b, "a", EXCHANGE_DEAL), null);
  });
});

describe("barter vs frozen quote vs no-treaty", () => {
  it("barter moves raw stocks 1:1 with no treaty", () => {
    const ledger = ledgerOf({
      a: { "map.titan": 5, "map.glasssteel": 0 },
      b: { "map.titan": 0, "map.glasssteel": 8 },
    });
    const result = barterStrategicSwap(
      ledger,
      "a",
      "b",
      { resourceId: "map.titan", amount: 2 },
      { resourceId: "map.glasssteel", amount: 2 },
      content,
    );
    assert.equal(result.ok, true);
    assert.equal(result.fromStocks["map.titan"], 3);
    assert.equal(result.fromStocks["map.glasssteel"], 2);
    assert.equal(result.toStocks["map.titan"], 2);
    assert.equal(result.toStocks["map.glasssteel"], 6);
  });

  it("rejects a non-strategic id", () => {
    const ledger = ledgerOf({
      a: { "currency.metal": 10 },
      b: { "currency.metal": 10 },
    });
    const result = barterStrategicSwap(
      ledger,
      "a",
      "b",
      { resourceId: "currency.metal", amount: 1 },
      null,
      content,
    );
    assert.equal(result.ok, false);
    assert.equal(result.error, "not_strategic_resource");
  });

  it("refuses settlement without a deal (no-treaty)", () => {
    const a = faction("a");
    const b = faction("b");
    const world = worldOf(a, b);
    const ledger = ledgerOf({
      a: { "map.titan": 4 },
      b: { "map.glasssteel": 4 },
    });
    const settled = settleExchangeDeal(ledger, "a", "b", 1, null);
    assert.equal(settled.ok, false);
    assert.equal(settled.error, "no_exchange_deal");
  });

  it("exchange-deal settlement uses the frozen rate, not 1:1", () => {
    const a = faction("a", { treasuryPeg: "map.titan" });
    const b = faction("b", { treasuryPeg: "map.glasssteel" });
    const world = worldOf(a, b);
    applyExchangeDeal(world, "a", "b", 1, { unitsQuotePerBase: 2 }, content);
    const ledger = ledgerOf({
      a: { "map.titan": 4, "map.glasssteel": 0 },
      b: { "map.titan": 0, "map.glasssteel": 10 },
    });
    const treaty = findEconomicTreaty(a, "b", EXCHANGE_DEAL);
    const settled = settleExchangeDeal(ledger, "a", "b", 2, treaty);
    assert.equal(settled.ok, true);
    assert.equal(settled.giveAmt, 2);
    assert.equal(settled.takeAmt, 4);
    assert.equal(settled.fromStocks["map.titan"], 2);
    assert.equal(settled.fromStocks["map.glasssteel"], 4);
    assert.equal(settled.toStocks["map.titan"], 2);
    assert.equal(settled.toStocks["map.glasssteel"], 6);
  });
});

describe("union income vs no-treaty (additive, not a redirect)", () => {
  const globals = { "map.titan": 200, "map.glasssteel": 200 };
  const extraction = { "map.titan": 100 };
  const fxState = { credits: { "map.titan": 2, "map.glasssteel": 1 } };

  it("no-treaty joiner gets zero union bonus", () => {
    const joining = faction("b", { treasuryPeg: "map.glasssteel" });
    const host = faction("a", { treasuryPeg: "map.titan" });
    const extra = unionIncomeForJoiner(
      joining,
      host,
      { "map.glasssteel": 10 },
      globals,
      content,
      fxState,
    );
    // Without a union apply, this helper still computes a hypothetical —
    // tick applyCurrencyUnionIncome skips factions with no treaty.
    assert.ok(extra["currency.metal"] >= 0);
    const world = worldOf(joining, host);
    const ledger = ledgerOf({
      b: { "currency.metal": 50, "currency.extracta": 12, "currency.supply": 40 },
    });
    const breakdowns = {
      b: {
        flows: { strategicExtraction: { "map.glasssteel": 10 } },
        channels: {
          "currency.metal": { net: 50 },
          "currency.supply": { net: 40 },
          "currency.extracta": { net: 12 },
        },
      },
    };
    const applied = applyCurrencyUnionIncome(
      world,
      ledger,
      breakdowns,
      globals,
      content,
      1,
      fxState,
    );
    assert.equal(applied.length, 0);
    assert.equal(ledger.factions.b.stocks["currency.metal"], 50);
    assert.equal(ledger.factions.b.stocks["currency.extracta"], 12);
  });

  it("union adds metal/supply on top of own peg conversion; extracta unchanged", () => {
    const joining = faction("b", { treasuryPeg: "map.glasssteel" });
    const host = faction("a", { treasuryPeg: "map.titan" });
    const world = worldOf(joining, host);
    const union = applyCurrencyUnion(world, "b", "a", 1, content);
    assert.equal(union.ok, true);
    assert.equal(joining.treasuryPeg, "map.titan");

    const own = convertPeggedResource(joining, 100, content, {
      globalExtractionTotals: globals,
      currentTurn: 4,
    });
    const extra = unionIncomeForJoiner(
      joining,
      host,
      extraction,
      globals,
      content,
      fxState,
      { hostPeg: "map.titan", currentTurn: 4 },
    );
    assert.ok(own["currency.metal"] > 0, "own peg conversion is the baseline");
    assert.ok(extra["currency.metal"] > 0, "union bonus is additive");
    assert.equal(extra.unionShare, 0.1);

    const ledger = ledgerOf({
      b: {
        "currency.metal": 50,
        "currency.supply": 40,
        "currency.extracta": 12,
      },
    });
    const breakdowns = {
      b: {
        flows: { strategicExtraction: extraction },
        channels: {
          "currency.metal": { net: 50 },
          "currency.supply": { net: 40 },
          "currency.extracta": { net: 12 },
        },
      },
    };
    const applied = applyCurrencyUnionIncome(
      world,
      ledger,
      breakdowns,
      globals,
      content,
      4,
      fxState,
    );
    assert.equal(applied.length, 1);
    assert.equal(applied[0].metal, extra["currency.metal"]);
    assert.equal(ledger.factions.b.stocks["currency.metal"], 50 + extra["currency.metal"]);
    assert.equal(ledger.factions.b.stocks["currency.extracta"], 12);
    assert.equal(breakdowns.b.channels["currency.extracta"].net, 12);
    assert.equal(
      breakdowns.b.channels["currency.metal"].unionConverted,
      extra["currency.metal"],
    );
  });
});

describe("fx-seeded quote vs barter", () => {
  it("omitted rate freezes fx EC ratio, not 1:1", () => {
    const a = faction("a", { treasuryPeg: "map.titan" });
    const b = faction("b", { treasuryPeg: "map.glasssteel" });
    const world = worldOf(a, b);
    const deal = applyExchangeDeal(
      world,
      "a",
      "b",
      1,
      { fxState: { credits: { "map.titan": 4, "map.glasssteel": 2 } } },
      content,
    );
    assert.equal(deal.ok, true);
    assert.equal(deal.unitsQuotePerBase, 2);
    const t = findEconomicTreaty(a, "b", EXCHANGE_DEAL);
    assert.equal(t.unitsQuotePerBase, 2);
  });

  it("same-track political replace does not wipe an economic deal", () => {
    const a = faction("a", { treasuryPeg: "map.titan" });
    const b = faction("b", { treasuryPeg: "map.glasssteel" });
    const world = worldOf(a, b);
    syncTreatiesFromEdge(world, "a", "b", "alliance", 1, stances);
    applyExchangeDeal(world, "a", "b", 2, { unitsQuotePerBase: 2 }, content);
    syncTreatiesFromEdge(world, "a", "b", "war", 3, {
      ...stances,
      war: { track: "political", effects: [] },
    });
    const types = a.diplomacy.treaties.map((t) => t.type).sort();
    assert.deepEqual(types, ["currency_exchange", "war"]);
    assert.equal(findEconomicTreaty(a, "b", EXCHANGE_DEAL).unitsQuotePerBase, 2);
  });
});

describe("fx-seeded quote vs barter", () => {
  it("omitted rate freezes fx credits (not 1:1 barter)", () => {
    const a = faction("a", { treasuryPeg: "map.titan" });
    const b = faction("b", { treasuryPeg: "map.glasssteel" });
    const world = worldOf(a, b);
    const deal = applyExchangeDeal(
      world,
      "a",
      "b",
      1,
      { fxState: { credits: { "map.titan": 4, "map.glasssteel": 2 } } },
      content,
    );
    assert.equal(deal.ok, true);
    assert.equal(deal.unitsQuotePerBase, 2);
    const t = findEconomicTreaty(a, "b", EXCHANGE_DEAL);
    assert.equal(t.unitsQuotePerBase, 2);
  });

  it("explicit freeze wins over live fx credits", () => {
    const a = faction("a", { treasuryPeg: "map.titan" });
    const b = faction("b", { treasuryPeg: "map.glasssteel" });
    const world = worldOf(a, b);
    const deal = applyExchangeDeal(
      world,
      "a",
      "b",
      1,
      {
        unitsQuotePerBase: 3,
        fxState: { credits: { "map.titan": 4, "map.glasssteel": 2 } },
      },
      content,
    );
    assert.equal(deal.unitsQuotePerBase, 3);
  });
});

describe("political same-track replace", () => {
  it("war replaces alliance but keeps the economic quote", () => {
    const a = faction("a", { treasuryPeg: "map.titan" });
    const b = faction("b", { treasuryPeg: "map.glasssteel" });
    const world = worldOf(a, b);
    syncTreatiesFromEdge(world, "a", "b", "alliance", 1, stances);
    applyExchangeDeal(world, "a", "b", 2, { unitsQuotePerBase: 2 }, content);
    syncTreatiesFromEdge(world, "a", "b", "war", 3, {
      ...stances,
      war: { track: "political", effects: [] },
    });
    const types = a.diplomacy.treaties.map((t) => t.type).sort();
    assert.deepEqual(types, ["currency_exchange", "war"]);
  });
});
