import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { slotRingPositions } from "./slotRing.ts";

describe("slotRingPositions", () => {
  it("returns nothing for empty hulls", () => {
    assert.deepEqual(slotRingPositions(0), []);
  });

  it("parks a single slot at 12 o'clock", () => {
    assert.deepEqual(slotRingPositions(1, 50, 50, 36), [{ x: 50, y: 14 }]);
  });

  it("spreads four slots on a circle", () => {
    const pts = slotRingPositions(4, 50, 50, 36);
    assert.equal(pts.length, 4);
    assert.ok(Math.abs(pts[0].x - 50) < 1e-9);
    assert.ok(Math.abs(pts[0].y - 14) < 1e-9);
    assert.ok(Math.abs(pts[1].x - 86) < 1e-9);
    assert.ok(Math.abs(pts[1].y - 50) < 1e-9);
  });
});
