/**
 * Census ↔ labor-unit conversion.
 * Run: node --test server/populationScale.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  factionLaborPopulation,
  isCensusPopulation,
  laborPopulation,
  laborToCensus,
  populationScaleCfg,
} from "./populationScale.mjs";
import { allocateLabor, occupationBreakdown } from "./laborAllocation.mjs";
import { computeFlowBreakdown } from "./economyTick.mjs";
import { applyAmbientDE } from "./ambientFlow.mjs";
import { emptyFlows } from "./flowEngine.mjs";

const content = {
  economy_balance: {
    population: {
      censusPerLaborUnit: 1000,
      censusThreshold: 10_000,
    },
  },
  buildings: {
    "b.mine": {
      id: "b.mine",
      kind: "mine",
      category: "A",
      extractsCategory: "A",
      tier: 3,
      laborSlots: 3,
    },
    "b.lab": {
      id: "b.lab",
      kind: "lab",
      category: "F",
      tier: 4,
      laborSlots: 4,
      effects: [{ effect: "flow_convert", args: { from: { category: "E" }, to: { category: "F" } } }],
    },
  },
};

describe("laborPopulation", () => {
  it("keeps playtest-scale numbers as labor units", () => {
    assert.equal(laborPopulation({ population: 12 }, content), 12);
    assert.equal(isCensusPopulation(12, content), false);
  });

  it("converts census 500_000 to 500 labor units", () => {
    assert.equal(laborPopulation({ population: 500_000 }, content), 500);
    assert.equal(laborToCensus(2, { population: 500_000 }, content), 2000);
  });

  it("censusLocked small worlds still convert, not stay as labor units", () => {
    assert.equal(
      laborPopulation({ population: 3600, censusLocked: true }, content),
      3,
    );
    assert.equal(laborToCensus(2, { population: 3600, censusLocked: true }, content), 2000);
  });

  it("does not turn 500_000 heads into millions of ambient D", () => {
    const labor = laborPopulation({ population: 500_000 }, content);
    const flows = emptyFlows();
    applyAmbientDE(flows, labor);
    assert.equal(flows.D[1].rate, Math.ceil(500 * 0.6));
    assert.ok(flows.D[1].rate < 1000);
  });
});

describe("occupations", () => {
  it("labels mine staff as workers and lab staff as scientists", () => {
    const planet = {
      population: 10,
      surfaceBuildings: [
        { id: "m", buildingId: "b.mine" },
        { id: "l", buildingId: "b.lab" },
      ],
    };
    const staff = allocateLabor(planet, content);
    assert.equal(staff.m, 1);
    assert.equal(staff.l, 1);
    assert.deepEqual(occupationBreakdown(planet, content), {
      workers: 3,
      scientists: 4,
    });
  });

  it("labels barracks staff as military", () => {
    const planet = {
      population: 5,
      surfaceBuildings: [{ id: "k", buildingId: "b.barracks" }],
    };
    const local = {
      ...content,
      buildings: {
        ...content.buildings,
        "b.barracks": { id: "b.barracks", kind: "barracks", tier: 2, laborSlots: 2 },
      },
    };
    assert.deepEqual(occupationBreakdown(planet, local), { military: 2 });
  });
});

describe("computeFlowBreakdown census planet", () => {
  it("500k census does not mint 300k ambient D", () => {
    const world = {
      factions: [{ id: "fA" }],
      systems: [
        {
          id: "s1",
          ownerFactionId: "fA",
          planets: [
            {
              id: "p1",
              population: 500_000,
              colonyType: "colony",
              resources: [],
              buildings: [],
            },
          ],
          stations: [],
          resources: [],
        },
      ],
      fleets: [],
      legions: [],
    };
    const eco = {
      techTiers: { A: 10, B: 10, C: 10, D: 10, E: 10, F: 10 },
      stocks: {},
    };
    const flow = computeFlowBreakdown(world, "fA", content, eco);
    assert.ok(flow.totals.D.rate < 1000, `D=${flow.totals.D.rate}`);
    assert.equal(factionLaborPopulation(world, "fA", content), 500);
    assert.equal(populationScaleCfg(content).censusPerLaborUnit, 1000);
  });
});
