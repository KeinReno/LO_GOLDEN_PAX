import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  catalogZoneMatchesList,
  defaultGmCatalogBuilding,
  listGmCatalogBuildings,
  patchFromCatalogDef,
} from "./gmCatalogBuildings.ts";

const catalog = {
  "housing.block": {
    id: "housing.block",
    name: "Кварталы",
    kind: "residential",
    zone: "surface",
    tier: 1,
    faction: "generic",
  },
  "extract.ore": {
    id: "extract.ore",
    name: "Шахта",
    kind: "mine",
    zone: "subsurface",
    tier: 1,
  },
  "port.dock": {
    id: "port.dock",
    name: "Док",
    kind: "spaceport",
    zone: "orbital",
    tier: 2,
  },
  "ghost.stub": {
    id: "ghost.stub",
    name: "Заглушка",
    kind: "custom",
    zone: "surface",
    stub: true,
  },
};

describe("gm catalog buildings", () => {
  it("puts subsurface on the surface list and orbital on orbital", () => {
    assert.equal(catalogZoneMatchesList("subsurface", "surface"), true);
    assert.equal(catalogZoneMatchesList("orbital", "surface"), false);
    assert.equal(catalogZoneMatchesList("orbital", "orbital"), true);
    const surface = listGmCatalogBuildings(catalog, "surface").map((d) => d.id);
    assert.deepEqual(surface, ["housing.block", "extract.ore"]);
    assert.deepEqual(
      listGmCatalogBuildings(catalog, "orbital").map((d) => d.id),
      ["port.dock"],
    );
  });

  it("defaults to residential / spaceport when present", () => {
    assert.equal(defaultGmCatalogBuilding(catalog, "surface")?.id, "housing.block");
    assert.equal(defaultGmCatalogBuilding(catalog, "orbital")?.id, "port.dock");
  });

  it("writes buildingId and keeps a custom name", () => {
    const fresh = patchFromCatalogDef(catalog["housing.block"]!);
    assert.equal(fresh.buildingId, "housing.block");
    assert.equal(fresh.name, "Кварталы");
    const renamed = patchFromCatalogDef(catalog["extract.ore"]!, {
      name: "Солариевые шахты Солис",
      kind: "residential",
    });
    assert.equal(renamed.buildingId, "extract.ore");
    assert.equal(renamed.kind, "mine");
    assert.equal(renamed.zone, "subsurface");
    assert.equal(renamed.name, "Солариевые шахты Солис");
  });
});
