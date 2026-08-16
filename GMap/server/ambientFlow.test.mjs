/**
 * Ambient D/E fairness + primary-before-secondary convert (v0.5).
 * Run: node --test server/ambientFlow.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AMBIENT_BIOS_PER_POP,
  AMBIENT_ENERGIA_PER_POP,
  applyAmbientDE,
  applyFlowConvertPrimary,
  reconcileSecondaryDemand,
} from "./ambientFlow.mjs";
import { addBuildingFlows, emptyFlows } from "./flowEngine.mjs";
import { computeFlowBreakdown } from "./economyTick.mjs";
import { getContent } from "./contentLoader.mjs";

function runConvert(flows, args, opts = {}) {
  const pending = opts.pendingSecondary || [];
  const used = opts.primaryCategoriesUsed || new Set();
  const fromC = args.from?.category;
  if (fromC) used.add(fromC);
  const result = applyFlowConvertPrimary(flows, args, opts);
  if (result?.produced > 0 && result.secondary?.category) {
    pending.push({
      toCat: result.toCat,
      toTier: result.toTier,
      secondary: result.secondary,
      amount: result.produced,
    });
  }
  return result;
}

describe("applyAmbientDE formula", () => {
  it("D[1] += max(1, ceil(pop*0.6)); E[1] += max(1, ceil(pop*0.5))", () => {
    assert.equal(AMBIENT_ENERGIA_PER_POP, 0.6);
    assert.equal(AMBIENT_BIOS_PER_POP, 0.5);
    const flows = emptyFlows();
    applyAmbientDE(flows, 12);
    assert.equal(flows.D[1].rate, 8);
    assert.equal(flows.E[1].rate, 6);
  });

  it("pop <= 0 adds nothing (no people from air)", () => {
    const flows = emptyFlows();
    applyAmbientDE(flows, 0);
    applyAmbientDE(flows, -3);
    assert.equal(flows.D[1].rate, 0);
    assert.equal(flows.E[1].rate, 0);
  });

  it("pop 1 still floors at 1 each", () => {
    const flows = emptyFlows();
    applyAmbientDE(flows, 1);
    assert.equal(flows.D[1].rate, 1);
    assert.equal(flows.E[1].rate, 1);
  });

  it("same total pop yields the same D/E regardless of planet count", () => {
    const one = emptyFlows();
    const four = emptyFlows();
    applyAmbientDE(one, 12);
    applyAmbientDE(four, 3 + 3 + 3 + 3);
    assert.equal(one.D[1].rate, four.D[1].rate);
    assert.equal(one.E[1].rate, four.E[1].rate);
    assert.ok(one.D[1].rate > 2);
    assert.ok(one.E[1].rate > 1);
  });
});

describe("primary-before-secondary convert", () => {
  // Isolated E contest: lab has no C catalyst so this is only the grill bug
  // (factory draining ambient E before the lab).
  const lab = {
    from: { category: "E", tier: ">=1" },
    to: { category: "F", tier: ">=1" },
    amount: 1,
  };
  const factory = {
    from: { category: "B", tier: ">=1" },
    to: { category: "C", tier: ">=1" },
    secondary: { category: "E", tier: ">=1" },
    amount: 1,
  };

  it("lab's E-as-primary wins over factory's E-as-secondary when E is scarce", () => {
    const flows = emptyFlows();
    flows.E[1].rate = 1;
    flows.B[1].rate = 1;
    const pending = [];
    const used = new Set();
    runConvert(flows, factory, { pendingSecondary: pending, primaryCategoriesUsed: used });
    runConvert(flows, lab, { pendingSecondary: pending, primaryCategoriesUsed: used });
    reconcileSecondaryDemand(flows, pending, used);
    assert.equal(flows.F[1].rate, 1);
    assert.equal(flows.C[1].rate, 0);
    assert.equal(flows.E[1].rate, 0);
  });

  it("same cognitio regardless of factory-vs-lab order", () => {
    function once(order) {
      const flows = emptyFlows();
      flows.E[1].rate = 1;
      flows.B[1].rate = 1;
      const pending = [];
      const used = new Set();
      for (const args of order) {
        runConvert(flows, args, { pendingSecondary: pending, primaryCategoriesUsed: used });
      }
      reconcileSecondaryDemand(flows, pending, used);
      return flows.F[1].rate;
    }
    assert.equal(once([factory, lab]), once([lab, factory]));
    assert.equal(once([factory, lab]), 1);
  });

  it("secondary claims split leftover E proportionally after primary takes its share", () => {
    const flows = emptyFlows();
    flows.E[1].rate = 4;
    flows.B[1].rate = 4;
    const pending = [];
    const used = new Set();
    runConvert(flows, { ...lab, amount: 2 }, {
      pendingSecondary: pending,
      primaryCategoriesUsed: used,
    });
    const factory2 = { ...factory, amount: 2 };
    runConvert(flows, factory2, {
      pendingSecondary: pending,
      primaryCategoriesUsed: used,
    });
    runConvert(flows, factory2, {
      pendingSecondary: pending,
      primaryCategoriesUsed: used,
    });
    reconcileSecondaryDemand(flows, pending, used);
    assert.equal(flows.F[1].rate, 2);
    assert.equal(flows.C[1].rate, 2);
    assert.equal(flows.E[1].rate, 0);
  });
});

const chainContent = {
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
    "b.mine": {
      id: "b.mine",
      category: "A",
      kind: "mine",
      tier: 3,
      laborSlots: 3,
      effects: [{ effect: "yield_flat", args: { currency: "currency.extracta", amount: 2 } }],
    },
    "b.smelter": {
      id: "b.smelter",
      category: "B",
      kind: "factory",
      tier: 3,
      laborSlots: 3,
      effects: [
        {
          effect: "flow_convert",
          args: { from: { category: "A", tier: ">=1" }, to: { category: "B", tier: ">=1" } },
        },
      ],
    },
    "b.factory": {
      id: "b.factory",
      category: "C",
      kind: "factory",
      tier: 3,
      laborSlots: 3,
      effects: [
        {
          effect: "flow_convert",
          args: { from: { category: "B", tier: ">=1" }, to: { category: "C", tier: ">=1" } },
        },
      ],
    },
    "b.lab": {
      id: "b.lab",
      category: "F",
      kind: "lab",
      tier: 3,
      laborSlots: 3,
      effects: [
        {
          effect: "flow_convert",
          args: { from: { category: "E", tier: ">=1" }, to: { category: "F", tier: ">=1" } },
        },
      ],
    },
  },
};

function chainWorld(buildingIds, population = 12) {
  return {
    factions: [{ id: "fA" }],
    systems: [
      {
        id: "s1",
        ownerFactionId: "fA",
        planets: [
          {
            id: "p1",
            population,
            colonyType: "colony",
            resources: [],
            surfaceBuildings: buildingIds.map((buildingId, i) => ({
              id: `i${i}`,
              buildingId,
            })),
          },
        ],
        stations: [],
        resources: [],
      },
    ],
    fleets: [],
    legions: [],
  };
}

const eco = { techTiers: { A: 10, B: 10, C: 10, D: 10, E: 10, F: 10 }, stocks: {} };

describe("computeFlowBreakdown — ambient before convert + E contest", () => {
  it("same pop on 1 vs 4 planets yields the same ambient D/E", () => {
    const bare = { economy_schema: { categories: {} }, map_resources: {}, buildings: {} };
    const one = computeFlowBreakdown(
      chainWorld([], 12),
      "fA",
      bare,
      eco,
    );
    const four = computeFlowBreakdown(
      {
        factions: [{ id: "fA" }],
        systems: [
          {
            id: "s1",
            ownerFactionId: "fA",
            planets: [1, 2, 3, 4].map((n) => ({
              id: `p${n}`,
              population: 3,
              colonyType: "colony",
              resources: [],
              buildings: [],
            })),
            stations: [],
            resources: [],
          },
        ],
        fleets: [],
        legions: [],
      },
      "fA",
      bare,
      eco,
    );
    assert.equal(one.totals.D.rate, 8);
    assert.equal(one.totals.E.rate, 6);
    assert.equal(four.totals.D.rate, 8);
    assert.equal(four.totals.E.rate, 6);
  });

  it("empty colonyType worlds do not mint ambient D/E", () => {
    const flow = computeFlowBreakdown(chainWorld([], 0), "fA", chainContent, eco);
    assert.equal(flow.flows.D[1].rate, 0);
    assert.equal(flow.flows.E[1].rate, 0);
  });

  it("smelter with only ambient D as secondary actually converts", () => {
    const flow = computeFlowBreakdown(chainWorld(["b.mine", "b.smelter"], 12), "fA", chainContent, eco);
    assert.ok((flow.totals.B?.net || 0) > 0, `materia net=${flow.totals.B?.net}`);
  });

  it("fully-staffed mine→smelter→factory→lab at pop 12 yields cognitio", () => {
    const flow = computeFlowBreakdown(
      chainWorld(["b.mine", "b.smelter", "b.factory", "b.lab"]),
      "fA",
      chainContent,
      eco,
    );
    assert.ok((flow.totals.F?.net || 0) > 0, `cognitio net=${flow.totals.F?.net}`);
  });

  it("cognitio is order-independent for factory vs lab placement", () => {
    const factoryFirst = computeFlowBreakdown(
      chainWorld(["b.mine", "b.smelter", "b.factory", "b.lab"]),
      "fA",
      chainContent,
      eco,
    );
    const labFirst = computeFlowBreakdown(
      chainWorld(["b.mine", "b.smelter", "b.lab", "b.factory"]),
      "fA",
      chainContent,
      eco,
    );
    assert.equal(factoryFirst.totals.F.net, labFirst.totals.F.net);
    assert.ok(factoryFirst.totals.F.net > 0);
  });
});

describe("computeFlowBreakdown — live content bootstrap chain", () => {
  it("mine→smelter→factory→lab at pop 12 yields cognitio (grill regression)", () => {
    const live = getContent();
    const ids = ["building.mine", "materia.smelter", "building.factory", "building.lab"];
    for (const id of ids) {
      assert.ok(live.buildings?.[id], `missing ${id}`);
    }
    const world = {
      factions: [{ id: "fA" }],
      systems: [
        {
          id: "s1",
          ownerFactionId: "fA",
          planets: [
            {
              id: "p1",
              population: 12,
              colonyType: "colony",
              resources: [],
              buildings: ids.map((buildingId, i) => ({ id: `i${i}`, buildingId })),
            },
          ],
          stations: [],
          resources: [],
        },
      ],
      fleets: [],
      legions: [],
    };
    const flow = computeFlowBreakdown(world, "fA", live, eco);
    assert.ok((flow.totals.F?.net || 0) > 0, `live cognitio net=${flow.totals.F?.net}`);
  });
});

describe("addBuildingFlows without convertPrimary stays greedy (parity path)", () => {
  it("still converts when pendingSecondary is omitted", () => {
    const flows = emptyFlows();
    flows.A[1].rate = 2;
    flows.D[1].rate = 2;
    addBuildingFlows(
      flows,
      chainContent.buildings["b.smelter"],
      chainContent,
      { id: "i0", buildingId: "b.smelter" },
    );
    assert.ok(flows.B[1].rate > 0);
  });
});
