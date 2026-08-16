import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WorldState } from "../../../state/types.ts";
import {
  applyLocalFleetOrder,
  applyLocalMoveRoute,
  pendingFleetRouteOrderId,
  worldWithClearedFleetRoute,
  worldWithIdleFleetStance,
} from "./localMoveRoute.ts";

const alwaysInRange = () => true;
const neverInRange = () => false;

function world(): WorldState {
  return {
    systems: [{ id: "s1" }, { id: "s2", blockaded: false }],
    fleets: [
      {
        id: "f1",
        systemId: "s1",
        route: [{ to: "s2" }],
        stance: "idle",
      },
    ],
    legions: [{ id: "l1", systemId: "s1", route: [{ to: "s2" }], status: "march" }],
    orders: [
      { id: "o1", fleetId: "f1", status: "pending", type: "move_fleet" },
    ],
  } as unknown as WorldState;
}

describe("applyLocalMoveRoute", () => {
  it("same-system fleet sets arrive stance and clears route", () => {
    const next = applyLocalMoveRoute(world(), "fleet", "f1", "s1", "blockade", alwaysInRange);
    const f = next.fleets.find((x) => x.id === "f1");
    assert.deepEqual(f?.route, []);
    assert.equal(f?.stance, "blockade");
  });

  it("moves fleet when in range", () => {
    const next = applyLocalMoveRoute(
      world(),
      "fleet",
      "f1",
      "s2",
      "idle",
      alwaysInRange,
    );
    const f = next.fleets.find((x) => x.id === "f1");
    assert.equal(f?.systemId, "s2");
    assert.equal(f?.lastSystemId, "s1");
  });

  it("keeps world when out of range", () => {
    const src = world();
    const next = applyLocalMoveRoute(
      src,
      "fleet",
      "f1",
      "s2",
      "idle",
      neverInRange,
    );
    assert.equal(next, src);
  });

  it("moves legion and idles", () => {
    const next = applyLocalMoveRoute(
      world(),
      "legion",
      "l1",
      "s2",
      "idle",
      alwaysInRange,
    );
    const l = next.legions.find((x) => x.id === "l1");
    assert.equal(l?.systemId, "s2");
    assert.equal(l?.status, "idle");
  });
});

describe("applyLocalFleetOrder", () => {
  it("marks blockade in place", () => {
    const next = applyLocalFleetOrder(
      world(),
      "f1",
      "s1",
      "blockade",
      "s1",
      alwaysInRange,
    );
    assert.equal(next.fleets[0]?.stance, "blockade");
    assert.equal(next.systems.find((s) => s.id === "s1")?.blockaded, true);
  });

  it("fortify in place", () => {
    const next = applyLocalFleetOrder(
      world(),
      "f1",
      "s1",
      "fortify",
      "s1",
      alwaysInRange,
    );
    assert.equal(next.fleets[0]?.stance, "fortify");
  });
});

describe("fleet route helpers", () => {
  it("finds pending move/blockade", () => {
    assert.equal(pendingFleetRouteOrderId(world(), "f1"), "o1");
  });

  it("clears route / idle stance", () => {
    const cleared = worldWithClearedFleetRoute(world(), "f1");
    assert.deepEqual(cleared.fleets[0]?.route, []);
    const idle = worldWithIdleFleetStance(world(), "f1");
    assert.equal(idle.fleets[0]?.stance, "idle");
  });
});
