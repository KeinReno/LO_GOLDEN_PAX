import { describe, it, expect } from "vitest";
import { stanceMult } from "./stance.mjs";

describe("stanceMult", () => {
  it("looks up the stance from content.combat_stances", () => {
    const content = { combat_stances: { aggressive: { powerMult: 1.3, casualtyTakenMult: 1.2 } } };
    expect(stanceMult(content, "aggressive")).toEqual({ powerMult: 1.3, casualtyTakenMult: 1.2 });
  });

  it("falls back to a neutral default for an unknown/missing stance", () => {
    expect(stanceMult({}, "hold")).toEqual({ powerMult: 1, casualtyTakenMult: 1 });
  });
});
