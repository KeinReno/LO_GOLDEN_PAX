import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { weightedHpRatio } from "./forceHp.ts";

describe("weightedHpRatio", () => {
  it("returns null when empty or zero count", () => {
    assert.equal(weightedHpRatio([]), null);
    assert.equal(weightedHpRatio([{ maxHp: 100, count: 0 }]), null);
  });

  it("treats missing hp as full", () => {
    assert.equal(weightedHpRatio([{ maxHp: 80, count: 2 }]), 1);
  });

  it("weights stacks by count", () => {
    const ratio = weightedHpRatio([
      { hp: 50, maxHp: 100, count: 1 },
      { hp: 100, maxHp: 100, count: 3 },
    ]);
    assert.equal(ratio, 0.875);
  });

  it("clamps overcap hp", () => {
    assert.equal(weightedHpRatio([{ hp: 200, maxHp: 100, count: 1 }]), 1);
  });
});
