import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { catalogsFromContent } from "./viewerContentCatalogs.ts";

describe("catalogsFromContent", () => {
  it("null content is a no-op", () => {
    assert.equal(catalogsFromContent(null), null);
  });

  it("empty content is a no-op", () => {
    assert.equal(catalogsFromContent({}), null);
  });

  it("copies present catalogs", () => {
    const patch = catalogsFromContent({
      ships: { s1: { id: "s1", name: "Scout" } },
      units: { u1: { id: "u1", name: "Levy" } },
      map_resources: {
        ore: { id: "ore", name: "Ore", category: "A" },
      },
    });
    assert.equal(patch?.shipsCatalog?.s1.name, "Scout");
    assert.equal(patch?.unitsCatalog?.u1.name, "Levy");
    assert.equal(patch?.mapResourcesCatalog?.ore.name, "Ore");
    assert.equal(patch?.buildingsCatalog, undefined);
  });
});
