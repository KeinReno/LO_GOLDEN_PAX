import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Planet } from "../../state/types.ts";
import type {
  BuildingDef,
  PlanetActionRequest,
} from "../../viewer/PlayerPlanetManage.tsx";
import {
  applyGmPlanetAction,
  GM_SPAWN_CENSUS,
} from "./applyGmPlanetAction.ts";

function planet(partial: Partial<Planet> = {}): Planet {
  return {
    id: "p1",
    name: "Ada",
    type: "terrestrial",
    climate: "temperate",
    orbitIndex: 1,
    size: 1,
    population: 0,
    colonyType: "none",
    raceComposition: [],
    resources: [],
    surfaceSlots: 8,
    orbitalSlots: 4,
    surfaceBuildings: [],
    orbitalBuildings: [],
    ...partial,
  } as Planet;
}

const buildings: Record<string, BuildingDef> = {
  "building.mine": {
    id: "building.mine",
    name: "Шахта",
    kind: "mine",
    zone: "surface",
  },
  "building.yard": {
    id: "building.yard",
    name: "Верфь",
    kind: "shipyard",
    zone: "orbital",
  },
};

function req(
  action: PlanetActionRequest["action"],
  extra: Partial<PlanetActionRequest> = {},
): PlanetActionRequest {
  return { action, systemId: "s", planetId: "p1", ...extra };
}

const ids = (() => {
  let n = 0;
  return () => `id${++n}`;
})();

describe("applyGmPlanetAction", () => {
  it("spawns census when colonizing empty without a source", () => {
    const r = applyGmPlanetAction(planet(), req("colonize", { colonyType: "outpost" }), {
      buildings,
      factionId: "f1",
      nextId: ids,
    });
    assert.equal(r?.planet.colonyType, "outpost");
    assert.equal(r?.planet.ownerFactionId, "f1");
    assert.equal(r?.planet.population, GM_SPAWN_CENSUS);
    assert.equal(r?.source, undefined);
  });

  it("transfers settlers from a source world", () => {
    const src = planet({ id: "src", population: 40_000 });
    const r = applyGmPlanetAction(
      planet(),
      req("colonize", { colonyType: "colony", sourcePlanetId: "src" }),
      { buildings, factionId: "f1", nextId: ids, sourcePlanet: src },
    );
    assert.equal(r?.planet.population, 4_000);
    assert.equal(r?.source?.planetId, "src");
    assert.equal(r?.source?.patch.population, 36_000);
  });

  it("places a surface building without cost", () => {
    const r = applyGmPlanetAction(
      planet({ population: 12_000, colonyType: "core" }),
      req("build", { buildingId: "building.mine" }),
      { buildings, factionId: "f1", nextId: () => "b1" },
    );
    assert.equal(r?.planet.surfaceBuildings?.length, 1);
    assert.equal(r?.planet.surfaceBuildings?.[0]?.buildingId, "building.mine");
    assert.equal(r?.planet.orbitalBuildings, undefined);
  });

  it("refuses a building when slots are full", () => {
    const r = applyGmPlanetAction(
      planet({
        surfaceSlots: 1,
        surfaceBuildings: [
          { id: "x", name: "Жильё", kind: "residential", zone: "surface" },
        ],
      }),
      req("build", { buildingId: "building.mine" }),
      { buildings, factionId: "f1", nextId: ids },
    );
    assert.equal(r, null);
  });

  it("demolishes by instance id", () => {
    const r = applyGmPlanetAction(
      planet({
        surfaceBuildings: [
          { id: "gone", name: "Шахта", kind: "mine", zone: "surface" },
        ],
      }),
      req("demolish", { instanceId: "gone" }),
      { buildings, factionId: "f1", nextId: ids },
    );
    assert.deepEqual(r?.planet.surfaceBuildings, []);
  });

  it("upgrades surface grade without cost", () => {
    const r = applyGmPlanetAction(
      planet({ grade: 1, surfaceSlots: 8 }),
      req("upgrade_grade"),
      { buildings, factionId: "f1", nextId: ids },
    );
    assert.equal(r?.planet.grade, 2);
    assert.equal(r?.planet.surfaceSlots, 18);
  });
});
