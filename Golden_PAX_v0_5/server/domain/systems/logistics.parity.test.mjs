import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  computeLogisticsNetwork,
  computeSupplyLevel,
  logisticsProductionMult,
  logisticsUpkeepMult,
  logisticsCombatDefMult,
  logisticsRangeBonus,
  resolveCapitalSystemId,
} from "./logistics.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const oldModulePath = path.resolve(__dirname, "../../../../GMap/server/logistics.mjs");

const content = {
  rules: {
    logistics: {
      baseRangeHops: 3,
      depotRangeBonus: 2,
      supplyDecayPerHop: 0.15,
      connectedBonuses: [{ effect: "production_mult", args: { resource: "currency.industria", mult: 1.05 } }],
      disconnectedPenalties: [
        { effect: "logistics_disconnected_penalty", args: { productionMult: 0.5, upkeepMult: 1.3, combatDefMult: 0.7 } },
      ],
      blockadedIsDisconnected: true,
      quarantineBreaksLogistics: true,
    },
  },
};

function ownedChain() {
  return {
    factions: [{ id: "fA" }],
    systems: [
      { id: "cap", ownerFactionId: "fA", isCapital: true, spaceObjects: [] },
      { id: "n1", ownerFactionId: "fA", spaceObjects: [] },
      { id: "n2", ownerFactionId: "fA", spaceObjects: [] },
      { id: "n3", ownerFactionId: "fA", spaceObjects: [] },
      { id: "n4", ownerFactionId: "fA", spaceObjects: [] },
      { id: "cut", ownerFactionId: "fA", spaceObjects: [] },
    ],
    links: [
      { fromId: "cap", toId: "n1", type: "corridor" },
      { fromId: "n1", toId: "n2", type: "gate" },
      { fromId: "n2", toId: "n3", type: "corridor" },
      { fromId: "n3", toId: "n4", type: "corridor" },
    ],
    relations: {},
  };
}

function snapshot(map) {
  return Object.fromEntries([...map.entries()].map(([id, L]) => [id, { ...L }]));
}

describe("logistics parity with GMap", () => {
  it("computeLogisticsNetwork matches GMap on a capital-rooted chain (hops, decay, disconnect past range)", async () => {
    const old = await import(oldModulePath);
    const ours = ownedChain();
    const theirs = ownedChain();
    const mine = snapshot(computeLogisticsNetwork(ours, "fA", content, 1));
    const gmap = snapshot(old.computeLogisticsNetwork(theirs, "fA", content, 1));
    expect(mine).toEqual(gmap);

    expect(mine.cap.hopsToCapital).toBe(0);
    expect(mine.cap.supplyLevel).toBe(1);
    expect(mine.n1.hopsToCapital).toBe(1);
    expect(mine.n1.supplyLevel).toBe(computeSupplyLevel(1, content));
    expect(mine.n3.connectedToCapital).toBe(true);
    expect(mine.n4.connectedToCapital).toBe(false); // hop 4 > baseRange 3
    expect(mine.cut.connectedToCapital).toBe(false);
    expect(mine.n1.supplyLevel).toBe(1 / (1 + 0.15));
  });

  it("logisticsProductionMult / upkeep / combatDef match GMap connected vs disconnected", async () => {
    const old = await import(oldModulePath);
    const world = ownedChain();
    computeLogisticsNetwork(world, "fA", content, 1);
    const cap = world.systems.find((s) => s.id === "cap");
    const cut = world.systems.find((s) => s.id === "cut");
    expect(logisticsProductionMult(cap, content)).toBe(old.logisticsProductionMult(cap, content));
    expect(logisticsProductionMult(cut, content)).toBe(old.logisticsProductionMult(cut, content));
    expect(logisticsUpkeepMult(cut, content)).toBe(old.logisticsUpkeepMult(cut, content));
    expect(logisticsCombatDefMult(cut, content)).toBe(old.logisticsCombatDefMult(cut, content));
    expect(logisticsProductionMult(cut, content)).toBe(0.5);
    expect(logisticsCombatDefMult(cut, content)).toBe(0.7);
  });

  it("damyl_planet links are not logistics-eligible (GMap LOGISTICS_LINK_TYPES)", async () => {
    const old = await import(oldModulePath);
    const world = {
      factions: [{ id: "fA" }],
      systems: [
        { id: "cap", ownerFactionId: "fA", isCapital: true, spaceObjects: [] },
        { id: "inf", ownerFactionId: "fA", spaceObjects: [] },
      ],
      links: [{ fromId: "cap", toId: "inf", type: "damyl_planet" }],
    };
    const mine = computeLogisticsNetwork(world, "fA", content, 1);
    const gmapWorld = {
      factions: [{ id: "fA" }],
      systems: [
        { id: "cap", ownerFactionId: "fA", isCapital: true, spaceObjects: [] },
        { id: "inf", ownerFactionId: "fA", spaceObjects: [] },
      ],
      links: [{ fromId: "cap", toId: "inf", type: "damyl_planet" }],
    };
    const gmap = old.computeLogisticsNetwork(gmapWorld, "fA", content, 1);
    expect(mine.get("inf").connectedToCapital).toBe(false);
    expect(gmap.get("inf").connectedToCapital).toBe(false);
  });

  it("depot extends range; missing trait data degrades logisticsRangeBonus to 0", () => {
    expect(logisticsRangeBonus({ factions: [{ id: "fA" }] }, "fA", content)).toBe(0);
    const world = ownedChain();
    world.systems.find((s) => s.id === "n1").spaceObjects = [{ typeId: "depot" }];
    computeLogisticsNetwork(world, "fA", content, 1);
    // viaDepot on n1 adds depotRangeBonus 2 → range 5, so n4 at hop 4 is connected
    expect(world.systems.find((s) => s.id === "n4").logistics.connectedToCapital).toBe(true);
    expect(world.systems.find((s) => s.id === "n4").logistics.viaDepot).toBe(true);
  });

  it("resolveCapitalSystemId prefers isCapital, then first owned", () => {
    const world = ownedChain();
    expect(resolveCapitalSystemId(world, "fA")).toBe("cap");
    world.systems.find((s) => s.id === "cap").isCapital = false;
    expect(resolveCapitalSystemId(world, "fA")).toBe("cap"); // still first owned
  });
});
