import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pendingOrderCount } from "./pendingOrderCount.ts";

describe("pendingOrderCount", () => {
  it("counts pending only", () => {
    assert.equal(
      pendingOrderCount([
        { status: "pending" },
        { status: "done" },
        { status: "pending" },
      ]),
      2,
    );
  });

  it("is 0 for empty or missing", () => {
    assert.equal(pendingOrderCount([]), 0);
    assert.equal(pendingOrderCount(null), 0);
    assert.equal(pendingOrderCount(undefined), 0);
  });
});
