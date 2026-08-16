import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { stockCostsFromEffects as newFn, canAffordQuestCosts } from "./questCosts.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const oldModulePath = path.resolve(__dirname, "../../../../GMap/server/questEngine.mjs");

describe("stockCostsFromEffects parity with GMap", () => {
  it("sums negative upkeep_flat/production_flat amounts by resource", async () => {
    const { stockCostsFromEffects: oldFn } = await import(oldModulePath);

    const effects = [
      { effect: "upkeep_flat", args: { resource: "currency.supply", amount: -20 } },
      { effect: "production_flat", args: { resource: "currency.supply", amount: -5 } },
      { effect: "production_flat", args: { resource: "currency.metal", amount: 30 } },
      { effect: "loyalty_add", args: { amount: 5 } },
    ];

    expect(newFn(effects)).toEqual(oldFn(effects));
    expect(newFn([])).toEqual(oldFn([]));
    expect(newFn(undefined)).toEqual(oldFn(undefined));
  });
});

describe("canAffordQuestCosts (this port's own copy — GMap's is module-private + ledger-coupled)", () => {
  it("ok when stocks cover every required cost", () => {
    expect(canAffordQuestCosts({ "currency.supply": 50 }, [{ effect: "upkeep_flat", args: { resource: "currency.supply", amount: -20 } }])).toEqual({ ok: true });
  });

  it("fails naming the short currency", () => {
    const result = canAffordQuestCosts({ "currency.supply": 5 }, [{ effect: "upkeep_flat", args: { resource: "currency.supply", amount: -20 } }]);
    expect(result.ok).toBe(false);
  });
});
