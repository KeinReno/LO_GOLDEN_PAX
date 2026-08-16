/**
 * NOT a port — new design (notes/2026-08-13-galaxy-migration-grill.md Q3).
 * GMap has no slot-grade mechanic; these tests lock the first-pass 8→48 /
 * 4→12 curves and the purchasable upgrade action.
 */
import { describe, it, expect } from "vitest";
import {
  surfaceSlotsForGrade,
  orbitalSlotsForGrade,
  smallestGradeForSurfaceSlots,
  smallestGradeForOrbitalSlots,
  gradeUpgradeCost,
  upgradeSurfaceGrade,
  upgradeOrbitalGrade,
  MAX_GRADE,
} from "./planetGrade.mjs";

const content = {
  economy_balance: {
    planetGrade: {
      surfaceSlots: [8, 18, 28, 38, 48],
      orbitalSlots: [4, 6, 8, 10, 12],
      upgradeCost: [
        null,
        { "currency.metal": 30, "currency.supply": 15 },
        { "currency.metal": 60, "currency.supply": 30 },
        { "currency.metal": 100, "currency.supply": 50 },
        { "currency.metal": 160, "currency.supply": 80 },
      ],
    },
  },
};

function planet(overrides = {}) {
  return {
    id: "p1",
    ownerFactionId: "fA",
    grade: 1,
    orbitalGrade: 1,
    surfaceSlots: 8,
    orbitalSlots: 4,
    surfaceBuildings: [],
    orbitalBuildings: [],
    ...overrides,
  };
}

describe("slot curves", () => {
  it("surface is 8 at grade 1 and 48 at grade 5", () => {
    expect(surfaceSlotsForGrade(1, content)).toBe(8);
    expect(surfaceSlotsForGrade(5, content)).toBe(48);
    expect(surfaceSlotsForGrade(3, content)).toBe(28);
  });

  it("orbital is 4 at grade 1 and 12 at grade 5, independent of the 48 cap", () => {
    expect(orbitalSlotsForGrade(1, content)).toBe(4);
    expect(orbitalSlotsForGrade(5, content)).toBe(12);
  });

  it("smallestGradeForSurfaceSlots is an easy invert of the curve (migration lookup)", () => {
    expect(smallestGradeForSurfaceSlots(8, content)).toBe(1);
    expect(smallestGradeForSurfaceSlots(9, content)).toBe(2);
    expect(smallestGradeForSurfaceSlots(48, content)).toBe(5);
    expect(smallestGradeForSurfaceSlots(100, content)).toBe(MAX_GRADE);
  });

  it("smallestGradeForOrbitalSlots inverts the 4→12 curve", () => {
    expect(smallestGradeForOrbitalSlots(4, content)).toBe(1);
    expect(smallestGradeForOrbitalSlots(5, content)).toBe(2);
    expect(smallestGradeForOrbitalSlots(12, content)).toBe(5);
    expect(smallestGradeForOrbitalSlots(99, content)).toBe(MAX_GRADE);
  });
});

describe("upgrade cost + action", () => {
  it("cost scales up per step and is null at max grade", () => {
    expect(gradeUpgradeCost(1, content)["currency.metal"]).toBe(30);
    expect(gradeUpgradeCost(4, content)["currency.metal"]).toBe(160);
    expect(gradeUpgradeCost(5, content)).toBeNull();
  });

  it("upgradeSurfaceGrade spends and raises surface slots, leaving orbital alone", () => {
    const stocks = { "currency.metal": 100, "currency.supply": 70 };
    const result = upgradeSurfaceGrade(planet(), "fA", stocks, content);
    expect(result.ok).toBe(true);
    expect(result.planet.grade).toBe(2);
    expect(result.planet.surfaceSlots).toBe(18);
    expect(result.planet.orbitalGrade).toBe(1);
    expect(result.planet.orbitalSlots).toBe(4);
    expect(result.stocks["currency.metal"]).toBe(70);
    expect(result.stocks["currency.supply"]).toBe(55);
  });

  it("upgradeOrbitalGrade does not change surface grade", () => {
    const result = upgradeOrbitalGrade(planet({ grade: 3, surfaceSlots: 28 }), "fA", { "currency.metal": 100, "currency.supply": 70 }, content);
    expect(result.ok).toBe(true);
    expect(result.planet.orbitalGrade).toBe(2);
    expect(result.planet.orbitalSlots).toBe(6);
    expect(result.planet.grade).toBe(3);
    expect(result.planet.surfaceSlots).toBe(28);
  });

  it("rejects max grade, unaffordable, and a faction that does not own the planet", () => {
    expect(upgradeSurfaceGrade(planet({ grade: 5 }), "fA", { "currency.metal": 999, "currency.supply": 999 }, content).ok).toBe(false);
    expect(upgradeSurfaceGrade(planet(), "fA", { "currency.metal": 1, "currency.supply": 1 }, content).ok).toBe(false);
    expect(upgradeSurfaceGrade(planet(), "fB", { "currency.metal": 100, "currency.supply": 70 }, content).error).toBe("planet_not_owned");
  });
});
