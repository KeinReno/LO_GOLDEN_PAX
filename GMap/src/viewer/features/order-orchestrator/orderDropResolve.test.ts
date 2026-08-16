import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkOrderApBudget,
  orderTypeFromDropIntent,
  resolveUnitDrop,
} from "./orderDropResolve.ts";

describe("orderTypeFromDropIntent", () => {
  it("maps move/attack/claim", () => {
    assert.equal(orderTypeFromDropIntent("fleet", "move"), "move_fleet");
    assert.equal(orderTypeFromDropIntent("legion", "move"), "move_legion");
    assert.equal(orderTypeFromDropIntent("fleet", "attack"), "attack_system");
    assert.equal(orderTypeFromDropIntent("legion", "claim"), "claim_system");
  });
});

describe("checkOrderApBudget", () => {
  it("rejects empire AP overflow", () => {
    const r = checkOrderApBudget({
      reservedAp: 8,
      apMax: 9,
      reservedForceAp: 0,
      forceApMax: 2,
      apCost: 2,
      forceCost: 0,
    });
    assert.equal(r.ok, false);
    assert.match((r as { message: string }).message, /Недостаточно ОД/);
  });

  it("rejects force AP overflow", () => {
    const r = checkOrderApBudget({
      reservedAp: 0,
      apMax: 9,
      reservedForceAp: 2,
      forceApMax: 2,
      apCost: 0,
      forceCost: 1,
    });
    assert.equal(r.ok, false);
    assert.match((r as { message: string }).message, /ОД сил/);
  });

  it("allows when within budget", () => {
    const r = checkOrderApBudget({
      reservedAp: 1,
      apMax: 9,
      reservedForceAp: 0,
      forceApMax: 2,
      apCost: 1,
      forceCost: 1,
    });
    assert.deepEqual(r, { ok: true });
  });
});

describe("resolveUnitDrop", () => {
  const world = {
    fleets: [
      { id: "f1", factionId: "me", systemId: "s1" },
      { id: "f2", factionId: "enemy", systemId: "s2" },
    ],
    legions: [],
  } as any;

  const deps = {
    canAttackHostileUnit: () => true,
    canAttackUnitAtSystem: () => true,
    isWithinMoveRange: () => true,
    buildContactBattlePreview: () => null,
  } as any;

  it("rejects fog-gated targets", () => {
    const r = resolveUnitDrop(
      {
        world,
        factionId: "me",
        visibleSystemIds: ["s1"],
        drop: {
          kind: "fleet",
          unitId: "f1",
          fromSystemId: "s1",
          toSystemId: "s2",
          hops: 1,
          intent: "move",
        },
      },
      deps,
    );
    assert.equal(r.action, "reject");
    assert.match((r as { message: string }).message, /обзора/);
  });

  it("rejects illegal attack", () => {
    const r = resolveUnitDrop(
      {
        world,
        factionId: "me",
        visibleSystemIds: ["s1", "s2"],
        drop: {
          kind: "fleet",
          unitId: "f1",
          fromSystemId: "s1",
          toSystemId: "s2",
          hops: 1,
          intent: "attack",
          targetFactionId: "enemy",
        },
      },
      {
        ...deps,
        canAttackHostileUnit: () => false,
        canAttackUnitAtSystem: () => false,
      },
    );
    assert.equal(r.action, "reject");
    assert.match((r as { message: string }).message, /атаковать/);
  });

  it("rejects out-of-range move", () => {
    const r = resolveUnitDrop(
      {
        world,
        factionId: "me",
        visibleSystemIds: ["s1", "s2"],
        drop: {
          kind: "fleet",
          unitId: "f1",
          fromSystemId: "s1",
          toSystemId: "s2",
          hops: 3,
          intent: "move",
        },
      },
      { ...deps, isWithinMoveRange: () => false },
    );
    assert.equal(r.action, "reject");
    assert.match((r as { message: string }).message, /перемещения/);
  });

  it("opens contact when co-located attack on unit", () => {
    const preview = { id: "preview" };
    const r = resolveUnitDrop(
      {
        world: {
          fleets: [
            { id: "f1", factionId: "me", systemId: "s2" },
            { id: "f2", factionId: "enemy", systemId: "s2" },
          ],
          legions: [],
        } as any,
        factionId: "me",
        visibleSystemIds: ["s2"],
        drop: {
          kind: "fleet",
          unitId: "f1",
          fromSystemId: "s2",
          toSystemId: "s2",
          hops: 0,
          intent: "attack",
          targetUnitKind: "fleet",
          targetUnitId: "f2",
          targetFactionId: "enemy",
        },
      },
      {
        ...deps,
        buildContactBattlePreview: () => preview,
      },
    );
    assert.equal(r.action, "contact");
    assert.equal((r as { preview: unknown }).preview, preview);
    assert.equal((r as { orderType: string }).orderType, "attack_system");
  });

  it("submits valid move", () => {
    const r = resolveUnitDrop(
      {
        world,
        factionId: "me",
        visibleSystemIds: ["s1", "s2"],
        drop: {
          kind: "fleet",
          unitId: "f1",
          fromSystemId: "s1",
          toSystemId: "s2",
          hops: 1,
          intent: "move",
        },
      },
      deps,
    );
    assert.equal(r.action, "submit");
    assert.equal((r as { orderType: string }).orderType, "move_fleet");
    assert.equal((r as { fromSystemId: string }).fromSystemId, "s1");
  });
});
