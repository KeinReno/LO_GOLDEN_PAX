import { describe, it, expect } from "vitest";
import { applyOccupationEffects, shouldOccupyAfterEngage, shouldOccupyEmptySystem } from "./occupation.mjs";

describe("applyOccupationEffects", () => {
  it("transfers system + owned planets and applies ~8% pop hit", () => {
    const system = {
      id: "sys.x",
      ownerFactionId: "f2",
      planets: [
        { id: "p1", ownerFactionId: "f2", population: 100 },
        { id: "p2", ownerFactionId: null, population: 0 },
      ],
    };
    const { system: next, popHit } = applyOccupationEffects(system, "f1");
    expect(next.ownerFactionId).toBe("f1");
    expect(next.planets[0].ownerFactionId).toBe("f1");
    expect(next.planets[0].population).toBe(92);
    expect(next.planets[1].ownerFactionId).toBeNull();
    expect(popHit).toBe(8);
  });
});

describe("shouldOccupyAfterEngage", () => {
  const a = { id: "a", factionId: "f1", kind: "legion", systemId: "s1" };
  const b = { id: "b", factionId: "f2", kind: "legion", systemId: "s1" };

  it("occupies when attacker legion wins and no enemy legion remains", () => {
    expect(shouldOccupyAfterEngage({
      outcome: "win_a",
      forceA: a,
      forceB: b,
      remainingForces: [{ ...a, composition: [{}] }],
    })).toBe("f1");
  });

  it("does not occupy while an enemy legion remains", () => {
    expect(shouldOccupyAfterEngage({
      outcome: "win_a",
      forceA: a,
      forceB: b,
      remainingForces: [a, b],
    })).toBeNull();
  });

  it("does not occupy fleet fights", () => {
    expect(shouldOccupyAfterEngage({
      outcome: "win_a",
      forceA: { ...a, kind: "fleet" },
      forceB: { ...b, kind: "fleet" },
      remainingForces: [{ ...a, kind: "fleet" }],
    })).toBeNull();
  });
});

describe("shouldOccupyEmptySystem", () => {
  it("occupies an enemy-owned system with no enemy legion", () => {
    const force = { id: "a", factionId: "f1", kind: "legion", systemId: "s1" };
    expect(shouldOccupyEmptySystem({
      force,
      system: { id: "s1", ownerFactionId: "f2" },
      remainingForces: [force],
    })).toBe("f1");
  });

  it("does not occupy while an enemy legion is present", () => {
    const force = { id: "a", factionId: "f1", kind: "legion", systemId: "s1" };
    expect(shouldOccupyEmptySystem({
      force,
      system: { id: "s1", ownerFactionId: "f2" },
      remainingForces: [force, { id: "b", factionId: "f2", kind: "legion", systemId: "s1" }],
    })).toBeNull();
  });
});
