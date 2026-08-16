/**
 * Behavior test (NOT a port — no GMap equivalent; GMap never persisted
 * resolveExchange back onto a raised force). Persistence decision only:
 * empty surviving composition → force deleted; otherwise saved with the
 * pruned groups. Combat math is resolveExchange.test.mjs's job — we reuse
 * its wipeout fixture here so this file doesn't re-derive the formula.
 */
import { describe, it, expect } from "vitest";
import { resolveExchange } from "../combat/resolveExchange.mjs";
import { canEngage, forceAfterExchange, resolveEngageSystemId } from "./engage.mjs";
import { spaceObjectCombatModifier } from "../planets/spaceObjects.mjs";

const content = { combat_matchups: {}, rules: {} };

function stack(overrides) {
  return { roles: ["line"], damage: 10, accuracy: 100, shields: 0, armor: 5, count: 10, hp: 100, maxHp: 100, ...overrides };
}

describe("canEngage", () => {
  it("allows same-kind fleet and legion pairs in the same system", () => {
    expect(canEngage({ kind: "fleet", systemId: "s1" }, { kind: "fleet", systemId: "s1" })).toEqual({ ok: true });
    expect(canEngage({ kind: "legion", systemId: "s1" }, { kind: "legion", systemId: "s1" })).toEqual({ ok: true });
  });

  it("rejects cross-kind engage (boarding is a different action)", () => {
    expect(canEngage({ kind: "legion", systemId: "s1" }, { kind: "fleet", systemId: "s1" })).toEqual({ ok: false, error: "cross_kind_engage_not_allowed" });
    expect(canEngage({ kind: "fleet", systemId: "s1" }, { kind: "legion", systemId: "s1" })).toEqual({ ok: false, error: "cross_kind_engage_not_allowed" });
  });

  it("rejects forces that are not in the same system", () => {
    expect(canEngage({ kind: "legion", systemId: "s1" }, { kind: "legion", systemId: "s2" })).toEqual({
      ok: false,
      error: "not_same_system",
    });
    expect(canEngage({ kind: "fleet", systemId: "s1" }, { kind: "fleet" })).toEqual({
      ok: false,
      error: "not_same_system",
    });
  });
});

describe("forceAfterExchange", () => {
  it("deletes a force whose side was wiped (pruned to [])", () => {
    const groupsA = [stack({ damage: 500, count: 50 })];
    const groupsB = [stack({ damage: 1, count: 3, hp: 5, maxHp: 5 })];
    const result = resolveExchange(groupsA, groupsB, {}, content);
    expect(result.groupsB).toEqual([]);

    const forceB = { id: "force-b", factionId: "fB", composition: groupsB };
    expect(forceAfterExchange(forceB, result.groupsB)).toEqual({ deleted: true, force: null });
  });

  it("saves the surviving side with resolveExchange's pruned composition", () => {
    const groupsA = [stack({ damage: 500, count: 50 })];
    const groupsB = [stack({ damage: 1, count: 3, hp: 5, maxHp: 5 })];
    const result = resolveExchange(groupsA, groupsB, {}, content);
    expect(result.groupsA.length).toBeGreaterThan(0);

    const forceA = { id: "force-a", factionId: "fA", name: "1st", composition: groupsA };
    const next = forceAfterExchange(forceA, result.groupsA);
    expect(next.deleted).toBe(false);
    expect(next.force.id).toBe("force-a");
    expect(next.force.composition).toEqual(result.groupsA);
    expect(next.force.composition.every((g) => g.count > 0)).toBe(true);
  });

  it("deletes when given an already-empty surviving array (re-engage after wipeout)", () => {
    const force = { id: "x", composition: [stack({ count: 1 })] };
    expect(forceAfterExchange(force, [])).toEqual({ deleted: true, force: null });
  });
});

describe("resolveEngageSystemId (space-object combat mods)", () => {
  const mineContent = {
    combat_matchups: {},
    rules: {},
    space_objects: { objects: { minefield: { id: "minefield", combat: { challengerPowerMult: 0.9 } } } },
  };

  it("defaults to forceA.systemId when the client omits body.systemId", () => {
    expect(resolveEngageSystemId({}, { systemId: "sys.home" }, { systemId: "sys.other" })).toBe("sys.home");
    expect(resolveEngageSystemId({ systemId: "sys.body" }, { systemId: "sys.home" }, { systemId: "sys.other" })).toBe("sys.body");
    expect(resolveEngageSystemId({}, {}, { systemId: "sys.b" })).toBe("sys.b");
  });

  it("a minefield on the force's systemId changes resolveExchange power without body.systemId", () => {
    const forceA = { id: "a", factionId: "fA", kind: "legion", systemId: "sys1", composition: [stack()] };
    const forceB = { id: "b", factionId: "fB", kind: "legion", systemId: "sys1", composition: [stack()] };
    const body = { forceBId: forceB.id };
    const systemId = resolveEngageSystemId(body, forceA, forceB);
    expect(systemId).toBe("sys1");
    expect(body.systemId).toBeUndefined();

    const combatSystem = { id: systemId, ownerFactionId: "fA", spaceObjects: [{ typeId: "minefield" }] };
    const baseline = resolveExchange(forceA.composition, forceB.composition, {
      factionIdA: forceA.factionId,
      factionIdB: forceB.factionId,
    }, mineContent);
    const withMine = resolveExchange(forceA.composition, forceB.composition, {
      factionIdA: forceA.factionId,
      factionIdB: forceB.factionId,
      powerMultA: spaceObjectCombatModifier(combatSystem, mineContent, forceA.factionId),
      powerMultB: spaceObjectCombatModifier(combatSystem, mineContent, forceB.factionId),
      system: combatSystem,
    }, mineContent);

    expect(withMine.ok).toBe(true);
    expect(withMine.powerA).toBe(baseline.powerA);
    expect(withMine.powerB).toBeLessThan(baseline.powerB);
    expect(withMine.powerB).toBeCloseTo(baseline.powerB * 0.9);
  });
});
