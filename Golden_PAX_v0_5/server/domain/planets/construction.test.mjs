/**
 * Behavior tests: this placement-rule sequence was inline in GMap's
 * applyPlanetAction (server/planetActions.mjs), never its own function —
 * re-derived from reading that code, not a cross-repo diff.
 */
import { describe, it, expect } from "vitest";
import { canPlaceBuilding, placeBuilding } from "./construction.mjs";

const mine = { id: "building.mine", name: "Mine", zone: "surface", faction: "generic", cost: { "currency.metal": 10 } };

function planet(overrides) {
  return { surfaceBuildings: [], orbitalBuildings: [], surfaceSlots: 8, orbitalSlots: 4, ...overrides };
}

describe("canPlaceBuilding", () => {
  it("ok on a fresh planet with room", () => {
    expect(canPlaceBuilding({ planets: [] }, planet(), mine, "faction_human")).toEqual({ ok: true });
  });

  it("rejects when the zone's slots are full", () => {
    const full = planet({ surfaceBuildings: Array.from({ length: 8 }, () => ({ buildingId: "x" })) });
    const result = canPlaceBuilding({ planets: [] }, full, mine, "faction_human");
    expect(result.ok).toBe(false);
  });

  it("uses grade-derived surface cap, not a stale stored surfaceSlots number", () => {
    const p = planet({
      grade: 2,
      surfaceSlots: 8,
      surfaceBuildings: Array.from({ length: 8 }, () => ({ buildingId: "x" })),
    });
    expect(canPlaceBuilding({ planets: [] }, p, mine, "faction_human").ok).toBe(true);
    const fullAtGrade2 = planet({
      grade: 2,
      surfaceBuildings: Array.from({ length: 18 }, () => ({ buildingId: "x" })),
    });
    expect(canPlaceBuilding({ planets: [] }, fullAtGrade2, mine, "faction_human").ok).toBe(false);
  });

  it("rejects a biome-restricted building on the wrong biome", () => {
    const def = { ...mine, biome_restrictions: ["ocean"] };
    const result = canPlaceBuilding({ planets: [] }, planet({ type: "rocky" }), def, "faction_human");
    expect(result.ok).toBe(false);
  });

  it("respects maxPerPlanet", () => {
    const def = { ...mine, maxPerPlanet: 1 };
    const p = planet({ surfaceBuildings: [{ buildingId: "building.mine" }] });
    expect(canPlaceBuilding({ planets: [] }, p, def, "faction_human").ok).toBe(false);
  });

  it("respects maxPerSystem across all of a system's planets", () => {
    const def = { ...mine, maxPerSystem: 1 };
    const other = planet({ surfaceBuildings: [{ buildingId: "building.mine" }] });
    const target = planet();
    expect(canPlaceBuilding({ planets: [other, target] }, target, def, "faction_human").ok).toBe(false);
  });

  // 2026-08-14: before this, nothing anywhere in domain/planets read tech
  // tiers at all — see notes/2026-08-14-tech-tree-audit.md.
  it("a category+tier building respects the real tech-tier ceiling (Math.max(3, techTier+1) floor)", () => {
    const tiered = { ...mine, category: "A", tier: 4 };
    expect(canPlaceBuilding({ planets: [] }, planet(), tiered, "faction_human").ok).toBe(false);
    expect(canPlaceBuilding({ planets: [] }, planet(), tiered, "faction_human", { techTiers: { A: 4 } }).ok).toBe(true);
  });

  it("tier <= 3 in any category needs no research at all — matches GMap's base floor", () => {
    const t3 = { ...mine, category: "A", tier: 3 };
    expect(canPlaceBuilding({ planets: [] }, planet(), t3, "faction_human").ok).toBe(true);
  });
});

describe("placeBuilding", () => {
  it("spends cost and appends the instance to the right zone list", () => {
    const stocks = { "currency.metal": 30 };
    const result = placeBuilding({ planets: [] }, planet(), mine, "faction_human", stocks, {});
    expect(result.ok).toBe(true);
    expect(result.stocks["currency.metal"]).toBe(20);
    expect(result.planet.surfaceBuildings).toHaveLength(1);
    expect(result.planet.surfaceBuildings[0].buildingId).toBe("building.mine");
  });

  it("fails without spending when unaffordable", () => {
    const stocks = { "currency.metal": 1 };
    const result = placeBuilding({ planets: [] }, planet(), mine, "faction_human", stocks, {});
    expect(result.ok).toBe(false);
    expect(stocks["currency.metal"]).toBe(1);
  });

  it("orbital buildings go to orbitalBuildings, not surfaceBuildings", () => {
    const orbital = { ...mine, zone: "orbital" };
    const result = placeBuilding({ planets: [] }, planet(), orbital, "faction_human", { "currency.metal": 30 }, {});
    expect(result.planet.orbitalBuildings).toHaveLength(1);
    expect(result.planet.surfaceBuildings).toHaveLength(0);
  });
});
