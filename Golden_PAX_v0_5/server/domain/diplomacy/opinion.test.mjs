/**
 * Behavior tests: stepOpinion is module-private in GMap (re-derived from
 * reading opinionTick.mjs); tickOpinions is this port's reshaped version
 * of runOpinionTick (full world -> plain factions[] + relations table).
 */
import { describe, it, expect } from "vitest";
import { stepOpinion, tickOpinions } from "./opinion.mjs";

describe("stepOpinion", () => {
  it("moves current toward target by at most 3 per tick", () => {
    expect(stepOpinion(0, 100, 1)).toBeLessThanOrEqual(3);
    expect(stepOpinion(0, 100, 1)).toBeGreaterThan(0);
  });

  it("pulls toward target (max 3) then decays toward 0 in the same step", () => {
    // 10 -> pull 3 toward 0 -> 7 -> decay 1 -> 6
    expect(stepOpinion(10, 0, 1)).toBe(6);
  });

  it("mirrors the same math for negative opinion", () => {
    expect(stepOpinion(-10, 0, 1)).toBe(-6);
  });

  it("a higher decayMult pulls opinion toward 0 faster", () => {
    const slow = stepOpinion(10, 10, 1);
    const fast = stepOpinion(10, 10, 3);
    expect(fast).toBeLessThanOrEqual(slow);
  });
});

describe("tickOpinions", () => {
  const content = { races: {}, faction_traits: { traits: {} } };

  it("does not assume a fixed number of factions", () => {
    expect(tickOpinions([], {}, content).factions).toEqual([]);
    const many = Array.from({ length: 6 }, (_, i) => ({ id: `f-${i}`, diplomacy: { opinions: {}, history: [] } }));
    expect(tickOpinions(many, {}, content).factions).toHaveLength(6);
  });

  it("moves every ordered pair's opinion toward its structural target", () => {
    const factions = [
      { id: "fA", diplomacy: { opinions: {}, history: [] } },
      { id: "fB", diplomacy: { opinions: {}, history: [] } },
    ];
    const relations = { "fA|fB": "alliance" };
    const { factions: next, journal } = tickOpinions(factions, relations, content);
    const a = next.find((f) => f.id === "fA");
    expect(a.diplomacy.opinions.fB).toBeGreaterThan(0);
    expect(journal.some((e) => e.fromFactionId === "fA" && e.toFactionId === "fB")).toBe(true);
  });
});
