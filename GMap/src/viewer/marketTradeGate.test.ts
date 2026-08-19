import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  UC_ID,
  buildStockpileStrip,
  isPhysicalGood,
  marketWarehouseCap,
  physicalStockUsed,
  resolveMarketQuoteCurrency,
  validateMarketTrade,
} from "./marketTradeGate.ts";

const METAL = "currency.metal";
const SUPPLY = "currency.supply";
const cap = marketWarehouseCap();

describe("isPhysicalGood", () => {
  it("treats metal/supply/A–F as warehouse goods", () => {
    assert.equal(isPhysicalGood(METAL), true);
    assert.equal(isPhysicalGood(SUPPLY), true);
    assert.equal(isPhysicalGood("currency.extracta"), true);
    assert.equal(isPhysicalGood("map.blumatid"), true);
  });

  it("excludes FX / UC from warehouse", () => {
    assert.equal(isPhysicalGood(UC_ID), false);
    assert.equal(isPhysicalGood("fx.damyl_doubloon"), false);
  });
});

describe("buildStockpileStrip", () => {
  it("summarizes UC, key stocks, and warehouse used/cap", () => {
    const strip = buildStockpileStrip({
      [UC_ID]: 42,
      [METAL]: 100,
      [SUPPLY]: 70,
      "currency.extracta": 14,
    });
    assert.equal(strip.uc, 42);
    assert.equal(strip.items[0]?.amount, 100);
    assert.equal(strip.used, 184);
    assert.equal(strip.cap, cap);
    assert.equal(strip.remaining, cap - 184);
    assert.equal(strip.full, false);
  });
});

describe("resolveMarketQuoteCurrency", () => {
  it("prefers УЕ when a rate exists", () => {
    const quote = resolveMarketQuoteCurrency(
      [{ pair: "currency.extracta → fx.universal_credit", sell: 2, buy: 2 }],
      "currency.extracta",
    );
    assert.equal(quote, UC_ID);
  });

  it("falls back to metal when УЕ has no row", () => {
    const quote = resolveMarketQuoteCurrency(
      [{ pair: "currency.extracta → currency.metal", sell: 1, buy: 1 }],
      "currency.extracta",
    );
    assert.equal(quote, METAL);
  });
});

describe("validateMarketTrade", () => {
  const base = {
    reservedAp: 0,
    apMax: 9,
    apCost: 1,
    stocks: {
      [UC_ID]: 10,
      [METAL]: 80,
      [SUPPLY]: 40,
    },
    warehouseCap: cap,
  };

  it("fails AP first", () => {
    const r = validateMarketTrade({
      ...base,
      reservedAp: 9,
      payCurrency: SUPPLY,
      payAmount: 5,
      receiveCurrency: METAL,
      receiveAmount: 5,
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.reason, "ap");
      assert.equal(r.message, "Не хватает ОД (нужно 1)");
    }
  });

  it("does not hard-block on a fake warehouse basket", () => {
    const used = physicalStockUsed(base.stocks);
    const r = validateMarketTrade({
      ...base,
      warehouseCap: used + 4,
      receiveStockCap: 1,
      payCurrency: SUPPLY,
      payAmount: 5,
      receiveCurrency: METAL,
      receiveAmount: 5,
    });
    assert.equal(r.ok, true);
  });

  it("fails when the quote row is missing", () => {
    const r = validateMarketTrade({
      ...base,
      quoteOk: false,
      payCurrency: SUPPLY,
      payAmount: 5,
      receiveCurrency: METAL,
      receiveAmount: 5,
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.reason, "rate");
      assert.equal(r.message, "Нет курса");
    }
  });

  it("does not apply warehouse to incoming UC", () => {
    const used = physicalStockUsed(base.stocks);
    const r = validateMarketTrade({
      ...base,
      warehouseCap: used,
      payCurrency: METAL,
      payAmount: 5,
      receiveCurrency: UC_ID,
      receiveAmount: 50,
    });
    assert.equal(r.ok, true);
  });

  it("fails funds with УЕ label for universal credit", () => {
    const r = validateMarketTrade({
      ...base,
      payCurrency: UC_ID,
      payAmount: 99,
      receiveCurrency: METAL,
      receiveAmount: 5,
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.reason, "funds");
      assert.equal(r.message, "Недостаточно УЕ");
    }
  });

  it("fails funds with resource label otherwise", () => {
    const r = validateMarketTrade({
      ...base,
      payCurrency: SUPPLY,
      payAmount: 99,
      receiveCurrency: METAL,
      receiveAmount: 5,
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.reason, "funds");
      assert.match(r.message, /Недостаточно/);
    }
  });

  it("passes when AP and funds are ok", () => {
    const r = validateMarketTrade({
      ...base,
      payCurrency: SUPPLY,
      payAmount: 5,
      receiveCurrency: METAL,
      receiveAmount: 5,
    });
    assert.equal(r.ok, true);
  });
});
