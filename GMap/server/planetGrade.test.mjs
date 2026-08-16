/**
 * NOT a port — new design (notes/2026-08-13-galaxy-migration-grill.md Q3).
 * Locks the first-pass 8→48 / 4→12 curves, published-capital derive, and
 * canPlaceBuilding's grade-derived slot cap.
 * Run: node --test server/planetGrade.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_GRADE,
  surfaceSlotsForGrade,
  orbitalSlotsForGrade,
  smallestGradeForSurfaceSlots,
  smallestGradeForOrbitalSlots,
  gradeUpgradeCost,
  gradeUpgradePlan,
  derivedGradeFields,
  zoneSlotCap,
} from "./planetGrade.mjs";
import { canPlaceBuilding } from "./planetActions.mjs";
import { normalizeWorld } from "./normalizeWorld.mjs";

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

const mine = {
  id: "building.mine",
  name: "Mine",
  zone: "surface",
  faction: "generic",
  cost: { "currency.metal": 10 },
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
    assert.equal(surfaceSlotsForGrade(1, content), 8);
    assert.equal(surfaceSlotsForGrade(5, content), 48);
    assert.equal(surfaceSlotsForGrade(3, content), 28);
  });

  it("orbital is 4 at grade 1 and 12 at grade 5, independent of the 48 cap", () => {
    assert.equal(orbitalSlotsForGrade(1, content), 4);
    assert.equal(orbitalSlotsForGrade(5, content), 12);
  });

  it("smallestGradeForSurfaceSlots inverts the curve (published-capital lookup)", () => {
    assert.equal(smallestGradeForSurfaceSlots(8, content), 1);
    assert.equal(smallestGradeForSurfaceSlots(9, content), 2);
    assert.equal(smallestGradeForSurfaceSlots(48, content), 5);
    assert.equal(smallestGradeForSurfaceSlots(100, content), MAX_GRADE);
  });

  it("smallestGradeForOrbitalSlots inverts the 4→12 curve", () => {
    assert.equal(smallestGradeForOrbitalSlots(4, content), 1);
    assert.equal(smallestGradeForOrbitalSlots(5, content), 2);
    assert.equal(smallestGradeForOrbitalSlots(12, content), 5);
  });
});

describe("upgrade cost + plan", () => {
  it("cost scales up per step and is null at max grade", () => {
    assert.equal(gradeUpgradeCost(1, content)["currency.metal"], 30);
    assert.equal(gradeUpgradeCost(4, content)["currency.metal"], 160);
    assert.equal(gradeUpgradeCost(5, content), null);
  });

  it("surface plan raises surface slots and leaves orbital alone", () => {
    const plan = gradeUpgradePlan(planet(), "surface", content);
    assert.equal(plan.ok, true);
    assert.equal(plan.next, 2);
    assert.equal(plan.surfaceSlots, 18);
    assert.equal(plan.orbitalSlots, 4);
    assert.equal(plan.cost["currency.metal"], 30);
  });

  it("orbital plan does not change surface grade slots", () => {
    const plan = gradeUpgradePlan(
      planet({ grade: 3, surfaceSlots: 28 }),
      "orbital",
      content,
    );
    assert.equal(plan.ok, true);
    assert.equal(plan.next, 2);
    assert.equal(plan.orbitalSlots, 6);
    assert.equal(plan.surfaceSlots, 28);
  });

  it("rejects max grade", () => {
    assert.equal(gradeUpgradePlan(planet({ grade: 5 }), "surface", content).ok, false);
  });
});

describe("derivedGradeFields (published capitals, no pop spawn)", () => {
  it("ignores unearned static 118/24 and stamps grade from building count", () => {
    const capital = {
      colonyType: "capital",
      surfaceSlots: 118,
      orbitalSlots: 24,
      surfaceBuildings: Array.from({ length: 12 }, (_, i) => ({ id: `b${i}` })),
      orbitalBuildings: Array.from({ length: 5 }, (_, i) => ({ id: `o${i}` })),
    };
    const fields = derivedGradeFields(capital, content);
    assert.equal(fields.grade, 2);
    assert.equal(fields.surfaceSlots, 18);
    assert.equal(fields.orbitalGrade, 2);
    assert.equal(fields.orbitalSlots, 6);
    assert.equal(capital.surfaceBuildings.length, 12);
  });

  it("keeps an already-earned grade instead of re-deriving from buildings", () => {
    const earned = {
      grade: 4,
      orbitalGrade: 3,
      surfaceBuildings: [{ id: "a" }],
      orbitalBuildings: [],
    };
    const fields = derivedGradeFields(earned, content);
    assert.equal(fields.grade, 4);
    assert.equal(fields.surfaceSlots, 38);
    assert.equal(fields.orbitalGrade, 3);
    assert.equal(fields.orbitalSlots, 8);
  });

  it("empty new colony starts at grade 1", () => {
    const fields = derivedGradeFields({ surfaceBuildings: [], orbitalBuildings: [] }, content);
    assert.equal(fields.grade, 1);
    assert.equal(fields.surfaceSlots, 8);
    assert.equal(fields.orbitalGrade, 1);
    assert.equal(fields.orbitalSlots, 4);
  });

  it("normalizeWorld passthrough stamps capital grade without rewriting published slots in source", () => {
    const world = normalizeWorld({
      meta: { name: "t" },
      systems: [
        {
          id: "sys.cap",
          name: "Cap",
          x: 0,
          y: 0,
          planets: [
            {
              id: "p.cap",
              name: "Capital",
              colonyType: "capital",
              surfaceSlots: 118,
              orbitalSlots: 24,
              surfaceBuildings: Array.from({ length: 12 }, (_, i) => ({ id: `b${i}` })),
              orbitalBuildings: Array.from({ length: 5 }, (_, i) => ({ id: `o${i}` })),
            },
          ],
        },
      ],
    });
    const p = world.systems[0].planets[0];
    assert.equal(p.grade, 2);
    assert.equal(p.surfaceSlots, 18);
    assert.equal(p.orbitalGrade, 2);
    assert.equal(p.orbitalSlots, 6);
    assert.equal(p.surfaceBuildings.length, 12);
  });
});

describe("canPlaceBuilding grade cap", () => {
  it("ok on a fresh planet with room", () => {
    assert.equal(canPlaceBuilding({ planets: [] }, planet(), mine, "faction_human").ok, true);
  });

  it("rejects when the zone's grade-1 slots are full", () => {
    const full = planet({
      surfaceBuildings: Array.from({ length: 8 }, () => ({ buildingId: "x" })),
    });
    assert.equal(canPlaceBuilding({ planets: [] }, full, mine, "faction_human").ok, false);
  });

  it("uses grade-derived surface cap, not a stale stored surfaceSlots number", () => {
    const p = planet({
      grade: 2,
      surfaceSlots: 8,
      surfaceBuildings: Array.from({ length: 8 }, () => ({ buildingId: "x" })),
    });
    assert.equal(canPlaceBuilding({ planets: [] }, p, mine, "faction_human").ok, true);
    const fullAtGrade2 = planet({
      grade: 2,
      surfaceBuildings: Array.from({ length: 18 }, () => ({ buildingId: "x" })),
    });
    assert.equal(
      canPlaceBuilding({ planets: [] }, fullAtGrade2, mine, "faction_human").ok,
      false,
    );
  });

  it("zoneSlotCap prefers grade over the stored 118 capital number", () => {
    const capital = planet({
      grade: 2,
      surfaceSlots: 118,
    });
    assert.equal(zoneSlotCap(capital, "surfaceBuildings", content), 18);
  });

  it("respects maxPerPlanet", () => {
    const def = { ...mine, maxPerPlanet: 1 };
    const p = planet({ surfaceBuildings: [{ buildingId: "building.mine" }] });
    assert.equal(canPlaceBuilding({ planets: [] }, p, def, "faction_human").ok, false);
  });
});
