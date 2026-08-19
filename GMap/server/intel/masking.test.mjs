/**
 * Intel faction mask: L1–L3 expose opinionTowardViewer, not full diplomacy.
 * Run: node --test server/intel/masking.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { maskFactionForIntel } from "./masking.mjs";

const viewer = "polity.a";
const other = {
  id: "polity.b",
  name: "Beta",
  color: "#0ff",
  password: "secret",
  notes: "hidden",
  diplomacy: {
    opinions: { [viewer]: 42, "polity.c": -10 },
    treaties: [{ id: "t1", type: "trade", withFactionId: viewer }],
  },
};

describe("maskFactionForIntel", () => {
  it("L1 keeps their opinion of the viewer without diplomacy bag", () => {
    const masked = maskFactionForIntel(other, 1, viewer);
    assert.equal(masked.opinionTowardViewer, 42);
    assert.equal(masked.diplomacy, undefined);
    assert.equal(masked.password, undefined);
    assert.equal(masked.notes, undefined);
  });

  it("L3 still exposes opinionTowardViewer", () => {
    const masked = maskFactionForIntel(other, 3, viewer);
    assert.equal(masked.opinionTowardViewer, 42);
    assert.equal(masked.diplomacy, undefined);
  });

  it("own faction is not masked as a contact row", () => {
    const own = maskFactionForIntel(other, 1, other.id);
    assert.equal(own.diplomacy.opinions[viewer], 42);
    assert.equal(own.opinionTowardViewer, undefined);
  });
});
