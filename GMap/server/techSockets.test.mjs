/**
 * Tech sockets — fill/swap + empire-wide upkeep category swap.
 * Port of v0.5 Tech Tree 2.0 P1. Run: node --test server/techSockets.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  fillTechSocket,
  activeSocketEffects,
  resolveUpkeepCategory,
  DEFAULT_SOCKET_FILL_COST,
} from "./techSockets.mjs";
import { addUpkeepDemand, emptyFlows } from "./flowEngine.mjs";

const socketDef = {
  id: "tech.sock",
  name: "Sock",
  socket: {
    "map.biofuel": {
      fillCost: { "currency.metal": 10 },
      swapUpkeepCurrency: { match: { category: "A" }, fromCategory: "D", toCategory: "E" },
    },
    "map.iron": {
      fillCost: { "currency.metal": 10 },
      swapUpkeepCurrency: { match: { category: "A" }, fromCategory: "D", toCategory: "D" },
    },
  },
};

const content = { technologies: { "tech.sock": socketDef } };

function eco(overrides = {}) {
  return { unlockedTechs: ["tech.sock"], techSockets: {}, ...overrides };
}

const extractor = {
  kind: "extractor",
  category: "A",
  upkeep_slots: [{ role: "power", count: 4, require: { category: "D", tier: ">=1" } }],
};

describe("fillTechSocket", () => {
  it("spends and records the slotted resource; overwrite is the same action", () => {
    const stocks = { "currency.metal": 40 };
    const first = fillTechSocket(eco(), "tech.sock", "map.biofuel", stocks, content);
    assert.equal(first.ok, true);
    assert.equal(first.eco.techSockets["tech.sock"], "map.biofuel");
    assert.equal(first.stocks["currency.metal"], 30);

    const second = fillTechSocket(first.eco, "tech.sock", "map.iron", first.stocks, content);
    assert.equal(second.ok, true);
    assert.equal(second.eco.techSockets["tech.sock"], "map.iron");
    assert.equal(second.stocks["currency.metal"], 20);
  });

  it("rejects an unknown option, an unresearched tech, and unaffordable fill", () => {
    assert.equal(fillTechSocket(eco(), "tech.sock", "map.nope", { "currency.metal": 100 }, content).ok, false);
    assert.equal(
      fillTechSocket({ unlockedTechs: [] }, "tech.sock", "map.biofuel", { "currency.metal": 100 }, content).ok,
      false,
    );
    assert.equal(fillTechSocket(eco(), "tech.sock", "map.biofuel", { "currency.metal": 0 }, content).ok, false);
  });

  it("activeSocketEffects only includes researched+filled options", () => {
    const filled = eco({ techSockets: { "tech.sock": "map.biofuel" } });
    const effects = activeSocketEffects(filled, content);
    assert.equal(effects.length, 1);
    assert.equal(effects[0].swapUpkeepCurrency.toCategory, "E");
    assert.deepEqual(activeSocketEffects({ unlockedTechs: [] }, content), []);
    assert.equal(DEFAULT_SOCKET_FILL_COST["currency.metal"], 10);
  });
});

describe("addUpkeepDemand — socket swap", () => {
  it("swaps extractor upkeep D→E when the matching socket is filled", () => {
    const before = emptyFlows();
    addUpkeepDemand(before, extractor, {});
    assert.equal(before.D[1].demand, 4);
    assert.equal(before.E[1].demand, 0);

    const filled = eco({ techSockets: { "tech.sock": "map.biofuel" } });
    const after = emptyFlows();
    addUpkeepDemand(after, extractor, {
      socketEffects: activeSocketEffects(filled, content),
    });
    assert.equal(after.D[1].demand, 0);
    assert.equal(after.E[1].demand, 4);
    assert.equal(resolveUpkeepCategory("D", extractor, activeSocketEffects(filled, content)), "E");
  });

  it("swap to the same category is a no-op; unmatched buildings are unchanged", () => {
    const iron = eco({ techSockets: { "tech.sock": "map.iron" } });
    const flows = emptyFlows();
    addUpkeepDemand(flows, extractor, {
      socketEffects: activeSocketEffects(iron, content),
    });
    assert.equal(flows.D[1].demand, 4);
    assert.equal(flows.E[1].demand, 0);

    const lab = {
      kind: "lab",
      category: "F",
      upkeep_slots: [{ role: "power", count: 2, require: { category: "D", tier: ">=1" } }],
    };
    const other = emptyFlows();
    addUpkeepDemand(other, lab, {
      socketEffects: activeSocketEffects(eco({ techSockets: { "tech.sock": "map.biofuel" } }), content),
    });
    assert.equal(other.D[1].demand, 2);
    assert.equal(other.E[1].demand, 0);
  });
});
