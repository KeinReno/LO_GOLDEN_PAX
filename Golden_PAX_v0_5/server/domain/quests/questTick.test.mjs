/**
 * Behavior tests: rollRecurringQuests uses real crypto randomness (bounds
 * only, like domain/combat/dice.test.mjs); selectYearlyQuestPool has no
 * GMap equivalent to diff against (it was inline in rollYearlyQuests, not
 * its own function) and also uses Math.random for its shuffle.
 */
import { describe, it, expect } from "vitest";
import { rollRecurringQuests, selectYearlyQuestPool } from "./questTick.mjs";

describe("rollRecurringQuests", () => {
  it("count is a 1d6 roll", () => {
    for (let i = 0; i < 50; i++) {
      const { count, roll } = rollRecurringQuests();
      expect(count).toBe(roll);
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(6);
    }
  });
});

describe("selectYearlyQuestPool", () => {
  const era3 = { era: 3, warCount: 0, hasRefugees: false, borderWithWar: false, hasRace: () => false, hasBuilding: () => false, lowLoyaltyRace: () => false, arcActive: () => false };

  it("always returns exactly `count` defs when enough neutrals exist", () => {
    const defs = [
      { id: "d.war", filterBy: { minEra: 5 } },
      { id: "d.neutral1", neutral: true },
      { id: "d.neutral2", neutral: true },
      { id: "d.neutral3", neutral: true },
    ];
    const picked = selectYearlyQuestPool(defs, era3, 3);
    expect(picked).toHaveLength(3);
    // The era-5-only quest can't match era 3, so it must not be picked.
    expect(picked.some((d) => d.id === "d.war")).toBe(false);
  });

  it("includes a matching non-neutral def before padding with neutrals", () => {
    const defs = [{ id: "d.match", filterBy: { minEra: 1 } }, { id: "d.neutral", neutral: true }];
    const picked = selectYearlyQuestPool(defs, era3, 1);
    expect(picked).toHaveLength(1);
  });

  it("never returns more than `count` even with a large matching pool", () => {
    const defs = Array.from({ length: 10 }, (_, i) => ({ id: `d${i}`, neutral: true }));
    expect(selectYearlyQuestPool(defs, era3, 2)).toHaveLength(2);
  });
});
