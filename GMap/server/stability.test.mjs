/**
 * stability_add feeds planet loyalty. Occupation planet.stability is ignored
 * by loyalty (revolt meter is stabilityRevolt.mjs).
 * Run: node --test server/stability.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collectPlanetStabilityEffects,
  stabilityLoyaltyDelta,
} from "./stability.mjs";
import { computePlanetLoyalty, loyaltyTick } from "./loyalty.mjs";

function fixture(extraFaction = {}, extraPlanet = {}, extraSystem = {}) {
  const planet = {
    id: "p1",
    ownerFactionId: "f1",
    population: 10,
    loyalty: 50,
    raceComposition: [{ raceId: "race_human", percent: 100 }],
    ...extraPlanet,
  };
  const system = {
    id: "s1",
    ownerFactionId: "f1",
    planets: [planet],
    ...extraSystem,
  };
  if (!system.planets.includes(planet)) system.planets = [planet];
  const world = {
    meta: { turn: 1 },
    factions: [
      {
        id: "f1",
        primaryRaceId: "race_human",
        activeEffects: [],
        traits: [],
        npcs: [],
        ...extraFaction,
      },
    ],
    systems: [system],
    loyaltyMatrix: {},
  };
  return { world, system, planet };
}

const emptyContent = {
  races: {},
  cultures: {},
  buildings: {},
  pois: {},
  faction_traits: { traits: {} },
  npc_postings: { postings: {} },
};

describe("stabilityLoyaltyDelta", () => {
  it("is 0 when no stability_add is present", () => {
    const { world, system, planet } = fixture();
    assert.equal(stabilityLoyaltyDelta(world, system, planet, emptyContent), 0);
    assert.equal(collectPlanetStabilityEffects(world, system, planet, emptyContent).length, 0);
  });

  it("faction-scoped stability_add raises loyalty delta", () => {
    const { world, system, planet } = fixture({
      activeEffects: [{ effect: "stability_add", args: { amount: 4 } }],
    });
    assert.equal(stabilityLoyaltyDelta(world, system, planet, emptyContent), 4);
  });

  it("negative stability_add lowers loyalty delta", () => {
    const { world, system, planet } = fixture({
      activeEffects: [{ effect: "stability_add", args: { amount: -3 } }],
    });
    assert.equal(stabilityLoyaltyDelta(world, system, planet, emptyContent), -3);
  });

  it("system-scoped effect applies only on the matching system", () => {
    const { world, system, planet } = fixture({
      activeEffects: [
        {
          effect: "stability_add",
          args: { amount: 6 },
          scope: "system",
          targetId: "s1",
        },
        {
          effect: "stability_add",
          args: { amount: 9 },
          scope: "system",
          targetId: "other",
        },
      ],
    });
    assert.equal(stabilityLoyaltyDelta(world, system, planet, emptyContent), 6);
  });

  it("stacks building + trait + activeEffects through modifierStack", () => {
    const content = {
      ...emptyContent,
      buildings: {
        "bios.medical": {
          id: "bios.medical",
          name: "Med",
          effects: [{ effect: "stability_add", args: { amount: 1 } }],
        },
      },
      faction_traits: {
        traits: {
          "trait.frontier_culture": {
            id: "trait.frontier_culture",
            name: "Frontier",
            effects: [{ effect: "stability_add", args: { amount: -1 } }],
          },
        },
      },
    };
    const { world, system, planet } = fixture(
      {
        traits: ["trait.frontier_culture"],
        activeEffects: [{ effect: "stability_add", args: { amount: 2 } }],
      },
      { surfaceBuildings: [{ buildingId: "bios.medical" }] },
    );
    assert.equal(stabilityLoyaltyDelta(world, system, planet, content), 2);
  });
});

describe("computePlanetLoyalty consumes stability_add", () => {
  it("effect applied → loyalty moves up; missing effect → unchanged vs baseline", () => {
    const baseline = fixture();
    const withFx = fixture({
      activeEffects: [{ effect: "stability_add", args: { amount: 5 } }],
    });
    const a = computePlanetLoyalty(
      baseline.world,
      baseline.system,
      baseline.planet,
      emptyContent,
    );
    const b = computePlanetLoyalty(
      withFx.world,
      withFx.system,
      withFx.planet,
      emptyContent,
    );
    assert.equal(b - a, 5);
    assert.equal(a, computePlanetLoyalty(
      fixture().world,
      fixture().system,
      fixture().planet,
      emptyContent,
    ));
  });

  it("loyaltyTick writes the shifted loyalty onto the planet", () => {
    const { world } = fixture({
      activeEffects: [{ effect: "stability_add", args: { amount: 7 } }],
    });
    const none = fixture();
    loyaltyTick(none.world, "f1", emptyContent);
    loyaltyTick(world, "f1", emptyContent);
    const without = none.world.systems[0].planets[0].loyalty;
    const withFx = world.systems[0].planets[0].loyalty;
    assert.equal(withFx - without, 7);
  });
});

describe("loyalty ignores occupation planet.stability", () => {
  it("stability 47 vs unset does not change loyalty", () => {
    const a = fixture();
    const b = fixture({}, { stability: 47 });
    const la = computePlanetLoyalty(a.world, a.system, a.planet, emptyContent);
    const lb = computePlanetLoyalty(b.world, b.system, b.planet, emptyContent);
    assert.equal(lb, la);
  });
});
