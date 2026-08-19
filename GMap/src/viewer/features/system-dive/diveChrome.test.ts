import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  groupStationsByRole,
  planetDiveTasks,
  planetRaiseGates,
} from "./diveChrome.ts";
import type { OrbitalStation, Planet } from "../../../state/types.ts";

function planet(partial: Partial<Planet>): Planet {
  return {
    id: "p1",
    name: "Test",
    type: "terrestrial",
    climate: "temperate",
    orbitIndex: 1,
    size: 1,
    ownerFactionId: "f1",
    population: 400_000,
    colonyType: "core",
    surfaceBuildings: [],
    orbitalBuildings: [],
    ...partial,
  } as Planet;
}

describe("planetRaiseGates", () => {
  it("opens army only with barracks", () => {
    const g = planetRaiseGates(
      planet({
        surfaceBuildings: [
          { id: "b1", name: "Казарма", kind: "barracks", zone: "surface" },
        ],
      }),
    );
    assert.equal(g.army, true);
    assert.equal(g.fleet, false);
  });

  it("opens fleet with yard or port", () => {
    const g = planetRaiseGates(
      planet({
        orbitalBuildings: [
          { id: "s1", name: "Верфь", kind: "shipyard", zone: "orbital" },
        ],
      }),
    );
    assert.equal(g.fleet, true);
    assert.equal(g.army, false);
  });
});

describe("planetDiveTasks", () => {
  it("foreign world is inspect-only", () => {
    assert.deepEqual(planetDiveTasks(planet({}), false), ["policy"]);
  });

  it("owned without yard has build people policy", () => {
    assert.deepEqual(planetDiveTasks(planet({}), true), [
      "build",
      "people",
      "policy",
    ]);
  });

  it("owned with barracks adds forces", () => {
    const tasks = planetDiveTasks(
      planet({
        surfaceBuildings: [
          { id: "b1", name: "Казарма", kind: "barracks", zone: "surface" },
        ],
      }),
      true,
    );
    assert.deepEqual(tasks, ["build", "people", "forces", "policy"]);
  });
});

describe("groupStationsByRole", () => {
  it("splits own vs other and drops empty roles", () => {
    const stations: OrbitalStation[] = [
      { id: "a", name: "A", kind: "mining", factionId: "me" },
      { id: "b", name: "B", kind: "mining", factionId: "them" },
      { id: "c", name: "C", kind: "military", factionId: "me" },
    ];
    const groups = groupStationsByRole(stations, "me");
    assert.equal(groups.length, 2);
    assert.equal(groups[0]?.kind, "mining");
    assert.equal(groups[0]?.own.length, 1);
    assert.equal(groups[0]?.other.length, 1);
    assert.equal(groups[1]?.kind, "military");
    assert.equal(groups[1]?.own.length, 1);
  });
});
