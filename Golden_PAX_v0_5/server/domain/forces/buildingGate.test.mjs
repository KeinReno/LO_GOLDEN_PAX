import { describe, it, expect } from "vitest";
import { systemHasShipyard, systemHasBarracks } from "./buildingGate.mjs";

/**
 * Behavior test, not a cross-repo diff: GMap's systemHasShipyard/
 * systemHasBarracks are module-private in server/systemActions.mjs (never
 * exported). Cases re-derived directly from reading those functions.
 */
describe("systemHasShipyard", () => {
  it("true when the faction owns a planet with a shipyard/spaceport building", () => {
    const system = { ownerFactionId: "fA", planets: [{ ownerFactionId: "fA", orbitalBuildings: [{ kind: "shipyard" }], surfaceBuildings: [] }] };
    expect(systemHasShipyard(system, "fA")).toBe(true);
  });

  it("true via a system-owned military station, no planet building needed", () => {
    const system = { ownerFactionId: "fA", planets: [], stations: [{ kind: "military", factionId: "fA" }] };
    expect(systemHasShipyard(system, "fA")).toBe(true);
  });

  it("false for another faction's planets/stations", () => {
    const system = {
      ownerFactionId: "fB",
      planets: [{ ownerFactionId: "fB", orbitalBuildings: [{ kind: "shipyard" }], surfaceBuildings: [] }],
      stations: [{ kind: "military", factionId: "fB" }],
    };
    expect(systemHasShipyard(system, "fA")).toBe(false);
  });

  it("falls back to the planet's owner when unset, inherits from system owner", () => {
    const system = { ownerFactionId: "fA", planets: [{ orbitalBuildings: [{ kind: "spaceport" }], surfaceBuildings: [] }] };
    expect(systemHasShipyard(system, "fA")).toBe(true);
  });
});

describe("systemHasBarracks", () => {
  it("true when the faction owns a planet with a barracks", () => {
    const system = { ownerFactionId: "fA", planets: [{ ownerFactionId: "fA", surfaceBuildings: [{ kind: "barracks" }] }] };
    expect(systemHasBarracks(system, "fA")).toBe(true);
  });

  it("only checks surfaceBuildings, not orbital", () => {
    const system = { ownerFactionId: "fA", planets: [{ ownerFactionId: "fA", surfaceBuildings: [], orbitalBuildings: [{ kind: "barracks" }] }] };
    expect(systemHasBarracks(system, "fA")).toBe(false);
  });

  it("false with no barracks anywhere", () => {
    expect(systemHasBarracks({ ownerFactionId: "fA", planets: [] }, "fA")).toBe(false);
  });
});
