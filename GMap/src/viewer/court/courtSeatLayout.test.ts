import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { courtSeatOffset } from "./courtSeatLayout.ts";

describe("courtSeatOffset", () => {
  it("puts 0° on the right and −90° on the top", () => {
    const right = courtSeatOffset(0);
    const top = courtSeatOffset(-90);
    assert.equal(Math.round(right.left), 87);
    assert.equal(Math.round(right.top), 50);
    assert.equal(Math.round(top.left), 50);
    assert.equal(Math.round(top.top), 13);
  });

  it("puts 180° on the left and 90° on the bottom", () => {
    const left = courtSeatOffset(180);
    const bottom = courtSeatOffset(90);
    assert.equal(Math.round(left.left), 13);
    assert.equal(Math.round(left.top), 50);
    assert.equal(Math.round(bottom.left), 50);
    assert.equal(Math.round(bottom.top), 87);
  });
});
