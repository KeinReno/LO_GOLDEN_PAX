/**
 * New-design tests (NOT a port — GMap has no revolt mechanic).
 * Stage 2 reuses boarding's syntheticCrewGroup; contingent retreat reuses
 * resolveExchange's <80% disengage (same pattern as boarding.test.mjs).
 */
import { describe, it, expect } from "vitest";
import { syntheticCrewGroup } from "../combat/boarding.mjs";
import {
  revoltStage,
  spawnRebelForce,
  rebelCount,
  resolveRebelEngagement,
  resolveSecession,
  shouldSecede,
  pickHotspotPlanet,
  majorityRaceId,
  rebelFactionId,
} from "./revolt.mjs";

const militia = {
  id: "unit.militia",
  tier: 1,
  roles: ["infantry", "militia"],
  stats: { damage: 8, defense: 8, hp: 70, speed: 4 },
};
const content = {
  units: { "unit.militia": militia },
  combat_matchups: {},
  rules: {},
  economy_balance: {
    stability: {
      stage1Threshold: 40,
      stage2Threshold: 25,
      stage3DurationTurns: 3,
      rebelPopShare: 0.2,
    },
  },
};

const planet = {
  id: "p1",
  name: "Helios",
  systemId: "sys1",
  population: 50,
  ownerFactionId: "fA",
  raceComposition: [{ raceId: "race_belator", percent: 80 }, { raceId: "race_human", percent: 20 }],
};

function garrison(count) {
  return {
    id: "gar-1",
    kind: "legion",
    factionId: "fA",
    composition: [syntheticCrewGroup(count, militia)],
  };
}

describe("revoltStage bands", () => {
  it("maps faction stability onto distinct ordered stages", () => {
    expect(revoltStage({ stability: 50 }, planet, content)).toBe(0);
    expect(revoltStage({ stability: 39 }, planet, content)).toBe(1);
    expect(revoltStage({ stability: 24 }, planet, content)).toBe(2);
  });
});

describe("spawnRebelForce — boarding crew pattern", () => {
  it("is militia-shaped from unit.militia stats, count from population × deficit", () => {
    const spawned = spawnRebelForce(planet, content, { stability: 0, turn: 7 });
    const expectedCount = rebelCount(planet, 0, content);
    expect(expectedCount).toBe(Math.max(1, Math.floor(50 * 0.2 * (25 - 0) / 25)));
    expect(spawned.composition[0]).toMatchObject({
      defId: "unit.militia",
      count: expectedCount,
      damage: 8,
      defense: 8,
      hp: 70,
      speed: 4,
      maxHp: 70,
    });
    expect(spawned.composition[0]).toEqual(syntheticCrewGroup(expectedCount, militia));
    expect(spawned.kind).toBe("legion");
    expect(spawned.factionId).toBe(rebelFactionId("p1", 7));
  });

  it("does not spend planet population", () => {
    const before = planet.population;
    spawnRebelForce(planet, content, { stability: 10 });
    expect(planet.population).toBe(before);
  });
});

describe("contingent retreat (boarding pattern)", () => {
  it("rebels retreat without a fight when heavily outmatched", () => {
    const rebels = spawnRebelForce({ ...planet, population: 10 }, content, { stability: 24, factionId: "rebel.p1.1" });
    const result = resolveRebelEngagement(garrison(40), rebels, content);
    expect(result.ok).toBe(true);
    expect(result.outcome).toBe("retreat_b");
    expect(result.lossesA).toEqual([]);
    expect(result.lossesB).toEqual([]);
  });

  it("rebels fight when they are not under the 80% retreat floor", () => {
    const rebels = spawnRebelForce({ ...planet, population: 100 }, content, { stability: 0, factionId: "rebel.p1.1" });
    const result = resolveRebelEngagement(garrison(1), rebels, content);
    expect(result.ok).toBe(true);
    expect(result.outcome).not.toBe("retreat_b");
  });
});

describe("secession plan", () => {
  it("mints a real faction payload with inherited race and planet transfer", () => {
    const rebels = spawnRebelForce(planet, content, { stability: 0, turn: 12 });
    const plan = resolveSecession({ id: "fA", raceId: "race_human" }, planet, { ...rebels, id: "force-r", spawnTurn: 12 }, 15, content);
    expect(plan.newFaction).toMatchObject({
      id: rebelFactionId("p1", 12),
      name: "Breakaway of Helios",
      raceId: "race_belator",
      isNpc: true,
    });
    expect(plan.newFaction.colorHex).toMatch(/^#[0-9a-f]{6}$/);
    expect(plan.planetId).toBe("p1");
    expect(plan.sourceFactionId).toBe("fA");
    expect(plan.population).toBe(50);
    expect(majorityRaceId(planet, "race_human")).toBe("race_belator");
  });

  it("secedes after stage3DurationTurns, not on the spawn tick", () => {
    expect(shouldSecede({ stage2SinceTurn: 10 }, 10, content)).toBe(false);
    expect(shouldSecede({ stage2SinceTurn: 10 }, 12, content)).toBe(false);
    expect(shouldSecede({ stage2SinceTurn: 10 }, 13, content)).toBe(true);
  });
});

describe("hotspot pick", () => {
  it("picks the most populated owned planet", () => {
    const hot = pickHotspotPlanet([
      { id: "a", population: 3 },
      { id: "b", population: 0 },
      { id: "c", population: 9 },
    ]);
    expect(hot.id).toBe("c");
  });
});
