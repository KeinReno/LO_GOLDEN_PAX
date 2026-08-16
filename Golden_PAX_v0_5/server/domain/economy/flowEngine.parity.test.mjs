import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  rpsEdges as newRpsEdges,
  categoryToCurrency as newCategoryToCurrency,
  currencyToCategory as newCurrencyToCategory,
  emptyFlows as newEmptyFlows,
  sumRateAtLeast as newSumRateAtLeast,
  applyFlowConvert as newApplyFlowConvert,
  computeNets as newComputeNets,
  categoryTotals as newCategoryTotals,
  bottlenecks as newBottlenecks,
  CATEGORIES,
} from "./flowEngine.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const oldModulePath = path.resolve(__dirname, "../../../../GMap/server/flowEngine.mjs");
const oldContentLoaderPath = path.resolve(__dirname, "../../../../GMap/server/contentLoader.mjs");

describe("flowEngine core mechanics parity with GMap (real content)", () => {
  it("rpsEdges / categoryToCurrency / currencyToCategory match", async () => {
    const old = await import(oldModulePath);
    const { getContent } = await import(oldContentLoaderPath);
    const content = getContent(["core"]);

    expect(newRpsEdges(content)).toEqual(old.rpsEdges(content));
    for (const cat of CATEGORIES) {
      expect(newCategoryToCurrency(cat)).toBe(old.categoryToCurrency(cat));
    }
    for (const cur of ["currency.extracta", "currency.materia", "currency.metal", "currency.supply", "currency.unknown"]) {
      expect(newCurrencyToCategory(cur, content)).toBe(old.currencyToCategory(cur, content));
    }
  });

  it("emptyFlows matches shape", async () => {
    const old = await import(oldModulePath);
    expect(newEmptyFlows()).toEqual(old.emptyFlows());
  });

  it("sumRateAtLeast matches across populated flow grids", async () => {
    const old = await import(oldModulePath);
    const mine = newEmptyFlows();
    const theirs = old.emptyFlows();
    for (const cell of [mine, theirs]) {
      cell.A[1].rate = 5;
      cell.A[3].rate = 2;
      cell.A[3].capacity = 1;
    }
    expect(newSumRateAtLeast(mine, "A", 1)).toBe(old.sumRateAtLeast(theirs, "A", 1));
    expect(newSumRateAtLeast(mine, "A", 2)).toBe(old.sumRateAtLeast(theirs, "A", 2));
  });

  it("applyFlowConvert matches across a range of scenarios (bottleneck, secondary input, B->C bios scale)", async () => {
    const old = await import(oldModulePath);

    const scenarios = [
      { args: { from: { category: "A", tier: ">=1" }, to: { category: "B", tier: ">=1" } }, opts: { buildingTier: 3 }, seed: { A: { 1: 10 } } },
      { args: { from: { category: "A", tier: ">=1" }, to: { category: "B", tier: ">=1" }, amount: 2 }, opts: { buildingTier: 3 }, seed: { A: { 1: 10 } } },
      {
        args: { from: { category: "B", tier: ">=1" }, to: { category: "C", tier: ">=1" }, secondary: { category: "E", tier: ">=1" } },
        opts: { buildingTier: 3, biosScale: 0.5 },
        seed: { B: { 1: 8 }, E: { 1: 3 } },
      },
      { args: { from: { category: "A", tier: ">=1" }, to: { category: "B", tier: ">=1" } }, opts: { buildingTier: 3 }, seed: {} }, // no input at all
    ];

    for (const { args, opts, seed } of scenarios) {
      const mine = newEmptyFlows();
      const theirs = old.emptyFlows();
      for (const [cat, tiers] of Object.entries(seed)) {
        for (const [tier, rate] of Object.entries(tiers)) {
          mine[cat][tier].rate = rate;
          theirs[cat][tier].rate = rate;
        }
      }
      const producedMine = newApplyFlowConvert(mine, args, opts);
      const producedTheirs = old.applyFlowConvert(theirs, args, opts);
      expect(producedMine).toBe(producedTheirs);
      expect(newComputeNets(mine)).toEqual(old.computeNets(theirs));
    }
  });

  it("computeNets / categoryTotals / bottlenecks match on a grid with demand exceeding capped rate", async () => {
    const old = await import(oldModulePath);
    const mine = newEmptyFlows();
    const theirs = old.emptyFlows();
    for (const cell of [mine, theirs]) {
      cell.D[2].rate = 5;
      cell.D[2].capacity = 3;
      cell.D[2].demand = 4;
      cell.E[1].rate = 10;
      cell.E[1].demand = 2;
    }
    expect(newComputeNets(mine)).toEqual(old.computeNets(theirs));
    expect(newCategoryTotals(newComputeNets(mine))).toEqual(old.categoryTotals(old.computeNets(theirs)));
    expect(newBottlenecks(newComputeNets(mine))).toEqual(old.bottlenecks(old.computeNets(theirs)));
  });
});
