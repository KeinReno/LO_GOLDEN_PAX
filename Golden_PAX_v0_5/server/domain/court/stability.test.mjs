/**
 * New-design tests (NOT a port — GMap never consumed stability).
 */
import { describe, it, expect } from "vitest";
import {
  computeStabilityDelta,
  tickStability,
  stabilityBand,
  revoltProductionEffects,
  stabilityCfg,
} from "./stability.mjs";
import { computeFactionFlowIncome } from "../planets/flowIncome.mjs";

const content = {
  economy_balance: {
    stability: {
      startingValue: 50,
      min: 0,
      max: 100,
      naturalDecay: -1,
      stage1Threshold: 40,
      stage2Threshold: 25,
      stage3DurationTurns: 3,
      stage1ProductionMult: 0.85,
      stage2ProductionMult: 0.75,
      rebelPopShare: 0.2,
    },
  },
  economy_schema: {
    categories: {
      A: { currencyId: "currency.extracta" },
      D: { currencyId: "currency.energia" },
      E: { currencyId: "currency.bios" },
    },
    rps_edges: [],
  },
  map_resources: {
    "map.iron": { id: "map.iron", category: "A", tier: 1, yield: { "currency.extracta": 4 } },
  },
  buildings: {
    "b.mine": {
      id: "b.mine",
      category: "A",
      tier: 1,
      laborSlots: 8,
      effects: [{ effect: "yield_flat", args: { currency: "currency.extracta", amount: 20 } }],
    },
  },
};

const systems = [
  {
    ownerFactionId: "fA",
    planets: [
      {
        id: "p1",
        ownerFactionId: "fA",
        population: 40,
        colonyType: "colony",
        resources: ["map.iron"],
        surfaceBuildings: [{ id: "i0", buildingId: "b.mine" }],
        orbitalBuildings: [],
      },
    ],
  },
];

describe("stability accumulator", () => {
  it("applies the stability channel's flat total plus natural decay", () => {
    const delta = computeStabilityDelta({}, [{ effect: "stability_add", args: { amount: 3 } }], content);
    expect(delta).toBe(2); // -1 decay + 3
  });

  it("clamps to [min, max] and starts from the faction's current value", () => {
    const up = tickStability({ stability: 99 }, 1, [{ effect: "stability_add", args: { amount: 8 } }], content);
    expect(up.value).toBe(100);
    const down = tickStability({ stability: 1 }, 1, [], content);
    expect(down.value).toBe(0);
    expect(down.delta).toBe(-1);
  });

  it("stage thresholds are distinct and ordered (2 < 1 < 0)", () => {
    const cfg = stabilityCfg(content);
    expect(cfg.stage2Threshold).toBeLessThan(cfg.stage1Threshold);
    expect(stabilityBand(40, content)).toBe(0);
    expect(stabilityBand(39.9, content)).toBe(1);
    expect(stabilityBand(25, content)).toBe(1);
    expect(stabilityBand(24.9, content)).toBe(2);
    expect(stabilityBand(0, content)).toBe(2);
  });
});

describe("stage 1 production debuff", () => {
  it("changes flow income vs the same world with no revolt effect", () => {
    const baseline = computeFactionFlowIncome(systems, "fA", content);
    const stage1 = computeFactionFlowIncome(
      systems,
      "fA",
      content,
      undefined,
      revoltProductionEffects(30, content),
    );
    const extractaBefore = baseline.income["currency.extracta"];
    const extractaAfter = stage1.income["currency.extracta"];
    expect(extractaBefore).toBeGreaterThan(0);
    expect(extractaAfter).toBeLessThan(extractaBefore);
    expect(extractaAfter).toBe(Math.floor(extractaBefore * 0.85));
  });

  it("stage 2 uses a worse multiplier than stage 1, not the same band", () => {
    const s1 = computeFactionFlowIncome(systems, "fA", content, undefined, revoltProductionEffects(30, content));
    const s2 = computeFactionFlowIncome(systems, "fA", content, undefined, revoltProductionEffects(10, content));
    expect(s2.income["currency.extracta"]).toBeLessThan(s1.income["currency.extracta"]);
    expect(revoltProductionEffects(50, content)).toEqual([]);
  });
});
