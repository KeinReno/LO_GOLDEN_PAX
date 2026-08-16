import { describe, it, expect } from "vitest";
import { fleetUpkeep } from "./upkeep.mjs";

/**
 * Behavior test, not a cross-repo diff: GMap's fleetUpkeep is
 * module-private in server/economyTick.mjs (never exported). Cases
 * re-derived directly from reading that function.
 */
describe("fleetUpkeep", () => {
  const content = {
    ships: { "ship.scout": { tier: 1 } },
    units: { "unit.militia": { tier: 1 } },
    economy_balance: { forces: { shipUpkeepMetalBase: 0.2, shipUpkeepMetalPerTier: 0.12, legionUpkeepEPerCount: 0.35 } },
  };

  it("sums ship upkeep into currency.metal and legion upkeep into currency.supply", () => {
    const fleets = [{ factionId: "fA", composition: [{ defId: "ship.scout", count: 10 }] }];
    const legions = [{ factionId: "fA", composition: [{ defId: "unit.militia", count: 10 }] }];

    const result = fleetUpkeep(fleets, legions, "fA", content);

    const expectedMetal = Math.ceil(10 * (0.2 + 0.12 * 1));
    const expectedSupply = Math.ceil(10 * 0.35);
    expect(result).toEqual({ "currency.metal": expectedMetal, "currency.supply": expectedSupply });
  });

  it("ignores other factions' forces", () => {
    const fleets = [{ factionId: "fB", composition: [{ defId: "ship.scout", count: 100 }] }];
    expect(fleetUpkeep(fleets, [], "fA", content)).toEqual({ "currency.metal": 0, "currency.supply": 0 });
  });

  it("falls back to a default rate for a fleet/legion with no composition recorded", () => {
    const fleets = [{ factionId: "fA", composition: [] }];
    const legions = [{ factionId: "fA", composition: [], strength: 5 }];
    const result = fleetUpkeep(fleets, legions, "fA", content);
    expect(result["currency.metal"]).toBeGreaterThan(0);
    expect(result["currency.supply"]).toBeGreaterThan(0);
  });
});
