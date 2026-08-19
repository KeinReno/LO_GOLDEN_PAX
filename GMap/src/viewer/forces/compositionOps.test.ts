import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeComposition } from "./compositionOps.ts";

describe("mergeComposition", () => {
  it("refuses stacks with conflicting outfit and does not invent a reorder", () => {
    const result = mergeComposition(
      [
        {
          type: "battleship",
          defId: "ship.battleship",
          count: 1,
          filledSlots: { weapon: "map.t6.plasma" },
        },
        {
          type: "battleship",
          defId: "ship.battleship",
          count: 1,
          filledSlots: { weapon: "map.t6.laser" },
        },
      ],
      0,
      1,
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.reason, /оснащение/);
    }
  });
});
