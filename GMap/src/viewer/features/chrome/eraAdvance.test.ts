import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decideEraAdvance,
  eraSeenStorageKey,
  maxTechEra,
} from "./eraAdvance.ts";

describe("maxTechEra", () => {
  it("stays 1 without unlocks", () => {
    assert.equal(maxTechEra({ a: { id: "a", era: 4 } }, []), 1);
  });

  it("takes max unlocked era", () => {
    assert.equal(
      maxTechEra(
        { a: { id: "a", era: 2 }, b: { id: "b", era: 4 } },
        ["b"],
      ),
      4,
    );
  });
});

describe("decideEraAdvance", () => {
  it("seeds first visit without banner", () => {
    assert.deepEqual(decideEraAdvance(0, 3), { kind: "seed", era: 3 });
  });

  it("skips when era did not grow", () => {
    assert.deepEqual(decideEraAdvance(2, 2), { kind: "skip" });
  });

  it("advances when era grew", () => {
    assert.deepEqual(decideEraAdvance(2, 4), { kind: "advance", era: 4 });
  });
});

describe("eraSeenStorageKey", () => {
  it("scopes by faction", () => {
    assert.equal(eraSeenStorageKey("f1"), "gmap-era-seen-f1");
  });
});
