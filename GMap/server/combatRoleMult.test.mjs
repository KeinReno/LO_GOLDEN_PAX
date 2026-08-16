/**
 * combat_role_mult → combat_role:${role} (Tech Tree 2 §5c).
 * Run: node --test server/combatRoleMult.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildModifierStack } from "./modifierStack.mjs";
import { applyCombatRoleBonus, totalPower } from "./combatResolve.mjs";

describe("combat_role_mult channel", () => {
  it("stacks onto combat_role:${role}", () => {
    const stack = buildModifierStack([
      { effect: "combat_role_mult", args: { role: "armor", mult: 1.15 } },
    ]);
    assert.equal(stack.channels["combat_role:armor"].mult, 1.15);
    assert.equal(stack.channels["combat_role:armor"].flat, 0);
  });
});

describe("totalPower combat_role_mult", () => {
  it("boosts this side when the enemy has that role", () => {
    const channels = { "combat_role:armor": { flat: 0, mult: 1.15 } };
    const vsArmor = totalPower({ line: 100 }, {}, { armor: 50 }, channels);
    const vsLine = totalPower({ line: 100 }, {}, { line: 50 }, channels);
    assert.ok(Math.abs(vsArmor - 115) < 1e-9, `vsArmor=${vsArmor}`);
    assert.equal(vsLine, 100);
  });

  it("applyCombatRoleBonus is a no-op without channels", () => {
    assert.equal(applyCombatRoleBonus(80, undefined, { armor: 10 }), 80);
  });
});
