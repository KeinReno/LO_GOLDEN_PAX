import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { buildModifierStack as newBuildModifierStack, applyFlatThenMult as newApplyFlatThenMult, DEFAULT_MODIFIER_CAPS as newCaps } from "./modifierStack.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const oldModulePath = path.resolve(__dirname, "../../../../GMap/server/modifierStack.mjs");

describe("modifierStack core mechanics parity with GMap", () => {
  it("buildModifierStack matches across a grid of scenarios (flats, mults, caps, mixed/other effects)", async () => {
    const old = await import(oldModulePath);

    const scenarios = [
      [{ effect: "production_flat", args: { resource: "currency.extracta", amount: 2 } }],
      [
        { effect: "production_mult", args: { resource: "currency.extracta", mult: 1.05 } },
        { effect: "production_mult", args: { resource: "currency.extracta", mult: 1.1 } },
      ],
      [{ effect: "production_mult", args: { resource: "currency.cognitio", mult: 10 } }], // should clamp
      [{ effect: "upkeep_mult", args: { resource: "currency.metal", mult: 0.9 } }],
      [{ effect: "unlock_property", args: { property: "x" } }], // OTHER_EFFECTS, not flat/mult
      [
        { effect: "production_flat", args: { resource: "currency.bios", amount: 1 } },
        { effect: "production_mult", args: { resource: "currency.bios", mult: 1.2 } },
        { effect: "production_mult", args: { resource: "*", mult: 1.1 } },
      ],
    ];

    for (const effects of scenarios) {
      const mine = newBuildModifierStack(effects);
      const theirs = old.buildModifierStack(effects);
      expect(mine.channels).toEqual(theirs.channels);
      expect(mine.mergeOrder).toEqual(theirs.mergeOrder);
    }
  });

  it("applyFlatThenMult matches", async () => {
    const old = await import(oldModulePath);
    expect(newApplyFlatThenMult(10, { flat: 2, mult: 1.5 })).toBe(old.applyFlatThenMult(10, { flat: 2, mult: 1.5 }));
    expect(newApplyFlatThenMult(10, null)).toBe(old.applyFlatThenMult(10, null));
  });

  it("DEFAULT_MODIFIER_CAPS matches", async () => {
    const old = await import(oldModulePath);
    expect(newCaps).toEqual(old.DEFAULT_MODIFIER_CAPS);
  });
});
