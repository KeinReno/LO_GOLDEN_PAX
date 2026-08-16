import { describe, it, expect } from "vitest";
import { canRaiseUnit, raiseUnit, disbandUnits, reduceComposition } from "./recruitment.mjs";

const content = { economy_balance: { forces: { mobilizationRate: 0.3, unitCostMult: 1.3, shipCostMult: 1.6, supplyRatio: 0.42 }, buildings: { metalByTier: { 1: 8 } } } };
const militia = { id: "unit.militia", tier: 1, roles: ["infantry"], raisableWithoutBuilding: true, stats: { damage: 8, hp: 70 } };
const scout = { id: "ship.scout", tier: 1, roles: ["screen"], stats: { damage: 4, hp: 22, accuracy: 65 } };

describe("canRaiseUnit", () => {
  it("allows a raisableWithoutBuilding def with zero infrastructure", () => {
    const system = { ownerFactionId: "fA", planets: [] };
    const planet = { ownerFactionId: "fA" };
    expect(canRaiseUnit(system, planet, militia, "unit", "fA")).toEqual({ ok: true });
  });

  it("requires a shipyard/spaceport for ships otherwise", () => {
    const system = { ownerFactionId: "fA", planets: [{ ownerFactionId: "fA", surfaceBuildings: [], orbitalBuildings: [] }] };
    const planet = { ownerFactionId: "fA" };
    expect(canRaiseUnit(system, planet, scout, "ship", "fA").ok).toBe(false);

    const withYard = { ownerFactionId: "fA", planets: [{ ownerFactionId: "fA", surfaceBuildings: [], orbitalBuildings: [{ kind: "shipyard" }] }] };
    expect(canRaiseUnit(withYard, planet, scout, "ship", "fA")).toEqual({ ok: true });
  });

  it("rejects a planet the faction doesn't own", () => {
    const system = { ownerFactionId: "fA", planets: [] };
    expect(canRaiseUnit(system, { ownerFactionId: "fB" }, militia, "unit", "fA").ok).toBe(false);
  });

  it("blocks a requiresTech def until that tech is unlocked; omitting techAccount is not a bypass", () => {
    const gated = { ...militia, requiresTech: "tech.fixture.military_unlock" };
    const system = { ownerFactionId: "fA", planets: [] };
    const planet = { ownerFactionId: "fA" };
    expect(canRaiseUnit(system, planet, gated, "unit", "fA").ok).toBe(false);
    expect(canRaiseUnit(system, planet, gated, "unit", "fA", { unlockedTechs: [] }).ok).toBe(false);
    expect(canRaiseUnit(system, planet, gated, "unit", "fA", { unlockedTechs: ["tech.fixture.military_unlock"] }).ok).toBe(true);
  });

  it("blocks dotted weapon.* slot properties until unlocked; generic weapon is not gated", () => {
    const plasma = {
      ...militia,
      slots: [{ role: "weapon", require: { properties: ["weapon.plasma"] }, count: 1 }],
    };
    const system = { ownerFactionId: "fA", planets: [] };
    const planet = { ownerFactionId: "fA" };
    expect(canRaiseUnit(system, planet, plasma, "unit", "fA").ok).toBe(false);
    expect(
      canRaiseUnit(system, planet, plasma, "unit", "fA", { unlockedTechs: [], unlockedProperties: ["weapon.plasma"] }).ok,
    ).toBe(true);
    expect(canRaiseUnit(system, planet, militia, "unit", "fA").ok).toBe(true);
  });
});

describe("raiseUnit", () => {
  it("spends recruits (population) and currency together, returns a combat-ready composition group", () => {
    const system = { ownerFactionId: "fA", planets: [] };
    const planet = { ownerFactionId: "fA", population: 20 };
    const stocks = { "currency.metal": 100, "currency.supply": 100 };

    const result = raiseUnit(system, planet, militia, "unit", "fA", 3, stocks, content);

    expect(result.ok).toBe(true);
    expect(result.planet.population).toBe(17); // 20 - 3 recruits
    expect(result.group).toEqual({ defId: "unit.militia", tier: 1, roles: ["infantry"], count: 3, damage: 8, hp: 70, maxHp: 70 });
    expect(result.stocks["currency.metal"]).toBeLessThan(100);
  });

  it("fails when the mobilization ceiling can't cover the ask", () => {
    const system = { ownerFactionId: "fA", planets: [] };
    const planet = { ownerFactionId: "fA", population: 10 }; // ceiling = floor(10*0.3) = 3
    const stocks = { "currency.metal": 1000, "currency.supply": 1000 };

    const result = raiseUnit(system, planet, militia, "unit", "fA", 5, stocks, content);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/mobilizable/);
  });

  it("fails, spending nothing, when currency can't cover it", () => {
    const system = { ownerFactionId: "fA", planets: [] };
    const planet = { ownerFactionId: "fA", population: 20 };
    const stocks = { "currency.metal": 0, "currency.supply": 0 };

    const result = raiseUnit(system, planet, militia, "unit", "fA", 1, stocks, content);
    expect(result.ok).toBe(false);
  });

  it("fails the building gate for a non-exempt def with no infrastructure", () => {
    const system = { ownerFactionId: "fA", planets: [] };
    const planet = { ownerFactionId: "fA", population: 20 };
    const result = raiseUnit(system, planet, scout, "ship", "fA", 1, { "currency.metal": 1000, "currency.supply": 1000 }, content);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/shipyard/);
  });

  it("persists crewCount on a ship group and spends crew as real recruits", () => {
    const system = { ownerFactionId: "fA", planets: [{ ownerFactionId: "fA", surfaceBuildings: [], orbitalBuildings: [{ kind: "shipyard" }] }] };
    const planet = { ownerFactionId: "fA", population: 20 };
    const withCrew = { economy_balance: { forces: { mobilizationRate: 0.3, crewPerTier: 5, unitCostMult: 1.3, shipCostMult: 1.6, supplyRatio: 0.42 }, buildings: { metalByTier: { 1: 8 } } } };
    const result = raiseUnit(system, planet, scout, "ship", "fA", 1, { "currency.metal": 1000, "currency.supply": 1000 }, withCrew);
    expect(result.ok).toBe(true);
    expect(result.group.crewCount).toBe(5); // 1 × tier 1 × 5, persisted not derived later
    expect(result.group.count).toBe(1);
    expect(result.planet.population).toBe(14); // 20 - (1 hull + 5 crew)
    expect(result.group).not.toHaveProperty("defId", "unit.militia");
  });

  it("does not put crewCount on a legion group", () => {
    const system = { ownerFactionId: "fA", planets: [] };
    const planet = { ownerFactionId: "fA", population: 20 };
    const withCrew = { ...content, economy_balance: { ...content.economy_balance, forces: { ...content.economy_balance.forces, crewPerTier: 5 } } };
    const result = raiseUnit(system, planet, militia, "unit", "fA", 3, { "currency.metal": 100, "currency.supply": 100 }, withCrew);
    expect(result.ok).toBe(true);
    expect(result.group.crewCount).toBeUndefined();
    expect(result.planet.population).toBe(17);
  });
});

