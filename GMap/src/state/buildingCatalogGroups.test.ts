import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildingCatalogGroupId,
  buildingCatalogGroupLabel,
} from "./buildingCatalogGroups.ts";

describe("buildingCatalogGroupId", () => {
  it("maps kinds to player-facing catalog groups", () => {
    assert.equal(buildingCatalogGroupId("mine"), "extraction");
    assert.equal(buildingCatalogGroupId("lab"), "science");
    assert.equal(buildingCatalogGroupId("barracks"), "military");
    assert.equal(buildingCatalogGroupId("residential"), "housing");
    assert.equal(buildingCatalogGroupLabel("factory"), "Промышленность");
  });
});
