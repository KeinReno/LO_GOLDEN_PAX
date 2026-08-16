import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EXPRESS_BUY_QUOTE_STEP,
  EXPRESS_SELL_STEP,
  UNIVERSAL_CREDIT,
  WAREHOUSE_CAP_TURNS,
  fixedBuyQuoteAmount,
  fixedSellAmount,
  inferWarehouseCap,
  lotAmount,
  previewConvert,
  resolveQuoteCurrency,
  validateExpressTrade,
} from "./stockpileExpressTrade.ts";

const RATES = [
  { pair: "currency.metal → currency.supply", buy: 1, sell: 0.85 },
  { pair: "currency.materia → currency.metal", buy: 1, sell: 0.95 },
  { pair: "currency.extracta → currency.materia", buy: 2, sell: 1.6 },
  { pair: "currency.cognitio → currency.metal", buy: 3.5, sell: 2.8 },
  { pair: "map.blumatid → fx.universal_credit", buy: 4, sell: 3.2 },
];

describe("previewConvert", () => {
  it("uses sell on forward pair", () => {
    assert.equal(
      previewConvert(RATES, "currency.cognitio", "currency.metal", 10),
      28,
    );
  });

  it("uses buy on inverse pair", () => {
    assert.equal(
      previewConvert(RATES, "currency.metal", "currency.cognitio", 7),
      2,
    );
  });
});

describe("resolveQuoteCurrency", () => {
  it("prefers metal when a metal pair exists", () => {
    assert.equal(
      resolveQuoteCurrency(RATES, "currency.cognitio"),
      "currency.metal",
    );
  });

  it("falls back to the chained partner when metal is missing", () => {
    assert.equal(
      resolveQuoteCurrency(RATES, "currency.extracta"),
      "currency.materia",
    );
  });

  it("uses universal credit for strategic map resources", () => {
    assert.equal(resolveQuoteCurrency(RATES, "map.blumatid"), UNIVERSAL_CREDIT);
  });
});

describe("lotAmount", () => {
  it("returns 25% and 50% lots with a 1-unit floor", () => {
    assert.equal(lotAmount(40, 0.25), 10);
    assert.equal(lotAmount(40, 0.5), 20);
    assert.equal(lotAmount(3, 0.25), 1);
    assert.equal(lotAmount(0, 0.5), 0);
  });

  it("caps the fixed sell/buy steps", () => {
    assert.equal(fixedSellAmount(40), EXPRESS_SELL_STEP);
    assert.equal(fixedSellAmount(4), 4);
    assert.equal(fixedBuyQuoteAmount(40), EXPRESS_BUY_QUOTE_STEP);
    assert.equal(fixedBuyQuoteAmount(2), 2);
  });
});

describe("inferWarehouseCap", () => {
  it("scales category pipe capacity by warehouse turns", () => {
    const cap = inferWarehouseCap(
      {
        bottlenecks: {},
        flows: {
          A: {
            "1": { rate: 2, demand: 1, capacity: 4, net: 1 },
            "2": { rate: 0, demand: 0, capacity: 6, net: 0 },
          },
        },
      },
      "A",
    );
    assert.equal(cap, 10 * WAREHOUSE_CAP_TURNS);
  });

  it("returns null without flow capacity", () => {
    assert.equal(inferWarehouseCap(null, "A"), null);
    assert.equal(inferWarehouseCap({ bottlenecks: {}, flows: {} }, "B"), null);
  });
});

describe("validateExpressTrade", () => {
  const base = {
    rates: RATES,
    stocks: {
      "currency.cognitio": 20,
      "currency.metal": 50,
      "fx.universal_credit": 8,
      "map.blumatid": 12,
    },
    available: 20,
    reservedAp: 0,
    apMax: 9,
    convertAp: 0,
    stockCap: null as number | null,
  };

  it("allows an in-place sell when stock and rate exist", () => {
    const r = validateExpressTrade({
      ...base,
      side: "sell",
      resourceId: "currency.cognitio",
      amountFrom: 10,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.fromCurrency, "currency.cognitio");
      assert.equal(r.toCurrency, "currency.metal");
      assert.equal(r.amountTo, 28);
    }
  });

  it("blocks on AP", () => {
    const r = validateExpressTrade({
      ...base,
      side: "sell",
      resourceId: "currency.cognitio",
      amountFrom: 10,
      convertAp: 2,
      reservedAp: 8,
      apMax: 9,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "Не хватает ОД");
  });

  it("blocks buy when treasury is short", () => {
    const r = validateExpressTrade({
      ...base,
      side: "buy",
      resourceId: "currency.cognitio",
      amountFrom: 80,
      stocks: { ...base.stocks, "currency.metal": 5 },
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "Недостаточно УЕ");
  });

  it("blocks buy when warehouse has no headroom", () => {
    const r = validateExpressTrade({
      ...base,
      side: "buy",
      resourceId: "currency.cognitio",
      amountFrom: 7,
      stockCap: 20,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "Склад переполнен");
  });

  it("blocks sell when available stock is too low", () => {
    const r = validateExpressTrade({
      ...base,
      side: "sell",
      resourceId: "currency.cognitio",
      amountFrom: 10,
      available: 4,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "Недостаточно запаса");
  });

  it("blocks when no market rate exists", () => {
    const r = validateExpressTrade({
      ...base,
      side: "sell",
      resourceId: "currency.industria",
      amountFrom: 5,
      available: 5,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "Нет рыночного курса");
  });

  it("spends UC when buying a strategic resource", () => {
    const r = validateExpressTrade({
      ...base,
      side: "buy",
      resourceId: "map.blumatid",
      amountFrom: 4,
      stocks: { ...base.stocks, [UNIVERSAL_CREDIT]: 4 },
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.fromCurrency, UNIVERSAL_CREDIT);
      assert.equal(r.toCurrency, "map.blumatid");
      assert.equal(r.amountTo, 1);
    }
  });
});
