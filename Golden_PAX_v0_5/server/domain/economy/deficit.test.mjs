/**
 * Behavior test, not a cross-repo diff: GMap's updateDeficit is a
 * module-private function inside economyTick.mjs (never exported), so it
 * can't be imported and diffed the way populationGrowth.mjs's function
 * is. These cases are re-derived directly from reading that function
 * (GMap/server/economyTick.mjs) — same thresholds, same "metal alone
 * never marks empty" rule.
 */
import { describe, it, expect } from "vitest";
import { resolveDeficit } from "./deficit.mjs";

const FULL_STOCKS = {
  "currency.materia": 100,
  "currency.energia": 100,
  "currency.bios": 100,
  "currency.supply": 200,
  "currency.metal": 200,
};

describe("resolveDeficit", () => {
  it("is ok with healthy stocks", () => {
    expect(resolveDeficit(FULL_STOCKS, {})).toBe("ok");
  });

  it("is empty when any critical stock hits zero", () => {
    expect(resolveDeficit({ ...FULL_STOCKS, "currency.materia": 0 }, {})).toBe("empty");
    expect(resolveDeficit({ ...FULL_STOCKS, "currency.bios": 0 }, {})).toBe("empty");
    expect(resolveDeficit({ ...FULL_STOCKS, "currency.supply": 0 }, {})).toBe("empty");
  });

  it("metal alone hitting zero never marks empty", () => {
    expect(resolveDeficit({ ...FULL_STOCKS, "currency.metal": 0 }, {})).toBe("ok");
  });

  it("is low when a critical stock is under the lowRatio band but not zero", () => {
    // default lowRatio 0.15, critical materia ref 40 -> low below 6
    expect(resolveDeficit({ ...FULL_STOCKS, "currency.materia": 5 }, {})).toBe("low");
  });

  it("metal under its soft band also triggers low (but not empty)", () => {
    // soft metal ref 80, lowRatio 0.15 -> low below 12
    expect(resolveDeficit({ ...FULL_STOCKS, "currency.metal": 5 }, {})).toBe("low");
  });

  it("respects a content-configured lowRatio", () => {
    const content = { rules: { deficit: { lowRatio: 0.5 } } };
    // materia ref 40 * 0.5 = 20 -> 15 is "low" (30 would still be "ok" at this wider band)
    expect(resolveDeficit({ ...FULL_STOCKS, "currency.materia": 30 }, content)).toBe("ok");
    expect(resolveDeficit({ ...FULL_STOCKS, "currency.materia": 15 }, content)).toBe("low");
  });
});
