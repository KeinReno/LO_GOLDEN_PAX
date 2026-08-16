import { describe, it, expect } from "vitest";
import { computeFactionFlowIncome } from "./flowIncome.mjs";

const content = {
  economy_schema: {
    categories: {
      A: { currencyId: "currency.extracta" },
      B: { currencyId: "currency.materia" },
      D: { currencyId: "currency.energia" },
      E: { currencyId: "currency.bios" },
    },
    rps_edges: [{ edge: "A->B", from: "A", to: "B" }],
  },
  map_resources: {
    "map.iron": { id: "map.iron", category: "A", tier: 1, yield: { "currency.metal": 2 } },
  },
  space_objects: {
    objects: {
      asteroid: {
        id: "asteroid",
        depletes: true,
        startingRemaining: 240,
        effects: [
          { effect: "rate_mod", args: { category: "A", tier: 2, amount: 1 } },
          { effect: "rate_mod", args: { category: "A", tier: 3, amount: 1 } },
          { effect: "rate_mod", args: { category: "A", tier: 4, amount: 1 } },
        ],
      },
    },
  },
  buildings: {
    "b.mine": { id: "b.mine", category: "A", tier: 1, laborSlots: 3, effects: [{ effect: "yield_flat", args: { currency: "currency.extracta", amount: 2 } }] },
    // A->B converter with NO explicit secondary — inferSecondary("A","B",tier) supplies one from
    // category D, which only the Pass-1 ambient bonus provides. This is exactly the shape that
    // caught the real ordering bug: a converter starves if ambient D isn't in the grid yet.
    "b.smelter": { id: "b.smelter", category: "B", tier: 1, laborSlots: 3, effects: [{ effect: "flow_convert", args: { from: { category: "A", tier: ">=1" }, to: { category: "B", tier: ">=1" } } }] },
  },
};

function planetWith(buildingIds, opts = {}) {
  return {
    id: "p1",
    ownerFactionId: opts.ownerFactionId ?? "fA",
    population: opts.population ?? 20,
    colonyType: "colony",
    resources: opts.resources ?? ["map.iron"],
    surfaceBuildings: buildingIds.map((buildingId, i) => ({ id: `i${i}`, buildingId })),
    orbitalBuildings: [],
  };
}

describe("computeFactionFlowIncome", () => {
  it("a converter with an ambient-only secondary input (category D) actually converts — the ambient bonus must land before Pass 2 runs", () => {
    const systems = [{ ownerFactionId: "fA", planets: [planetWith(["b.mine", "b.smelter"])] }];
    const result = computeFactionFlowIncome(systems, "fA", content);

    // If this were 0, the ambient D[1] bonus (added in Pass 1) wasn't visible to the
    // smelter's flow_convert (Pass 2) — the exact bug found via live verification.
    expect(result.income["currency.materia"]).toBeGreaterThan(0);
  });

  it("with no converter present, extraction+yield_flat both land as plain category income", () => {
    const systems = [{ ownerFactionId: "fA", planets: [planetWith(["b.mine"])] }];
    const result = computeFactionFlowIncome(systems, "fA", content);
    // deposit (2, category A default fallback since yield names currency.metal not extracta -> summed) + building yield_flat (2) = 4
    expect(result.income["currency.extracta"]).toBe(4);
  });

  it("ignores other factions' planets", () => {
    const systems = [{ ownerFactionId: "fB", planets: [planetWith(["b.mine"], { ownerFactionId: "fB" })] }];
    const result = computeFactionFlowIncome(systems, "fA", content);
    expect(result.income["currency.extracta"]).toBe(0);
  });

  it("an owned system's asteroid rate_mod reaches faction extracta income; an unowned asteroid does not", () => {
    const emptyPlanet = planetWith([], { resources: [], population: 0, colonyType: "none", ownerFactionId: null });
    const owned = computeFactionFlowIncome(
      [{ ownerFactionId: "fA", spaceObjects: [{ typeId: "asteroid", remainingAmount: 240 }], planets: [{ ...emptyPlanet, ownerFactionId: "fA" }] }],
      "fA",
      content,
    );
    expect(owned.income["currency.extracta"]).toBe(3);

    const unowned = computeFactionFlowIncome(
      [{ ownerFactionId: null, spaceObjects: [{ typeId: "asteroid", remainingAmount: 240 }], planets: [emptyPlanet] }],
      "fA",
      content,
    );
    expect(unowned.income["currency.extracta"]).toBe(0);
  });
});

/**
 * Regression test for a real, live-verified bug (2026-08-14, see
 * notes/2026-08-14-ambient-flow-economy-grill.md): a textbook-correct,
 * fully-staffed 4-building bootstrap chain (mine A -> smelter A->B ->
 * factory B->C -> lab E->F) produced ZERO cognitio, because `factory`
 * (E as secondary/catalyst) and `lab` (E as primary) both drew on the
 * same scarce ambient E, and whichever ran first in building order won
 * the whole pool. Caught only by live HTTP verification with the real
 * content, not by any unit test that existed before this one.
 */
