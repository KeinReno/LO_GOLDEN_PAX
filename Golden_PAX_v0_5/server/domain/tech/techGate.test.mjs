/**
 * Behavior test (NOT a port — GMap's canBuildWithTech pulls getContent()
 * internally for its RoleScore branch, so it isn't directly diffable; the
 * tier-check math itself is ported verbatim, see techGate.mjs's header).
 */
import { describe, it, expect } from "vitest";
import { factionMaxTier, canBuildWithTech } from "./techGate.mjs";

describe("factionMaxTier", () => {
  it("defaults to 1 for a missing techAccount or missing category", () => {
    expect(factionMaxTier(undefined, "A")).toBe(1);
    expect(factionMaxTier({}, "A")).toBe(1);
    expect(factionMaxTier({ techTiers: { B: 4 } }, "A")).toBe(1);
  });

  it("reads the real tier once set", () => {
    expect(factionMaxTier({ techTiers: { A: 4 } }, "A")).toBe(4);
  });
});

describe("canBuildWithTech", () => {
  it("a fresh faction (no tech) can still build up to tier 3 — matches GMap's Math.max(3, ...) floor", () => {
    expect(canBuildWithTech(undefined, { category: "A", tier: 3 }).ok).toBe(true);
    expect(canBuildWithTech({}, { category: "A", tier: 1 }).ok).toBe(true);
  });

  it("blocks tier 4+ without the matching unlock_tech_tier research", () => {
    const result = canBuildWithTech({ techTiers: { A: 1 } }, { category: "A", tier: 4 });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/tier/);
  });

  it("allows tier 4+ once techTiers is high enough", () => {
    // GMap's formula: max = Math.max(3, techTier + 1) — techTier 4 raises the ceiling to 5.
    expect(canBuildWithTech({ techTiers: { A: 4 } }, { category: "A", tier: 5 }).ok).toBe(true);
    expect(canBuildWithTech({ techTiers: { A: 4 } }, { category: "A", tier: 6 }).ok).toBe(false);
  });

  it("buildings with no category are never tech-gated", () => {
    expect(canBuildWithTech({ techTiers: {} }, { tier: 99 }).ok).toBe(true);
  });
});