describe("raiseUnit overrideCeiling", () => {
  it("lets a raise past the ceiling through, spending extra population on the overflow only", () => {
    const system = { ownerFactionId: "fA", planets: [] };
    const planet = { ownerFactionId: "fA", population: 10 }; // ceiling = 3
    const stocks = { "currency.metal": 1000, "currency.supply": 1000 };

    const result = raiseUnit(system, planet, militia, "unit", "fA", 5, stocks, content, { overrideCeiling: true });

    expect(result.ok).toBe(true);
    expect(result.planet.population).toBe(4); // 10 - (3 + ceil(2*1.5)) = 10 - 6
    expect(result.group.count).toBe(5); // extra pop is a penalty, not extra units
  });

  it("still 1:1 when the ask fits under the ceiling even with the flag set", () => {
    const system = { ownerFactionId: "fA", planets: [] };
    const planet = { ownerFactionId: "fA", population: 10 };
    const result = raiseUnit(system, planet, militia, "unit", "fA", 2, { "currency.metal": 1000, "currency.supply": 1000 }, content, { overrideCeiling: true });
    expect(result.ok).toBe(true);
    expect(result.planet.population).toBe(8);
    expect(result.group.count).toBe(2);
  });

  it("fails when the 1.5x overflow would spend more population than the planet has", () => {
    const system = { ownerFactionId: "fA", planets: [] };
    const planet = { ownerFactionId: "fA", population: 10 }; // ceiling 3; n=8 → 3 + ceil(5*1.5) = 11
    const result = raiseUnit(system, planet, militia, "unit", "fA", 8, { "currency.metal": 1000, "currency.supply": 1000 }, content, { overrideCeiling: true });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not enough population for raise/);
  });
});

describe("disbandUnits", () => {
  it("returns population to the planet", () => {
    expect(disbandUnits({ population: 10 }, 4).population).toBe(14);
  });
});

describe("reduceComposition", () => {
  const scouts = { defId: "ship.scout", count: 4, roles: ["screen"] };
  const militiaGroup = { defId: "unit.militia", count: 3, roles: ["infantry"] };
  const line = { defId: "ship.frigate", count: 2, roles: ["line"] };

  it("omitting count and defId clears the whole composition", () => {
    expect(reduceComposition([scouts, militiaGroup])).toEqual({ ok: true, composition: [], disbandedCount: 7 });
  });

  it("omitting defId reduces the last group only (legacy LIFO)", () => {
    const result = reduceComposition([scouts, militiaGroup], 2);
    expect(result.ok).toBe(true);
    expect(result.disbandedCount).toBe(2);
    expect(result.composition).toEqual([scouts, { ...militiaGroup, count: 1 }]);
  });

  it("a count between last-group size and total reduces only the last group (no spill)", () => {
    const result = reduceComposition([scouts, militiaGroup], 5); // last has 3, total 7
    expect(result.ok).toBe(true);
    expect(result.disbandedCount).toBe(3);
    expect(result.composition).toEqual([scouts]);
  });

  it("a count at or above the total still clears the whole force when defId is omitted", () => {
    expect(reduceComposition([scouts, militiaGroup], 7)).toEqual({ ok: true, composition: [], disbandedCount: 7 });
  });

  it("defId targets that specific group, last match if several share the id", () => {
    const firstMilitia = { defId: "unit.militia", count: 2, roles: ["infantry"] };
    const result = reduceComposition([firstMilitia, scouts, militiaGroup], 1, "unit.militia");
    expect(result.ok).toBe(true);
    expect(result.disbandedCount).toBe(1);
    expect(result.composition.map((g) => [g.defId, g.count])).toEqual([
      ["unit.militia", 2],
      ["ship.scout", 4],
      ["unit.militia", 2],
    ]);
  });

  it("omitting count with a defId disbands that whole group and keeps the others", () => {
    const result = reduceComposition([scouts, militiaGroup, line], undefined, "unit.militia");
    expect(result.ok).toBe(true);
    expect(result.disbandedCount).toBe(3);
    expect(result.composition.map((g) => g.defId)).toEqual(["ship.scout", "ship.frigate"]);
  });

  it("rejects an unknown defId", () => {
    const result = reduceComposition([scouts], 1, "unit.militia");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unit\.militia/);
  });
});