const contestedChainContent = {
  economy_schema: {
    categories: {
      A: { currencyId: "currency.extracta" },
      B: { currencyId: "currency.materia" },
      C: { currencyId: "currency.industria" },
      D: { currencyId: "currency.energia" },
      E: { currencyId: "currency.bios" },
      F: { currencyId: "currency.cognitio" },
    },
    rps_edges: [
      { edge: "A->B", from: "A", to: "B" },
      { edge: "B->C", from: "B", to: "C" },
      { edge: "E->F", from: "E", to: "F" },
    ],
  },
  map_resources: {},
  buildings: {
    "b.mine": { id: "b.mine", category: "A", tier: 3, laborSlots: 3, effects: [{ effect: "yield_flat", args: { currency: "currency.extracta", amount: 2 } }] },
    "b.smelter": { id: "b.smelter", category: "B", tier: 3, laborSlots: 3, effects: [{ effect: "flow_convert", args: { from: { category: "A", tier: ">=1" }, to: { category: "B", tier: ">=1" } } }] },
    "b.factory": { id: "b.factory", category: "C", tier: 3, laborSlots: 3, effects: [{ effect: "flow_convert", args: { from: { category: "B", tier: ">=1" }, to: { category: "C", tier: ">=1" } } }] },
    "b.lab": { id: "b.lab", category: "F", tier: 3, laborSlots: 3, effects: [{ effect: "flow_convert", args: { from: { category: "E", tier: ">=1" }, to: { category: "F", tier: ">=1" } } }] },
  },
};

function contestedPlanet(population) {
  return {
    id: "p1",
    ownerFactionId: "fA",
    population,
    colonyType: "colony",
    resources: [],
    surfaceBuildings: ["b.mine", "b.smelter", "b.factory", "b.lab"].map((buildingId, i) => ({ id: `i${i}`, buildingId })),
    orbitalBuildings: [],
  };
}

describe("computeFactionFlowIncome — contested-secondary regression (E: lab primary vs factory secondary)", () => {
  it("a fully-staffed mine->smelter->factory->lab chain produces real cognitio, not zero", () => {
    const systems = [{ ownerFactionId: "fA", planets: [contestedPlanet(12)] }];
    const result = computeFactionFlowIncome(systems, "fA", contestedChainContent);
    expect(result.income["currency.cognitio"]).toBeGreaterThan(0);
  });

  it("lab's PRIMARY claim on E is not starved by factory's SECONDARY claim, regardless of which of the two is placed first (upstream mine->smelter order unchanged — this isolates the E contest, not general chain ordering)", () => {
    const labAfterFactory = computeFactionFlowIncome([{ ownerFactionId: "fA", planets: [contestedPlanet(12)] }], "fA", contestedChainContent);
    const labBeforeFactory = {
      ...contestedPlanet(12),
      surfaceBuildings: [
        { id: "i0", buildingId: "b.mine" },
        { id: "i1", buildingId: "b.smelter" },
        { id: "i2", buildingId: "b.lab" },
        { id: "i3", buildingId: "b.factory" },
      ],
    };
    const factoryAfterLab = computeFactionFlowIncome([{ ownerFactionId: "fA", planets: [labBeforeFactory] }], "fA", contestedChainContent);
    expect(labAfterFactory.income["currency.cognitio"]).toBe(factoryAfterLab.income["currency.cognitio"]);
    expect(labAfterFactory.income["currency.cognitio"]).toBeGreaterThan(0);
  });
});

/**
 * Phase 1 of the modifier-stack integration (2026-08-14, see
 * notes/2026-08-14-tech-tree-audit.md): a researched tech's production/
 * upkeep effects now reach the final category income — this was a
 * complete no-op before today for all 387 "catalog" techs in the real
 * content (their effect types were never consumed by anything).
 */
