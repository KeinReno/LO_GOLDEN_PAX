/**
 * Behavior test for the reshaped functions (applyVeterancyToGroup,
 * awardVeterancyXp) — see veterancy.mjs's header for why these can't be
 * diffed directly against GMap's `.ref`-mutating originals.
 */
import { describe, it, expect } from "vitest";
import { applyVeterancyToGroup, awardVeterancyXp } from "./veterancy.mjs";

const content = {
  rules: {
    veterancy: {
      thresholds: [0, 100],
      bonuses: [{}, { stat_mult: { damage: 1.5, hp: 1.2 } }],
      xpPerBattle: 50,
    },
  },
};

describe("applyVeterancyToGroup", () => {
  it("applies no bonus at level 0", () => {
    const group = { damage: 10, hp: 100, maxHp: 100, xp: 0 };
    const result = applyVeterancyToGroup(group, content);
    expect(result.damage).toBe(10);
    expect(result.level).toBe(0);
  });

  it("applies the level's stat_mult bonus once xp crosses the threshold", () => {
    const group = { damage: 10, hp: 100, maxHp: 100, xp: 150 };
    const result = applyVeterancyToGroup(group, content);
    expect(result.level).toBe(1);
    expect(result.damage).toBe(15);
    expect(result.hp).toBe(120);
    expect(result.maxHp).toBe(120);
  });

  it("does not mutate the input group", () => {
    const group = { damage: 10, hp: 100, maxHp: 100, xp: 150 };
    applyVeterancyToGroup(group, content);
    expect(group.damage).toBe(10);
  });
});

describe("awardVeterancyXp", () => {
  it("adds xpPerBattle to alive, non-stationary groups only", () => {
    const groups = [
      { count: 5, xp: 0 },
      { count: 0, xp: 0 },
      { count: 3, xp: 0, stationary: true },
    ];
    const result = awardVeterancyXp(groups, content);
    expect(result[0].xp).toBe(50);
    expect(result[1].xp).toBe(0);
    expect(result[2].xp).toBe(0);
  });
});
