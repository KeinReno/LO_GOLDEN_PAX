import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlayerOrder } from "../state/types.ts";
import { formatOrderEtaShort } from "./orderEtaLabels.ts";

describe("formatOrderEtaShort", () => {
  it("speaks turns, not a duplicate hour string", () => {
    const order = {
      id: "o1",
      type: "move_fleet",
      status: "active",
      resolvesAt: 24 * 21,
    } as PlayerOrder;
    assert.equal(formatOrderEtaShort(order, 18), "3 хода");
  });
});
