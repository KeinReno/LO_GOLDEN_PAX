/**
 * Job-slots labor vs biosLaborScale (v0.5 allocateLabor, GMap-shaped).
 * Run: node --test server/laborAllocation.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  allocateLabor,
  applyStaffTransfer,
  buildingStaffingFraction,
  consumesLabor,
  depositStaffingFraction,
  laborSlotsForDef,
} from "./laborAllocation.mjs";
import { addBuildingFlows, addPlanetExtraction, biosLaborScale, emptyFlows } from "./flowEngine.mjs";
import { computeFlowBreakdown } from "./economyTick.mjs";
import { getContent } from "./contentLoader.mjs";

const content = {
  buildings: {
    "b.small": { id: "b.small", laborSlots: 2, kind: "mine", category: "A", extractsCategory: "A", tier: 2 },
    "b.big": { id: "b.big", laborSlots: 5, kind: "factory", category: "B", tier: 5, effects: [{ effect: "yield_flat", args: { currency: "currency.materia", amount: 10 } }] },
    "b.house": {
      id: "b.house",
      kind: "residential",
      category: "E",
      tier: 1,
      laborSlots: 8,
      effects: [{ effect: "pop_cap_add", args: { amount: 15 } }],
    },
    "b.tiered": { id: "b.tiered", kind: "mine", category: "A", extractsCategory: "A", tier: 3 },
  },
  map_resources: {
    "map.iron": {
      id: "map.iron",
      category: "A",
      tier: 1,
      yield: { "currency.metal": 6 },
    },
  },
};

describe("laborSlotsForDef", () => {
  it("uses explicit laborSlots", () => {
    assert.equal(laborSlotsForDef({ laborSlots: 4, tier: 9 }), 4);
  });

  it("defaults to tier when laborSlots is missing", () => {
    assert.equal(laborSlotsForDef({ tier: 3 }), 3);
  });
});

describe("consumesLabor", () => {
  it("skips pop_cap housing so it does not steal workers", () => {
    assert.equal(consumesLabor(content.buildings["b.house"]), false);
    assert.equal(consumesLabor(content.buildings["b.small"]), true);
  });
});

describe("allocateLabor", () => {
  it("fully staffs every labor building when population is plentiful", () => {
    const planet = {
      population: 20,
      surfaceBuildings: [
        { id: "i1", buildingId: "b.small" },
        { id: "i2", buildingId: "b.big" },
      ],
    };
    assert.deepEqual(allocateLabor(planet, content), { i1: 1, i2: 1 });
  });

  it("fills in placement order and partially staffs the first shortfall", () => {
    const planet = {
      population: 4,
      surfaceBuildings: [
        { id: "i1", buildingId: "b.small" },
        { id: "i2", buildingId: "b.big" },
      ],
    };
    assert.deepEqual(allocateLabor(planet, content), { i1: 1, i2: 2 / 5 });
  });

  it("later buildings get zero after population runs out", () => {
    const planet = {
      population: 0,
      surfaceBuildings: [
        { id: "i1", buildingId: "b.small" },
        { id: "i2", buildingId: "b.big" },
      ],
    };
    assert.deepEqual(allocateLabor(planet, content), { i1: 0, i2: 0 });
  });

  it("ignores disabled buildings", () => {
    const planet = {
      population: 10,
      surfaceBuildings: [{ id: "i1", buildingId: "b.small", disabled: true }],
    };
    assert.deepEqual(allocateLabor(planet, content), {});
  });

  it("does not spend population on housing", () => {
    const planet = {
      population: 2,
      surfaceBuildings: [
        { id: "h1", buildingId: "b.house" },
        { id: "i1", buildingId: "b.small" },
      ],
    };
    const staffing = allocateLabor(planet, content);
    assert.equal(staffing.h1, undefined);
    assert.equal(staffing.i1, 1);
    assert.equal(buildingStaffingFraction(content, staffing, planet.surfaceBuildings[0], 0), 1);
  });

  it("pinned assignedLabor is filled before auto placement order", () => {
    const planet = {
      population: 4,
      surfaceBuildings: [
        { id: "i1", buildingId: "b.small" },
        { id: "i2", buildingId: "b.big", assignedLabor: 3 },
      ],
    };
    const staffing = allocateLabor(planet, content);
    assert.equal(staffing.i2, 3 / 5);
    assert.equal(staffing.i1, 1 / 2);
  });

  it("assignedLabor 0 keeps a building empty", () => {
    const planet = {
      population: 10,
      surfaceBuildings: [
        { id: "i1", buildingId: "b.small", assignedLabor: 0 },
        { id: "i2", buildingId: "b.big" },
      ],
    };
    const staffing = allocateLabor(planet, content);
    assert.equal(staffing.i1, 0);
    assert.equal(staffing.i2, 1);
  });
});

describe("applyStaffTransfer", () => {
  it("moves idle surplus onto a pinned building with open slots", () => {
    const planet = {
      population: 10,
      surfaceBuildings: [
        { id: "i1", buildingId: "b.small" },
        { id: "i2", buildingId: "b.big", assignedLabor: 2 },
      ],
    };
    const moved = applyStaffTransfer(planet, content, "idle", "i2", 1);
    assert.equal(moved.ok, true);
    assert.equal(moved.moved, 1);
    assert.equal(planet.surfaceBuildings[1].assignedLabor, 3);
  });

  it("building to idle freezes auto so the worker stays free", () => {
    const planet = {
      population: 4,
      surfaceBuildings: [
        { id: "i1", buildingId: "b.small" },
        { id: "i2", buildingId: "b.big" },
      ],
    };
    const moved = applyStaffTransfer(planet, content, "i1", "idle", 1);
    assert.equal(moved.ok, true);
    assert.equal(moved.moved, 1);
    const after = allocateLabor(planet, content);
    assert.equal(after.i1, 0.5);
    assert.equal(after.i2, 2 / 5);
  });
});

describe("depositStaffingFraction + extraction", () => {
  it("scales named extraction by the matching mine's staffed fraction", () => {
    const planet = {
      population: 1,
      resources: ["map.iron"],
      surfaceBuildings: [{ id: "i1", buildingId: "b.small" }],
    };
    const staffing = allocateLabor(planet, content);
    assert.equal(staffing.i1, 0.5);
    assert.equal(
      depositStaffingFraction(planet, content, staffing, content.map_resources["map.iron"]),
      0.5,
    );
    const flows = emptyFlows();
    addPlanetExtraction(flows, ["map.iron"], content, {
      planet,
      laborScaleForDeposit: (def) =>
        depositStaffingFraction(planet, content, staffing, def),
    });
    assert.equal(flows.A[1].rate, 3);
  });

  it("omitting laborScaleForDeposit leaves the deposit gate's full yield", () => {
    const flows = emptyFlows();
    addPlanetExtraction(flows, ["map.iron"], content, {
      buildings: [{ buildingId: "b.small" }],
    });
    assert.equal(flows.A[1].rate, 6);
  });

  it("scales a later building's yield_flat by its staffed fraction", () => {
    const planet = {
      population: 4,
      surfaceBuildings: [
        { id: "i1", buildingId: "b.small" },
        { id: "i2", buildingId: "b.big" },
      ],
    };
    const staffing = allocateLabor(planet, content);
    const flows = emptyFlows();
    addBuildingFlows(
      flows,
      content.buildings["b.big"],
      content,
      planet.surfaceBuildings[1],
      { rateScale: buildingStaffingFraction(content, staffing, planet.surfaceBuildings[1], 1) },
    );
    assert.equal(flows.B[5].rate, 4);
  });
});

function miniWorld({ population, buildings, resources = ["map.titan"] }) {
  return {
    factions: [{ id: "fA", treasuryPeg: null }],
    systems: [
      {
        id: "s1",
        ownerFactionId: "fA",
        planets: [
          {
            id: "p1",
            resources,
            population,
            colonyType: "colony",
            buildings,
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

describe("computeFlowBreakdown uses job slots, not bios stock", () => {
  const live = getContent();
  const ecoEmpty = {
    techTiers: { A: 10, B: 10, C: 10, D: 10, E: 10, F: 10 },
    stocks: { "currency.bios": 0 },
  };
  const ecoFull = {
    ...ecoEmpty,
    stocks: { "currency.bios": 40 },
  };

  it("zero population yields zero named titan behind a mine", () => {
    const world = miniWorld({
      population: 0,
      buildings: [{ buildingId: "building.mine" }],
    });
    const flow = computeFlowBreakdown(world, "fA", live, ecoFull);
    assert.equal(Number(flow.strategicExtraction?.["map.titan"] || 0), 0);
  });

  it("full staff (pop >= mine tier) extracts titan; bios stock does not change it", () => {
    const world = miniWorld({
      population: 8,
      buildings: [{ buildingId: "building.mine" }],
    });
    const a = computeFlowBreakdown(world, "fA", live, ecoEmpty);
    const b = computeFlowBreakdown(world, "fA", live, ecoFull);
    const extracted = Number(a.strategicExtraction?.["map.titan"] || 0);
    assert.ok(extracted > 0, `got ${extracted}`);
    assert.equal(extracted, Number(b.strategicExtraction?.["map.titan"] || 0));
    assert.equal(a.biosScale, 1);
    assert.equal(biosLaborScale(ecoEmpty), 0.25);
  });

  it("partial staff scales titan vs a fully staffed twin", () => {
    const mine = live.buildings["building.mine"];
    const need = laborSlotsForDef(mine);
    assert.ok(need >= 2, "mine must need more than 1 job for this ratio");
    const full = computeFlowBreakdown(
      miniWorld({ population: need, buildings: [{ buildingId: "building.mine" }] }),
      "fA",
      live,
      ecoFull,
    );
    const half = computeFlowBreakdown(
      miniWorld({ population: 1, buildings: [{ buildingId: "building.mine" }] }),
      "fA",
      live,
      ecoFull,
    );
    const fullAmt = Number(full.strategicExtraction?.["map.titan"] || 0);
    const halfAmt = Number(half.strategicExtraction?.["map.titan"] || 0);
    assert.ok(fullAmt > 0);
    assert.ok(Math.abs(halfAmt - fullAmt / need) < 1e-9, `half=${halfAmt} full=${fullAmt} need=${need}`);
  });
});
