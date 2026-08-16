import { describe, it, expect } from "vitest";
import { mobilizableRecruits, populationCostForRaise, crewCountForRaise, OVER_CEILING_POPULATION_MULT } from "./recruits.mjs";

describe("mobilizableRecruits", () => {
  it("floors population * rate", () => {
    expect(mobilizableRecruits({ population: 10 }, 0.3)).toBe(3);
    expect(mobilizableRecruits({ population: 100 }, 0.3)).toBe(30);
  });

  it("clamps rate to [0,1] and handles missing/zero population", () => {
    expect(mobilizableRecruits({ population: 10 }, 5)).toBe(10); // clamped to 1.0
    expect(mobilizableRecruits({ population: 10 }, -1)).toBe(0);
    expect(mobilizableRecruits({}, 0.3)).toBe(0);
  });
});

describe("populationCostForRaise", () => {
  it("is 1:1 without override, including above the ceiling (caller rejects that)", () => {
    expect(populationCostForRaise(5, 3, false)).toBe(5);
    expect(populationCostForRaise(2, 3, false)).toBe(2);
  });

  it("charges 1:1 within the ceiling and 1.5x (ceil'd) for the overflow when overriding", () => {
    expect(OVER_CEILING_POPULATION_MULT).toBe(1.5);
    // 3 within + ceil(2 * 1.5) = 3 + 3 = 6
    expect(populationCostForRaise(5, 3, true)).toBe(6);
    // no overflow — same as 1:1
    expect(populationCostForRaise(3, 3, true)).toBe(3);
  });
});

describe("crewCountForRaise", () => {
  it("is count × tier × crewPerTier for ships, 0 for units", () => {
    expect(crewCountForRaise("ship", { tier: 1 }, 1, 5)).toBe(5);
    expect(crewCountForRaise("ship", { tier: 2 }, 3, 5)).toBe(30);
    expect(crewCountForRaise("unit", { tier: 1 }, 4, 5)).toBe(0);
  });
});
