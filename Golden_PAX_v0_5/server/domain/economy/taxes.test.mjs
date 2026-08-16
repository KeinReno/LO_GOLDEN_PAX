/**
 * Behavior test, not a cross-repo diff: taxRateFor/resolveTaxSlotId are
 * module-private in GMap/server/economyTick.mjs (never exported). Cases
 * re-derived directly from reading that function.
 */
import { describe, it, expect } from "vitest";
import { taxRateFor, resolveTaxSlotId } from "./taxes.mjs";

const content = {
  taxes: {
    "tax.materia": {
      id: "tax.materia",
      tiers: [
        { id: "none", rate: 0 },
        { id: "low", rate: 0.1 },
        { id: "high", rate: 0.25 },
      ],
    },
    "tax.legacy_industry": { id: "tax.legacy_industry", aliasOf: "tax.materia" },
  },
};

describe("taxRateFor / resolveTaxSlotId", () => {
  it("resolves the rate for the faction's current tier", () => {
    const eco = { taxes: { "tax.materia": "high" } };
    expect(taxRateFor(eco, content, "tax.materia")).toBe(0.25);
  });

  it("defaults to 0 (none) when the faction has no tier set", () => {
    const eco = { taxes: {} };
    expect(taxRateFor(eco, content, "tax.materia")).toBe(0);
  });

  it("defaults to 0 for an unknown slot", () => {
    const eco = { taxes: {} };
    expect(taxRateFor(eco, content, "tax.nonexistent")).toBe(0);
  });

  it("follows aliasOf to the canonical slot", () => {
    expect(resolveTaxSlotId(content, "tax.legacy_industry")).toBe("tax.materia");
    const eco = { taxes: { "tax.materia": "low" } };
    expect(taxRateFor(eco, content, "tax.legacy_industry")).toBe(0.1);
  });

  it("returns the slot unchanged when it has no aliasOf", () => {
    expect(resolveTaxSlotId(content, "tax.materia")).toBe("tax.materia");
  });
});
