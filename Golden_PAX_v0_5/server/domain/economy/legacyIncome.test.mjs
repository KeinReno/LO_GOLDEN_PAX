/**
 * NOT a port — `legacyIncome.mjs` is a simplified stand-in, not GMap's
 * `mapResourceYieldLegacyOnly` (that one needs system-level deposits).
 */
import { describe, it, expect } from "vitest";
import {
  computeLegacyFloorIncome,
  LEGACY_SUPPLY_BASELINE,
  LEGACY_POP_SUPPLY_CAP,
} from "./legacyIncome.mjs";

describe("computeLegacyFloorIncome", () => {
  it("gives the GMap-spirit baseline even with no planets and no population", () => {
    expect(computeLegacyFloorIncome(0, 0)).toEqual({
      "currency.supply": LEGACY_SUPPLY_BASELINE,
      "currency.metal": 0,
    });
  });

  it("scales supply with population via ceil(pop * 0.05), metal stays 0", () => {
    // pop 20 → ceil(1) = 1 extra → supply 3
    expect(computeLegacyFloorIncome(1, 20)).toEqual({
      "currency.supply": LEGACY_SUPPLY_BASELINE + 1,
      "currency.metal": 0,
    });
  });

  it("caps the population add so the floor stays weak vs peg-conversion", () => {
    const huge = computeLegacyFloorIncome(99, 10_000);
    expect(huge["currency.supply"]).toBe(LEGACY_SUPPLY_BASELINE + LEGACY_POP_SUPPLY_CAP);
    expect(huge["currency.metal"]).toBe(0);
  });
});
