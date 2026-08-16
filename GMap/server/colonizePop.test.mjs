/**
 * Colonize population transfer + race mix (v0.5 port).
 * Run: node --test server/colonizePop.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  pickColonizeSource,
  transferColonizePopulation,
  withDeductedRacePopulation,
} from "./colonizePop.mjs";

function worldWith(home, dest, extraSystems = []) {
  return {
    factions: [{ id: "fA", primaryRaceId: "race_human" }],
    systems: [
      {
        id: "sys.home",
        ownerFactionId: "fA",
        planets: [home, dest],
      },
      ...extraSystems,
    ],
  };
}

const destEmpty = {
  id: "dest",
  population: 0,
  colonyType: "none",
  raceComposition: [],
};

describe("pickColonizeSource", () => {
  it("defaults to the highest-pop owned planet in the same system", () => {
    const small = {
      id: "small",
      population: 8,
      ownerFactionId: "fA",
      raceComposition: [{ raceId: "race_human", percent: 100 }],
    };
    const big = {
      id: "big",
      population: 40,
      ownerFactionId: "fA",
      raceComposition: [{ raceId: "race_human", percent: 100 }],
    };
    const owned = [
      { system: { id: "sys.home" }, planet: small },
      { system: { id: "sys.home" }, planet: big },
      { system: { id: "sys.home" }, planet: destEmpty },
    ];
    const picked = pickColonizeSource({
      owned,
      destPlanetId: "dest",
      destSystemId: "sys.home",
    });
    assert.equal(picked.ok, true);
    assert.equal(picked.source.planet.id, "big");
  });

  it("fails closed when the source is not owned or has no people", () => {
    const home = {
      id: "home",
      population: 10,
      ownerFactionId: "fA",
      raceComposition: [{ raceId: "race_human", percent: 100 }],
    };
    const owned = [{ system: { id: "sys.home" }, planet: home }];
    const foreign = pickColonizeSource({
      owned,
      destPlanetId: "dest",
      destSystemId: "sys.home",
      sourcePlanetId: "other",
    });
    assert.equal(foreign.ok, false);
    assert.equal(foreign.code, "source_not_owned");

    const empty = pickColonizeSource({
      owned: [
        {
          system: { id: "sys.home" },
          planet: { ...home, id: "empty", population: 0 },
        },
      ],
      destPlanetId: "dest",
      destSystemId: "sys.home",
      sourcePlanetId: "empty",
    });
    assert.equal(empty.ok, false);
    assert.equal(empty.code, "source_lacks_people");
  });

  it("falls back to the highest-pop owned planet in another system", () => {
    const home = {
      id: "home",
      population: 40,
      ownerFactionId: "fA",
      raceComposition: [{ raceId: "race_human", percent: 100 }],
    };
    const far = {
      id: "far",
      population: 12,
      ownerFactionId: "fA",
      raceComposition: [{ raceId: "race_human", percent: 100 }],
    };
    const picked = pickColonizeSource({
      owned: [
        { system: { id: "sys.home" }, planet: home },
        { system: { id: "sys.far" }, planet: far },
      ],
      destPlanetId: "dest",
      destSystemId: "sys.dest",
    });
    assert.equal(picked.ok, true);
    assert.equal(picked.source.planet.id, "home");
  });

  it("fails when the faction has no populated owned planet", () => {
    const emptyHome = {
      id: "empty",
      population: 0,
      ownerFactionId: "fA",
      raceComposition: [],
    };
    const picked = pickColonizeSource({
      owned: [{ system: { id: "sys.home" }, planet: emptyHome }],
      destPlanetId: "dest",
      destSystemId: "sys.dest",
    });
    assert.equal(picked.ok, false);
    assert.equal(picked.code, "source_lacks_people");

    const none = pickColonizeSource({
      owned: [],
      destPlanetId: "dest",
      destSystemId: "sys.dest",
    });
    assert.equal(none.ok, false);
    assert.equal(none.code, "source_lacks_people");
  });
});

describe("transferColonizePopulation", () => {
  it("moves settlers off the source and writes dest race mix", () => {
    const home = {
      id: "home",
      population: 50,
      ownerFactionId: "fA",
      raceComposition: [{ raceId: "race_human", percent: 100 }],
    };
    const dest = { ...destEmpty };
    const world = worldWith(home, dest);

    const result = transferColonizePopulation({
      world,
      destSystem: world.systems[0],
      destPlanet: dest,
      factionId: "fA",
      settlerCount: 2,
      founderRaceId: "race_human",
      rollDieFn: () => 1,
    });

    assert.equal(result.ok, true);
    assert.equal(result.destPopulation, 2);
    assert.deepEqual(result.destComposition, [
      { raceId: "race_human", percent: 100 },
    ]);
    assert.equal(home.population, 48);
    assert.deepEqual(home.raceComposition, [
      { raceId: "race_human", percent: 100 },
    ]);
  });

  it("rolls a mixed dest composition from a mixed source", () => {
    const home = {
      id: "home",
      population: 100,
      ownerFactionId: "fA",
      raceComposition: [
        { raceId: "race_human", percent: 80 },
        { raceId: "race_belator", percent: 20 },
      ],
    };
    const dest = { ...destEmpty };
    const world = worldWith(home, dest);

    const result = transferColonizePopulation({
      world,
      destSystem: world.systems[0],
      destPlanet: dest,
      factionId: "fA",
      settlerCount: 10,
      founderRaceId: "race_human",
      rollDieFn: () => 4,
      rng: () => 0.99,
    });

    assert.equal(result.ok, true);
    assert.equal(result.destPopulation, 10);
    assert.equal(result.diceRoll, 4);
    const byRace = Object.fromEntries(
      result.destComposition.map((r) => [r.raceId, r.percent]),
    );
    assert.equal(byRace.race_human, 80);
    assert.equal(byRace.race_belator, 20);
    assert.equal(home.population, 90);
  });

  it("fails when the source cannot cover the settler count", () => {
    const home = {
      id: "home",
      population: 1,
      ownerFactionId: "fA",
      raceComposition: [{ raceId: "race_human", percent: 100 }],
    };
    const dest = { ...destEmpty };
    const world = worldWith(home, dest);

    const result = transferColonizePopulation({
      world,
      destSystem: world.systems[0],
      destPlanet: dest,
      factionId: "fA",
      settlerCount: 5,
      founderRaceId: "race_human",
      rollDieFn: () => 1,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "source_lacks_people");
    assert.equal(home.population, 1);
  });

  it("uses an explicit owned sourcePlanetId", () => {
    const small = {
      id: "small",
      population: 20,
      ownerFactionId: "fA",
      raceComposition: [{ raceId: "race_human", percent: 100 }],
    };
    const big = {
      id: "big",
      population: 80,
      ownerFactionId: "fA",
      raceComposition: [{ raceId: "race_human", percent: 100 }],
    };
    const dest = { ...destEmpty };
    const world = {
      factions: [{ id: "fA", primaryRaceId: "race_human" }],
      systems: [
        { id: "sys.home", ownerFactionId: "fA", planets: [small, big, dest] },
      ],
    };

    const result = transferColonizePopulation({
      world,
      destSystem: world.systems[0],
      destPlanet: dest,
      factionId: "fA",
      settlerCount: 5,
      sourcePlanetId: "small",
      founderRaceId: "race_human",
      rollDieFn: () => 1,
    });
    assert.equal(result.ok, true);
    assert.equal(small.population, 15);
    assert.equal(big.population, 80);
  });

  it("transfers from another system when the dest system has no owned worlds", () => {
    const home = {
      id: "home",
      population: 50,
      ownerFactionId: "fA",
      raceComposition: [{ raceId: "race_human", percent: 100 }],
    };
    const dest = { ...destEmpty };
    const world = {
      factions: [{ id: "fA", primaryRaceId: "race_human" }],
      systems: [
        { id: "sys.home", ownerFactionId: "fA", planets: [home] },
        { id: "sys.dest", ownerFactionId: "fA", planets: [dest] },
      ],
    };

    const result = transferColonizePopulation({
      world,
      destSystem: world.systems[1],
      destPlanet: dest,
      factionId: "fA",
      settlerCount: 2,
      founderRaceId: "race_human",
      rollDieFn: () => 1,
    });
    assert.equal(result.ok, true);
    assert.equal(result.sourcePlanet.id, "home");
    assert.equal(home.population, 48);
    assert.equal(result.destPopulation, 2);
  });

  it("fails when the empire has no populated owned planet", () => {
    const dest = { ...destEmpty };
    const world = {
      factions: [{ id: "fA", primaryRaceId: "race_human" }],
      systems: [
        { id: "sys.dest", ownerFactionId: "fA", planets: [dest] },
      ],
    };

    const result = transferColonizePopulation({
      world,
      destSystem: world.systems[0],
      destPlanet: dest,
      factionId: "fA",
      settlerCount: 2,
      founderRaceId: "race_human",
      rollDieFn: () => 1,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "source_lacks_people");
    assert.equal(dest.population, 0);
  });
});

describe("withDeductedRacePopulation", () => {
  it("recomputes remaining mix after a partial take", () => {
    const next = withDeductedRacePopulation(
      {
        population: 10,
        raceComposition: [
          { raceId: "race_human", percent: 50 },
          { raceId: "race_belator", percent: 50 },
        ],
      },
      "race_human",
      5,
    );
    assert.equal(next.population, 5);
    assert.equal(next.raceComposition.length, 1);
    assert.equal(next.raceComposition[0].raceId, "race_belator");
    assert.equal(next.raceComposition[0].percent, 100);
  });
});