describe("computeFactionFlowIncome — tech modifier pass (Phase 1)", () => {
  it("a researched production_mult tech raises the category's income over an untouched faction", () => {
    const techContent = {
      ...content,
      technologies: {
        "tech.boost": {
          id: "tech.boost",
          name: "Boost",
          prerequisites: [],
          effects: [{ effect: "production_mult", args: { resource: "currency.extracta", mult: 1.5 } }],
        },
      },
    };
    const systems = [{ ownerFactionId: "fA", planets: [planetWith(["b.mine"])] }];
    const noTech = computeFactionFlowIncome(systems, "fA", techContent);
    const withTech = computeFactionFlowIncome(systems, "fA", techContent, { unlockedTechs: ["tech.boost"], techGrades: {} });
    expect(withTech.income["currency.extracta"]).toBeGreaterThan(noTech.income["currency.extracta"]);
  });

  it("an unresearched tech's effects don't apply, and omitting techAccount entirely behaves like no tech researched", () => {
    const techContent = {
      ...content,
      technologies: {
        "tech.boost": {
          id: "tech.boost",
          name: "Boost",
          prerequisites: [],
          effects: [{ effect: "production_mult", args: { resource: "currency.extracta", mult: 1.5 } }],
        },
      },
    };
    const systems = [{ ownerFactionId: "fA", planets: [planetWith(["b.mine"])] }];
    const omitted = computeFactionFlowIncome(systems, "fA", techContent);
    const explicitEmpty = computeFactionFlowIncome(systems, "fA", techContent, { unlockedTechs: [], techGrades: {} });
    expect(omitted.income).toEqual(explicitEmpty.income);
  });

  it("a socketed extractor tech swaps mine upkeep demand from D (energia) to E (bios)", () => {
    const socketContent = {
      ...content,
      buildings: {
        ...content.buildings,
        "b.mine": {
          ...content.buildings["b.mine"],
          kind: "mine",
          upkeep_slots: [{ require: { category: "D", tier: ">=1" }, count: 4, per: "turn" }],
        },
      },
      technologies: {
        "tech.sock": {
          id: "tech.sock",
          socket: {
            "map.biofuel": {
              swapUpkeepCurrency: { match: { category: "A" }, fromCategory: "D", toCategory: "E" },
            },
          },
        },
      },
    };
    const systems = [{ ownerFactionId: "fA", planets: [planetWith(["b.mine"], { population: 0 })] }];
    const before = computeFactionFlowIncome(systems, "fA", socketContent, { unlockedTechs: ["tech.sock"] });
    const after = computeFactionFlowIncome(systems, "fA", socketContent, {
      unlockedTechs: ["tech.sock"],
      techSockets: { "tech.sock": "map.biofuel" },
    });
    expect(before.flows.D[1].demand).toBeGreaterThanOrEqual(4);
    expect(after.flows.D[1].demand).toBeLessThan(before.flows.D[1].demand);
    expect(after.flows.E[1].demand).toBeGreaterThan(before.flows.E[1].demand);
  });
});

describe("computeFactionFlowIncome Pass 5 (currency peg, NOT a port)", () => {
  const pegContent = {
    ...content,
    economy_schema: {
      ...content.economy_schema,
      resource_ranks: { strategic: ["map.iron"] },
    },
    map_resources: {
      "map.iron": { ...content.map_resources["map.iron"], rank: "strategic" },
    },
  };

  it("omitting pegContext leaves category income unchanged (no metal from peg)", () => {
    const systems = [{ ownerFactionId: "fA", planets: [planetWith(["b.mine"])] }];
    const result = computeFactionFlowIncome(systems, "fA", pegContent);
    expect(result.income["currency.extracta"]).toBe(4);
    expect(result.income["currency.metal"] ?? 0).toBe(0);
    expect(result.income["map.iron"] ?? 0).toBe(0);
  });

  it("credits raw map.* and uncapped peg metal without changing extracta", () => {
    const systems = [{ ownerFactionId: "fA", planets: [planetWith(["b.mine"])] }];
    const without = computeFactionFlowIncome(systems, "fA", pegContent);
    const withPeg = computeFactionFlowIncome(systems, "fA", pegContent, undefined, undefined, {
      faction: { id: "fA", pegResourceId: "map.iron" },
      extractionByResource: { "map.iron": 10 },
      globalExtractionTotals: { "map.iron": 10 },
      currentTurn: 1,
    });
    expect(withPeg.income["currency.extracta"]).toBe(without.income["currency.extracta"]);
    expect(withPeg.income["map.iron"]).toBe(10);
    expect(withPeg.income["currency.metal"]).toBeGreaterThan(0);
    expect(withPeg.income["currency.supply"]).toBe(withPeg.income["currency.metal"]);
  });
});

describe("computeFactionFlowIncome — logistics per-system scale (GMap application point)", () => {
  it("a disconnected system's production is halved vs an untagged (no-logistics) system", () => {
    const baseline = computeFactionFlowIncome(
      [{ ownerFactionId: "fA", planets: [planetWith(["b.mine"])] }],
      "fA",
      content,
    );
    const cut = computeFactionFlowIncome(
      [{
        ownerFactionId: "fA",
        logistics: { connectedToCapital: false, supplyLevel: 0 },
        planets: [planetWith(["b.mine"])],
      }],
      "fA",
      content,
    );
    expect(baseline.income["currency.extracta"]).toBe(4);
    expect(cut.income["currency.extracta"]).toBe(2);
  });
});
