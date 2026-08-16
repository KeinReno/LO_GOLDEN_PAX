/**
 * NOT a port — new design (TECH_TREE_2_INTEGRATION_SPEC.md Priority 1).
 */
import { describe, it, expect } from "vitest";
import { fillTechSocket, activeSocketEffects, DEFAULT_SOCKET_FILL_COST } from "./techSocket.mjs";
import { defaultTechAccount } from "./techAccount.mjs";

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

function account(overrides = {}) {
  return { ...defaultTechAccount("f1"), unlockedTechs: ["tech.sock"], ...overrides };
}

describe("fillTechSocket", () => {
  it("spends and records the slotted resource; overwrite is the same action", () => {
    const stocks = { "currency.metal": 40 };
    const first = fillTechSocket(account(), "tech.sock", "map.biofuel", stocks, content);
    expect(first.ok).toBe(true);
    expect(first.techAccount.techSockets["tech.sock"]).toBe("map.biofuel");
    expect(first.stocks["currency.metal"]).toBe(30);

    const second = fillTechSocket(first.techAccount, "tech.sock", "map.iron", first.stocks, content);
    expect(second.ok).toBe(true);
    expect(second.techAccount.techSockets["tech.sock"]).toBe("map.iron");
    expect(second.stocks["currency.metal"]).toBe(20);
  });

  it("rejects an unknown option, an unresearched tech, and unaffordable fill", () => {
    expect(fillTechSocket(account(), "tech.sock", "map.nope", { "currency.metal": 100 }, content).ok).toBe(false);
    expect(fillTechSocket(defaultTechAccount("f1"), "tech.sock", "map.biofuel", { "currency.metal": 100 }, content).ok).toBe(false);
    expect(fillTechSocket(account(), "tech.sock", "map.biofuel", { "currency.metal": 0 }, content).ok).toBe(false);
  });

  it("activeSocketEffects only includes researched+filled options", () => {
    const filled = account({ techSockets: { "tech.sock": "map.biofuel" } });
    const effects = activeSocketEffects(filled, content);
    expect(effects).toHaveLength(1);
    expect(effects[0].swapUpkeepCurrency.toCategory).toBe("E");
    expect(activeSocketEffects(defaultTechAccount("f1"), content)).toEqual([]);
    expect(DEFAULT_SOCKET_FILL_COST["currency.metal"]).toBe(10);
  });
});
