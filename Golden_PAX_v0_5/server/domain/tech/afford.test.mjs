/**
 * Behavior test, not a cross-repo diff: GMap's canAfford (server/
 * techActions.mjs) is module-private. Cases re-derived directly from
 * reading that function.
 */
import { describe, it, expect } from "vitest";
import { canAffordCost } from "./afford.mjs";

describe("canAffordCost", () => {
  it("ok when every currency has enough stock", () => {
    expect(canAffordCost({ "currency.cognitio": 50 }, { "currency.cognitio": 20 })).toEqual({ ok: true });
  });

  it("fails with the specific currency short", () => {
    const result = canAffordCost({ "currency.cognitio": 5 }, { "currency.cognitio": 20 });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/currency\.cognitio/);
  });

  it("treats a missing stock entry as 0", () => {
    expect(canAffordCost({}, { "currency.cognitio": 1 }).ok).toBe(false);
  });

  it("rejects a negative cost outright", () => {
    expect(canAffordCost({ "currency.cognitio": 100 }, { "currency.cognitio": -5 }).ok).toBe(false);
  });

  it("ok for an empty cost", () => {
    expect(canAffordCost({}, {})).toEqual({ ok: true });
  });
});
