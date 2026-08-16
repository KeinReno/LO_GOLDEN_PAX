/**
 * Engine range / fuel MP / move_cost_mult — NEW DESIGN layer, not a hop-graph port.
 * Run: node --test server/forceMp.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveEngineRangeHops,
  maxMovementPoints,
  movementPointsPerHop,
  movementCost,
  currentMovementPoints,
  assertMoveAffordable,
  applyMpSpend,
  refillMovementPoints,
  refillAllForces,
  stampForceMp,
} from "./forceMp.mjs";
import { completeForceTravel } from "./forceMovement.mjs";

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
  systems: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
  fleets: [],
  factions: [],
};

function fleet(overrides) {
  return {
    id: "f1",
    factionId: "fac",
    systemId: "a",
    engineTier: 0,
    fuelTier: 0,
    movementPoints: 3,
    stance: "idle",
    route: [],
    ...overrides,
  };
}

describe("engine hop-range", () => {
  it("tier 0 is 2 hops; tier 1 is 3 (old flat default)", () => {
    assert.equal(resolveEngineRangeHops(fleet({ engineTier: 0 }), content, "fleet"), 2);
    assert.equal(resolveEngineRangeHops(fleet({ engineTier: 1 }), content, "fleet"), 3);
    assert.equal(resolveEngineRangeHops({ id: "l1" }, content, "legion"), 3);
  });

  it("missing engine falls back to rangeHops so existing hop orders keep 3", () => {
    assert.equal(resolveEngineRangeHops({ id: "f2", composition: [] }, content, "fleet"), 3);
  });
});

describe("fuel MP pool spend", () => {
  it("fuel tier 0 is 3 MP; cost is 1 per hop", () => {
    assert.equal(maxMovementPoints(fleet({ fuelTier: 0 }), content, "fleet"), 3);
    assert.equal(maxMovementPoints(fleet({ fuelTier: 1 }), content, "fleet"), 4);
    assert.equal(movementPointsPerHop(content), 1);
  });

  it("a 2-hop move spends 2 MP and updates systemId", () => {
    const unit = fleet();
    const result = completeForceTravel(world, unit, "fleet", "c", "idle", null, {
      content,
      effects: [],
    });
    assert.equal(result.ok, true);
    assert.equal(unit.systemId, "c");
    assert.equal(unit.movementPoints, 1);
    assert.equal(result.hops, 2);
    assert.equal(result.movementPointsSpent, 2);
  });

  it("rejects a destination beyond engine range even with leftover MP", () => {
    const unit = fleet({ movementPoints: 10 });
    const result = completeForceTravel(world, unit, "fleet", "d", "idle", null, {
      content,
      effects: [],
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "out_of_range");
    assert.equal(unit.systemId, "a");
    assert.equal(unit.movementPoints, 10);
  });

  it("rejects a move that fits range but exceeds remaining MP", () => {
    const unit = fleet({ engineTier: 2, movementPoints: 1 });
    const result = completeForceTravel(world, unit, "fleet", "c", "idle", null, {
      content,
      effects: [],
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "insufficient_movement_points");
    assert.equal(result.movementPointsNeeded, 2);
    assert.equal(unit.systemId, "a");
  });

  it("same-system move spends 0 MP", () => {
    const unit = fleet();
    const result = completeForceTravel(world, unit, "fleet", "a", "idle", null, {
      content,
      effects: [],
    });
    assert.equal(result.ok, true);
    assert.equal(result.hops, 0);
    assert.equal(result.movementPointsSpent, 0);
    assert.equal(unit.movementPoints, 3);
  });

  it("missing movementPoints is treated as a full tank", () => {
    const unit = fleet({ movementPoints: undefined, fuelTier: 0 });
    delete unit.movementPoints;
    assert.equal(currentMovementPoints(unit, content, "fleet"), 3);
    const gate = assertMoveAffordable(unit, 2, content, [], "fleet");
    assert.equal(gate.ok, true);
    assert.equal(gate.spent, 2);
  });
});

describe("move_cost_mult increases spend", () => {
  it("no effects → 2 hops cost 2", () => {
    assert.equal(movementCost(2, content, [], fleet()), 2);
  });

  it("mult 1.5 on a 2-hop trip spends 3 (more than base)", () => {
    const fx = [{ effect: "move_cost_mult", args: { mult: 1.5 }, scope: "faction" }];
    const base = movementCost(2, content, [], fleet());
    const taxed = movementCost(2, content, fx, fleet());
    assert.equal(base, 2);
    assert.equal(taxed, 3);
    assert.ok(taxed > base);
  });

  it("completeForceTravel consumes the increased spend", () => {
    const unit = fleet({ movementPoints: 5 });
    const result = completeForceTravel(world, unit, "fleet", "c", "idle", null, {
      content,
      effects: [{ effect: "move_cost_mult", args: { mult: 1.5 }, scope: "faction" }],
    });
    assert.equal(result.ok, true);
    assert.equal(result.movementPointsSpent, 3);
    assert.equal(unit.movementPoints, 2);
  });

  it("admiral 0.8 × 3 hops rounds to 2", () => {
    const fx = [{ effect: "move_cost_mult", args: { mult: 0.8 }, scope: "fleet", targetId: "f1" }];
    assert.equal(movementCost(3, content, fx, fleet({ engineTier: 1 })), 2);
  });

  it("wrong targetId does not apply", () => {
    const fx = [{ effect: "move_cost_mult", args: { mult: 1.5 }, scope: "fleet", targetId: "other" }];
    assert.equal(movementCost(2, content, fx, fleet()), 2);
  });
});

describe("refill next turn (any location)", () => {
  it("refillMovementPoints restores max far from origin", () => {
    const spent = fleet({ systemId: "c", movementPoints: 0, fuelTier: 2 });
    const next = refillMovementPoints(spent, content, "fleet");
    assert.equal(next.systemId, "c");
    assert.equal(next.movementPoints, 6);
  });

  it("refillAllForces fills every fleet/legion at tick end", () => {
    const w = {
      fleets: [fleet({ systemId: "d", movementPoints: 0, fuelTier: 1 })],
      legions: [{ id: "l1", systemId: "c", movementPoints: 0 }],
    };
    refillAllForces(w, content);
    assert.equal(w.fleets[0].movementPoints, 4);
    assert.equal(w.fleets[0].systemId, "d");
    assert.equal(w.legions[0].movementPoints, 3);
  });
});

describe("stampForceMp at raise", () => {
  it("copies ship tier into engine/fuel and fills the pool", () => {
    const force = { id: "fnew", composition: [] };
    stampForceMp(force, content, "fleet", { tier: 1 });
    assert.equal(force.engineTier, 1);
    assert.equal(force.fuelTier, 1);
    assert.equal(force.movementPoints, 4);
  });
});
