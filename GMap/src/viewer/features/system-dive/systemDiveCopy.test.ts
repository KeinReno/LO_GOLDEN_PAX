import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attackSystemTitle,
  catalogDisplayNames,
  claimSystemTitle,
  systemDiveBackLabel,
} from "./systemDiveCopy.ts";

describe("systemDiveCopy", () => {
  it("back label", () => {
    assert.equal(systemDiveBackLabel(true), "← Экономика");
    assert.equal(systemDiveBackLabel(false), "← Галактика");
  });

  it("catalog names fall back to id", () => {
    assert.deepEqual(catalogDisplayNames({ a: { name: "A" }, b: {} }), {
      a: "A",
      b: "b",
    });
  });

  it("claim / attack titles", () => {
    assert.match(claimSystemTitle({ hasFleet: false, ownSystem: false }), /флот/);
    assert.match(claimSystemTitle({ hasFleet: true, ownSystem: true }), /контролем/);
    assert.match(attackSystemTitle({ hasFleet: true, ownSystem: false }), /Атаковать/);
  });
});
