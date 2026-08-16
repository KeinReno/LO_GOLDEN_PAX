import { describe, it, expect } from "vitest";
import {
  completeForceTravel,
  checkMoveRange,
  resolveEngineRangeHops,
  maxMovementPoints,
  refillMovementPoints,
  movementPointsPerHop,
} from "./movement.mjs";

/**
 * NEW DESIGN — not a GMap port. Engine → hop range, fuel → movement-points
 * pool that refills to max every turn. See movement.mjs header for the
 * first-pass tables.
 */

const content = {
  rules: {
    movement: {
      rangeHops: 3,
      legionRangeHops: 3,
      engineRangeHops: { 0: 2, 1: 3, 2: 4 },
      fuelMovementPoints: { 0: 3, 1: 4, 2: 6 },
      movementPointsPerHop: 1,
      legionMovementPoints: 3,
    },
  },
};

const world = {
  links: [
    { fromId: "a", toId: "b", type: "corridor" },
    { fromId: "b", toId: "c", type: "corridor" },
    { fromId: "c", toId: "d", type: "corridor" },
  ],
};

function fleet(overrides) {
  return {
    id: "f1",
    kind: "fleet",
    systemId: "a",
    engineTier: 0,
    fuelTier: 0,
    movementPoints: 3,
    ...overrides,
  };
}

describe("engine range / fuel movement-points (NEW DESIGN, not a GMap port)", () => {
  it("engine tier 0 is 2 hops; tier 1 is 3 (GMap's old flat default)", () => {
    expect(resolveEngineRangeHops(fleet({ engineTier: 0 }), content)).toBe(2);
    expect(resolveEngineRangeHops(fleet({ engineTier: 1 }), content)).toBe(3);
    expect(resolveEngineRangeHops({ kind: "legion" }, content)).toBe(3);
  });

  it("fuel tier 0 is 3 MP; cost is 1 per hop", () => {
    expect(maxMovementPoints(fleet({ fuelTier: 0 }), content)).toBe(3);
    expect(maxMovementPoints(fleet({ fuelTier: 1 }), content)).toBe(4);
    expect(movementPointsPerHop(content)).toBe(1);
  });

  it("a 2-hop move within engine range spends 2 MP and updates systemId", () => {
    const result = completeForceTravel(world, fleet(), "c", content);
    expect(result.ok).toBe(true);
    expect(result.force.systemId).toBe("c");
    expect(result.force.movementPoints).toBe(1);
    expect(result.hops).toBe(2);
    expect(result.movementPointsSpent).toBe(2);
  });

  it("rejects a destination beyond engine range even with leftover MP", () => {
    const result = completeForceTravel(world, fleet({ movementPoints: 10 }), "d", content);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("out_of_range");
    expect(result.hops).toBe(3);
    expect(result.maxHops).toBe(2);
  });

  it("rejects a move that fits range but exceeds remaining movement points", () => {
    const result = completeForceTravel(world, fleet({ engineTier: 2, movementPoints: 1 }), "c", content);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("insufficient_movement_points");
    expect(result.movementPointsNeeded).toBe(2);
  });

  it("same-system move is a no-op (0 hops, 0 MP)", () => {
    const result = completeForceTravel(world, fleet(), "a", content);
    expect(result.ok).toBe(true);
    expect(result.hops).toBe(0);
    expect(result.movementPointsSpent).toBe(0);
    expect(result.force.movementPoints).toBe(3);
  });

  it("checkMoveRange reports no_path when unreachable", () => {
    const result = checkMoveRange(world, "a", "missing", "fleet", 5);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("no_path");
  });

  it("refillMovementPoints restores the pool to max regardless of location", () => {
    const spent = { ...fleet({ systemId: "c", movementPoints: 0, fuelTier: 2 }) };
    const next = refillMovementPoints(spent, content);
    expect(next.systemId).toBe("c");
    expect(next.movementPoints).toBe(6);
  });

  it("does not mutate the input force", () => {
    const original = fleet();
    completeForceTravel(world, original, "b", content);
    expect(original.systemId).toBe("a");
    expect(original.movementPoints).toBe(3);
  });
});

describe("move_cost_mult (court/tech channel)", () => {
  function admiralEffect(targetId, mult = 0.8) {
    return [{ effect: "move_cost_mult", args: { mult }, scope: "fleet", targetId }];
  }

  it("no effects → same spend as today (1 hop costs 1)", () => {
    const result = completeForceTravel(world, fleet(), "b", content);
    expect(result.ok).toBe(true);
    expect(result.hops).toBe(1);
    expect(result.movementPointsSpent).toBe(1);
  });

  it("admiral-style 0.8 on a 3-hop trip spends less than without it", () => {
    const f = fleet({ engineTier: 1, movementPoints: 3 });
    const plain = completeForceTravel(world, f, "d", content);
    const discounted = completeForceTravel(world, f, "d", content, { effects: admiralEffect(f.id, 0.8) });
    expect(plain.ok).toBe(true);
    expect(discounted.ok).toBe(true);
    expect(plain.hops).toBe(3);
    expect(plain.movementPointsSpent).toBe(3);
    expect(discounted.movementPointsSpent).toBe(2);
    expect(discounted.movementPointsSpent).toBeLessThan(plain.movementPointsSpent);
  });

  it("same effect with wrong targetId does not apply", () => {
    const f = fleet({ engineTier: 1, movementPoints: 3 });
    const result = completeForceTravel(world, f, "d", content, { effects: admiralEffect("other-fleet", 0.8) });
    expect(result.ok).toBe(true);
    expect(result.movementPointsSpent).toBe(3);
  });

  it("faction-scope effect does apply", () => {
    const f = fleet({ engineTier: 1, movementPoints: 3 });
    const result = completeForceTravel(world, f, "d", content, {
      effects: [{ effect: "move_cost_mult", args: { mult: 0.8 }, scope: "faction" }],
    });
    expect(result.ok).toBe(true);
    expect(result.movementPointsSpent).toBe(2);
  });

  it("1 hop with 0.92 still spends at least 1", () => {
    const result = completeForceTravel(world, fleet(), "b", content, { effects: admiralEffect("f1", 0.92) });
    expect(result.ok).toBe(true);
    expect(result.hops).toBe(1);
    expect(result.movementPointsSpent).toBe(1);
    expect(result.movementPointsSpent).toBeGreaterThanOrEqual(1);
  });
});
