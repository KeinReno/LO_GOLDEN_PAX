import { describe, it, expect } from "vitest";
import { allocateLabor } from "./laborAllocation.mjs";

describe("allocateLabor", () => {
  const content = {
    buildings: {
      "b.small": { id: "b.small", laborSlots: 2 },
      "b.big": { id: "b.big", laborSlots: 5 },
    },
  };

  it("fully staffs every building when population is plentiful", () => {
    const planet = { population: 20, surfaceBuildings: [{ id: "i1", buildingId: "b.small" }, { id: "i2", buildingId: "b.big" }], orbitalBuildings: [] };
    expect(allocateLabor(planet, content)).toEqual({ i1: 1, i2: 1 });
  });

  it("fills buildings in placement order and partially staffs the first one that runs short", () => {
    const planet = { population: 4, surfaceBuildings: [{ id: "i1", buildingId: "b.small" }, { id: "i2", buildingId: "b.big" }], orbitalBuildings: [] };
    // i1 takes 2 (fully staffed), leaving 2 of 5 needed for i2.
    expect(allocateLabor(planet, content)).toEqual({ i1: 1, i2: 2 / 5 });
  });

  it("buildings after the shortfall get zero staffing", () => {
    const planet = { population: 0, surfaceBuildings: [{ id: "i1", buildingId: "b.small" }, { id: "i2", buildingId: "b.big" }], orbitalBuildings: [] };
    expect(allocateLabor(planet, content)).toEqual({ i1: 0, i2: 0 });
  });

  it("ignores disabled buildings", () => {
    const planet = { population: 10, surfaceBuildings: [{ id: "i1", buildingId: "b.small", disabled: true }], orbitalBuildings: [] };
    expect(allocateLabor(planet, content)).toEqual({});
  });
});
