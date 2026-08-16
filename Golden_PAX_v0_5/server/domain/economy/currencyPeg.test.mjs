/**
 * `convertPegExtractionToTreasury` / `pegTransitionMultiplier` /
 * `pegExchangeRate` / `gmPegMultiplier` / `convertPeggedResource` are NOT
 * a port — GMap never auto-converts peg extraction into metal/supply.
 * `mergeRateLists` is a behavior test re-derived from GMap/server/marketRates.mjs
 * (module-private there, so not a cross-repo diff).
 */
import { describe, it, expect } from "vitest";
import {
  convertPegExtractionToTreasury,
  convertPeggedResource,
  pegTransitionMultiplier,
  pegExchangeRate,
  gmPegMultiplier,
  PEG_TRANSITION_START,
  PEG_TRANSITION_TURNS,
  PEG_DOMINANCE_K,
  GM_PEG_MULT_MIN,
  GM_PEG_MULT_MAX,
  GM_PEG_MULT_DEFAULT,
} from "./currencyPeg.mjs";
import { mergeRateLists, sanitizeMarketRates, getEffectiveMarketRates } from "./marketRates.mjs";

describe("convertPegExtractionToTreasury (NOT a port)", () => {
  it("is uncapped: more extraction * rate yields more metal and supply", () => {
    const small = convertPegExtractionToTreasury(4, 3);
    const large = convertPegExtractionToTreasury(40, 3);
    expect(small["currency.metal"]).toBe(12);
    expect(small["currency.supply"]).toBe(12);
    expect(large["currency.metal"]).toBe(120);
    expect(large["currency.metal"]).toBeGreaterThan(small["currency.metal"]);
  });

  it("applies the transition multiplier and floors", () => {
    expect(convertPegExtractionToTreasury(10, 2, 0.5)).toEqual({
      "currency.metal": 10,
      "currency.supply": 10,
    });
  });

  it("yields zero when extraction or credit is zero", () => {
    expect(convertPegExtractionToTreasury(0, 5)["currency.metal"]).toBe(0);
    expect(convertPegExtractionToTreasury(9, 0)["currency.metal"]).toBe(0);
  });
});

describe("pegTransitionMultiplier (NOT a port)", () => {
  it("is full strength when the peg was never switched", () => {
    expect(pegTransitionMultiplier(null, 10)).toBe(1);
  });

  it("starts reduced on the switch turn and ramps linearly to 1", () => {
    expect(pegTransitionMultiplier(10, 10)).toBe(PEG_TRANSITION_START);
    expect(pegTransitionMultiplier(10, 10 + PEG_TRANSITION_TURNS)).toBe(1);
    const mid = pegTransitionMultiplier(10, 10 + PEG_TRANSITION_TURNS / 2);
    expect(mid).toBeCloseTo((PEG_TRANSITION_START + 1) / 2);
  });
});

describe("pegExchangeRate (NOT a port — non-linear dominance)", () => {
  const content = { economy_balance: { currencyPeg: { baseRate: 1, dominanceK: PEG_DOMINANCE_K, rarityRef: 20, rarityExp: 0.35, rateMin: 0.01, rateMax: 12 } } };

  it("gives a 90% holder a superlinearly better rate than a 10% holder of the same resource", () => {
    const totals = { "map.titan": 100 };
    const rate90 = pegExchangeRate({ id: "a", extractionByResource: { "map.titan": 90 } }, "map.titan", totals, content);
    const rate10 = pegExchangeRate({ id: "b", extractionByResource: { "map.titan": 10 } }, "map.titan", totals, content);
    expect(rate90).toBeGreaterThan(rate10);
    const linearShareRatio = 90 / 10;
    expect(rate90 / rate10).toBeGreaterThan(linearShareRatio);
    expect(PEG_DOMINANCE_K).toBeGreaterThan(1);
  });

  it("is not a flat linear map of share (90% vs 50% is not 1.8×)", () => {
    const totals = { "map.titan": 100 };
    const rate90 = pegExchangeRate({ id: "a", extractionByResource: { "map.titan": 90 } }, "map.titan", totals, content);
    const rate50 = pegExchangeRate({ id: "b", extractionByResource: { "map.titan": 50 } }, "map.titan", totals, content);
    expect(rate90 / rate50).not.toBeCloseTo(90 / 50, 5);
  });

  it("strengthens a scarce peg vs an abundant one at the same share", () => {
    const scarce = pegExchangeRate({ id: "a", extractionByResource: { "map.zro": 9 } }, "map.zro", { "map.zro": 10 }, content);
    const common = pegExchangeRate({ id: "a", extractionByResource: { "map.titan": 90 } }, "map.titan", { "map.titan": 100 }, content);
    expect(scarce).toBeGreaterThan(common);
  });

  it("returns 0 when the faction extracts none of the peg", () => {
    expect(pegExchangeRate({ id: "a", extractionByResource: {} }, "map.titan", { "map.titan": 10 }, content)).toBe(0);
  });
});

