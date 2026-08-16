import { describe, it, expect } from "vitest";
import { resolveExchange, resolveUntilDecisive } from "./resolveExchange.mjs";

const content = { combat_matchups: {}, rules: {} };

function stack(overrides) {
  return { roles: ["line"], damage: 10, accuracy: 100, shields: 0, armor: 5, count: 10, hp: 100, maxHp: 100, ...overrides };
}

describe("resolveExchange", () => {
  it("rejects an exchange with no forces on either side", () => {
    expect(resolveExchange([], [], {}, content)).toEqual({ ok: false, error: "no forces" });
  });

  it("the stronger side wins and the weaker side takes casualties", () => {
    const groupsA = [stack({ damage: 100, count: 50 })];
    const groupsB = [stack({ damage: 5, count: 5 })];

    const result = resolveExchange(groupsA, groupsB, {}, content);

    expect(result.ok).toBe(true);
    expect(result.outcome).toBe("win_a");
    expect(result.powerA).toBeGreaterThan(result.powerB);
    // B took real casualties — either reduced to a lower count, or wiped out entirely
    // and pruned from the array (see the wipeout-pruning test below for that case specifically).
    expect(result.groupsB.length === 0 || result.groupsB.some((g) => g.count < 5)).toBe(true);
  });

  it("evenly matched sides trade casualties toward a draw", () => {
    const result = resolveExchange([stack()], [stack()], {}, content);
    expect(result.ok).toBe(true);
    expect(result.outcome).toBe("draw");
  });

  it("a retreating side that is clearly weaker disengages without casualties", () => {
    const groupsA = [stack({ count: 1, damage: 1 })];
    const groupsB = [stack({ count: 50, damage: 100 })];
    const result = resolveExchange(groupsA, groupsB, { stanceA: "retreat", factionIdA: "f1" }, content);
    expect(result.outcome).toBe("retreat_a");
    expect(result.retreated).toBe("f1");
    expect(result.lossesA).toEqual([]);
    expect(result.lossesB).toEqual([]);
  });

  it("awards veterancy xp to survivors that weren't wiped out", () => {
    const groupsA = [stack({ damage: 100, count: 50 })];
    const groupsB = [stack({ damage: 1, count: 5 })];
    const result = resolveExchange(groupsA, groupsB, {}, content);
    expect(result.groupsA.every((g) => g.xp === 50)).toBe(true);
  });

  it("a wipeout prunes the destroyed side's groups from the result instead of leaving a zero-count entry", () => {
    const groupsA = [stack({ damage: 500, count: 50 })];
    const groupsB = [stack({ damage: 1, count: 3, hp: 5, maxHp: 5 })];
    const result = resolveExchange(groupsA, groupsB, {}, content);
    expect(result.outcome).toBe("win_a");
    expect(result.groupsB).toEqual([]);
  });

  it("fighting an already-empty side (e.g. re-calling after a prior wipeout) is a clean win, not a 0-power draw", () => {
    // This is the exact bug found in a real 10-turn playtest: re-passing a
    // defeated side's zero-count entry made the *attacker's* power collapse
    // to 0 too via the matchup-weighting formula. Passing an empty array
    // (as callers now must, see resolveExchange.mjs's header) must not.
    const groupsA = [stack({ damage: 60, count: 38 })];
    const result = resolveExchange(groupsA, [], {}, content);
    expect(result.ok).toBe(true);
    expect(result.outcome).toBe("win_a");
    expect(result.groupsA).toEqual(groupsA);
    expect(result.lossesA).toEqual([]);
  });

  it("the symmetric empty-side-B case", () => {
    const groupsB = [stack({ damage: 60, count: 38 })];
    const result = resolveExchange([], groupsB, {}, content);
    expect(result.outcome).toBe("win_b");
  });

  it("opts.powerMultA/B scale power (space-object combat hook)", () => {
    const even = resolveExchange([stack()], [stack()], {}, content);
    const boosted = resolveExchange([stack()], [stack()], { powerMultA: 1.2, powerMultB: 0.9 }, content);
    expect(boosted.powerA).toBeCloseTo(even.powerA * 1.2);
    expect(boosted.powerB).toBeCloseTo(even.powerB * 0.9);
    expect(boosted.powerA).toBeGreaterThan(boosted.powerB);
  });

  it("a combat_role_mult tech raises power against that enemy role", () => {
    const techContent = {
      ...content,
      technologies: {
        "tech.anti_armor": {
          id: "tech.anti_armor",
          effects: [{ effect: "combat_role_mult", args: { role: "armor", mult: 1.15 } }],
        },
      },
    };
    const us = [stack({ roles: ["line"] })];
    const them = [stack({ roles: ["armor"] })];
    const baseline = resolveExchange(us, them, {}, techContent);
    const boosted = resolveExchange(
      us,
      them,
      { techAccountA: { unlockedTechs: ["tech.anti_armor"] } },
      techContent,
    );
    expect(boosted.powerA).toBeGreaterThan(baseline.powerA);
    expect(boosted.powerB).toBeCloseTo(baseline.powerB);
  });

  it("logisticsCombatDefMult scales the system owner's power (disconnected → 0.7)", () => {
    const logisticsContent = {
      ...content,
      rules: {
        logistics: {
          disconnectedPenalties: [
            { effect: "logistics_disconnected_penalty", args: { productionMult: 0.5, upkeepMult: 1.3, combatDefMult: 0.7 } },
          ],
        },
      },
    };
    const system = {
      ownerFactionId: "fA",
      logistics: { connectedToCapital: false, supplyLevel: 0 },
    };
    const even = resolveExchange([stack()], [stack()], { factionIdA: "fA", factionIdB: "fB" }, logisticsContent);
    const cut = resolveExchange(
      [stack()],
      [stack()],
      { factionIdA: "fA", factionIdB: "fB", system },
      logisticsContent,
    );
    expect(cut.powerA).toBeCloseTo(even.powerA * 0.7);
    expect(cut.powerB).toBeCloseTo(even.powerB);
  });
});

describe("resolveUntilDecisive", () => {
  it("keeps exchanging until a 3v1 militia stack wipes the defender", () => {
    const militia = (n) => ({
      roles: ["infantry"],
      damage: 8,
      defense: 8,
      hp: 70,
      maxHp: 70,
      speed: 4,
      count: n,
    });
    const result = resolveUntilDecisive([militia(3)], [militia(1)], {}, content);
    expect(result.ok).toBe(true);
    expect(result.outcome).toBe("win_a");
    expect(result.groupsB).toEqual([]);
    expect(result.groupsA.length).toBeGreaterThan(0);
    expect(result.rounds).toBeGreaterThan(1);
  });
});
