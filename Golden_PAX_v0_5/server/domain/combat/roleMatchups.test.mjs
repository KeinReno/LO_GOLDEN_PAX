/**
 * Behavior test, not a cross-repo diff: rolePower/totalPower are
 * module-private in GMap/server/combatResolve.mjs. Cases re-derived
 * directly from reading those functions.
 */
import { describe, it, expect } from "vitest";
import { rolePower, totalPower } from "./roleMatchups.mjs";

describe("rolePower", () => {
  it("sums power per role from damage/accuracy/shields/count/hp-ratio", () => {
    const groups = [
      { roles: ["line"], damage: 100, accuracy: 100, shields: 0, count: 10, hp: 100, maxHp: 100 },
      { roles: ["line"], damage: 50, accuracy: 100, shields: 0, count: 5, hp: 100, maxHp: 100 },
      { roles: ["screen"], damage: 20, accuracy: 100, shields: 0, count: 20, hp: 100, maxHp: 100 },
    ];
    const result = rolePower(groups);
    // unitPower = damage * (0.5 + acc/200) * (1 + shields/200) * count * (hp/maxHp)
    // at acc=100, shields=0, hp=maxHp: multiplier is exactly damage * 1 * 1 * count
    expect(result.line).toBeCloseTo(100 * 1 * 10 + 50 * 1 * 5, 5);
    expect(result.screen).toBeCloseTo(20 * 1 * 20, 5);
  });

  it("halved hp halves that stack's contribution", () => {
    const full = rolePower([{ roles: ["line"], damage: 100, accuracy: 100, shields: 0, count: 1, hp: 100, maxHp: 100 }]);
    const half = rolePower([{ roles: ["line"], damage: 100, accuracy: 100, shields: 0, count: 1, hp: 50, maxHp: 100 }]);
    expect(half.line).toBeCloseTo(full.line / 2, 5);
  });

  it("defaults to role 'line' when a group has no role", () => {
    const result = rolePower([{ roles: [], damage: 10, accuracy: 100, shields: 0, count: 1, hp: 1, maxHp: 1 }]);
    expect(Object.keys(result)).toEqual(["line"]);
  });
});

describe("totalPower", () => {
  it("returns raw power unweighted when there are no enemy roles", () => {
    expect(totalPower({ line: 100 }, {}, {})).toBe(100);
  });

  it("applies the matchup multiplier weighted by enemy role share", () => {
    const matchups = { line: { screen: 1.5, capital: 0.5 } };
    // 50/50 split -> mean multiplier 1.0
    expect(totalPower({ line: 100 }, matchups, { screen: 50, capital: 50 })).toBeCloseTo(100, 5);
    // all screen -> multiplier 1.5
    expect(totalPower({ line: 100 }, matchups, { screen: 100 })).toBeCloseTo(150, 5);
  });

  it("unlisted matchup pairs default to a neutral 1x", () => {
    expect(totalPower({ line: 100 }, {}, { screen: 100 })).toBeCloseTo(100, 5);
  });

  it("combat_role_mult boosts this side when the enemy has that role (Tech Tree 2.0, not a port)", () => {
    const channels = { "combat_role:armor": { flat: 0, mult: 1.15 } };
    const vsArmor = totalPower({ line: 100 }, {}, { armor: 50 }, channels);
    const vsLine = totalPower({ line: 100 }, {}, { line: 50 }, channels);
    expect(vsArmor).toBeCloseTo(115, 5);
    expect(vsLine).toBeCloseTo(100, 5);
  });
});