describe("gmPegMultiplier (NOT a port)", () => {
  it("defaults to 1 and clamps to [0.8, 1.5]", () => {
    expect(gmPegMultiplier(null)).toBe(GM_PEG_MULT_DEFAULT);
    expect(gmPegMultiplier(1.2)).toBe(1.2);
    expect(gmPegMultiplier(0.5)).toBe(GM_PEG_MULT_MIN);
    expect(gmPegMultiplier(3)).toBe(GM_PEG_MULT_MAX);
    expect(gmPegMultiplier("nope")).toBe(GM_PEG_MULT_DEFAULT);
  });

  it("scales pegExchangeRate inside the clamped band", () => {
    const content = {};
    const faction = { id: "a", extractionByResource: { "map.titan": 10 } };
    const totals = { "map.titan": 10 };
    const base = pegExchangeRate(faction, "map.titan", totals, content, { gmMultiplier: 1 });
    const boosted = pegExchangeRate(faction, "map.titan", totals, content, { gmMultiplier: 1.5 });
    const cut = pegExchangeRate(faction, "map.titan", totals, content, { gmMultiplier: 0.8 });
    expect(boosted / base).toBeCloseTo(1.5);
    expect(cut / base).toBeCloseTo(0.8);
    const over = pegExchangeRate(faction, "map.titan", totals, content, { gmMultiplier: 9 });
    expect(over).toBeCloseTo(boosted);
  });
});

describe("convertPeggedResource (NOT a port)", () => {
  it("is uncapped and uses the dominance rate, not a hidden ceiling", () => {
    const faction = { id: "a", treasuryPeg: "map.titan", extractionByResource: { "map.titan": 10 } };
    const small = convertPeggedResource(faction, 10, {}, { globalExtractionTotals: { "map.titan": 10 } });
    const large = convertPeggedResource(
      { ...faction, extractionByResource: { "map.titan": 100 } },
      100,
      {},
      { globalExtractionTotals: { "map.titan": 100 } },
    );
    expect(small["currency.metal"]).toBeGreaterThan(0);
    expect(large["currency.metal"]).toBeGreaterThan(small["currency.metal"]);
    expect(large["currency.supply"]).toBe(large["currency.metal"]);
  });

  it("yields nothing without a peg", () => {
    expect(convertPeggedResource({ id: "a" }, 10, {})["currency.metal"]).toBe(0);
  });
});

describe("mergeRateLists (behavior from GMap marketRates.mjs)", () => {
  it("lets an existing GM/content pair win over the computed fx row", () => {
    const base = [{ pair: "fx.a → fx.b", buy: 9, sell: 8, note: "gm" }];
    const fxRows = [
      { pair: "fx.a → fx.b", buy: 1, sell: 0.9, note: "computed" },
      { pair: "fx.b → fx.a", buy: 2, sell: 1.8 },
    ];
    const merged = mergeRateLists(base, fxRows);
    expect(merged).toEqual([
      { pair: "fx.a → fx.b", buy: 9, sell: 8, note: "gm" },
      { pair: "fx.b → fx.a", buy: 2, sell: 1.8 },
    ]);
  });

  it("sanitizeMarketRates rejects empty/invalid input the way GMap writeMarketRates does", () => {
    expect(sanitizeMarketRates("nope")).toMatchObject({ ok: false });
    expect(sanitizeMarketRates([{ pair: "a → b", buy: -1, sell: 1 }])).toMatchObject({ ok: false });
    expect(sanitizeMarketRates([{ pair: "a → b", buy: 1, sell: 0.9, note: "x" }])).toEqual({
      ok: true,
      rates: [{ pair: "a → b", buy: 1, sell: 0.9, note: "x" }],
    });
  });

  it("falls back to content placeholder_rates when no override is supplied", () => {
    const content = {
      economy_schema: { market: { placeholder_rates: [{ pair: "metal → supply", buy: 1, sell: 0.85 }] } },
    };
    const rates = getEffectiveMarketRates(content, [], [{ pair: "fx.a → fx.b", buy: 2, sell: 1.8 }]);
    expect(rates.map((r) => r.pair)).toEqual(["metal → supply", "fx.a → fx.b"]);
  });
});
