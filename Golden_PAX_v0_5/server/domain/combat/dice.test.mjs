import { describe, it, expect } from "vitest";
import { rollDie, rollDice } from "./dice.mjs";

describe("rollDie / rollDice", () => {
  it("rollDie stays within [1, sides]", () => {
    for (let i = 0; i < 200; i++) {
      const v = rollDie(6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
    }
  });

  it("rollDice returns the requested count, each within bounds", () => {
    const rolls = rollDice({ count: 5, sides: 20 });
    expect(rolls).toHaveLength(5);
    for (const v of rolls) {
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(20);
    }
  });
});
