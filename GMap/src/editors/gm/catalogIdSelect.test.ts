import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterCatalogOptions } from "./catalogIdFilter.ts";

describe("filterCatalogOptions", () => {
  const opts = [
    { id: "tech.geology", name: "Геология" },
    { id: "tech.void_shield", name: "Щит пустоты" },
  ];

  it("matches Russian names without requiring the id", () => {
    const hit = filterCatalogOptions(opts, "гео");
    assert.equal(hit.length, 1);
    assert.equal(hit[0]?.id, "tech.geology");
  });

  it("returns all when query is empty", () => {
    assert.equal(filterCatalogOptions(opts, "  ").length, 2);
  });
});
