import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildResourceIndex,
  isCraftedModule,
  isMapDeposit,
  isPaintDeposit,
  lookupContentResource,
  outfitResourceBag,
} from "./resourceIndex.ts";
import type { MapResourceDef } from "./contentCatalog.ts";

const hydrogen: MapResourceDef = {
  id: "map.hydrogen",
  name: "водород",
  category: "D",
  tier: 1,
};
const laser: MapResourceDef = {
  id: "module.space.light_laser",
  name: "Лёгкий лазер",
  kind: "module",
  theater: "space",
  category: "D",
  tier: 1,
  notDeposit: true,
};

describe("isMapDeposit", () => {
  it("keeps planet deposits and drops crafted outfit modules", () => {
    assert.equal(isMapDeposit(hydrogen), true);
    assert.equal(isCraftedModule(laser), true);
    assert.equal(isMapDeposit(laser), false);
    assert.equal(isMapDeposit({ id: "map.ice", notDeposit: true }), false);
    assert.equal(isMapDeposit({ id: "map.trade_value", category: null }), false);
  });
});

describe("isPaintDeposit", () => {
  it("keeps ores and drops abstract stubs", () => {
    assert.equal(isPaintDeposit(hydrogen), true);
    assert.equal(isPaintDeposit({ id: "map.alloys", stub: true, category: "B" }), false);
    assert.equal(isPaintDeposit({ id: "map.energy", category: "D" }), false);
    assert.equal(isPaintDeposit(laser), false);
  });
});

describe("buildResourceIndex", () => {
  it("omits stub tiles from byCategoryDeposits", () => {
    const index = buildResourceIndex({
      "map.hydrogen": hydrogen,
      "map.alloys": {
        id: "map.alloys",
        name: "сплавы",
        category: "B",
        tier: 3,
        stub: true,
      },
      "module.space.light_laser": laser,
    });
    assert.equal(index.byCategory.D?.length, 2);
    assert.deepEqual(
      index.byCategoryDeposits.D?.map((r) => r.id),
      ["map.hydrogen"],
    );
    assert.equal(index.byCategoryDeposits.B, undefined);
  });
});

describe("outfitResourceBag", () => {
  it("merges modules without putting them in the deposit-only bag", () => {
    const bag = outfitResourceBag({
      map_resources: { "map.hydrogen": hydrogen },
      modules: { "module.space.light_laser": laser },
    });
    assert.equal(bag["map.hydrogen"]?.name, "водород");
    assert.equal(bag["module.space.light_laser"]?.theater, "space");
    assert.equal(lookupContentResource({ map_resources: { "map.hydrogen": hydrogen } }, "module.space.light_laser"), undefined);
    assert.equal(
      lookupContentResource(
        { modules: { "module.space.light_laser": laser } },
        "module.space.light_laser",
      )?.kind,
      "module",
    );
  });
});
