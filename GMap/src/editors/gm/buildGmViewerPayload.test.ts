import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WorldState } from "../../state/types";
import { asViewerEconomy, buildGmViewerPayload } from "./buildGmViewerPayload.ts";

describe("buildGmViewerPayload", () => {
  it("exposes every system (GM omniscient) for player rooms", () => {
    const world = {
      systems: [{ id: "a" }, { id: "b" }],
      factions: [{ id: "f1" }],
      meta: { tableRevision: 4, updatedAt: "t" },
    } as unknown as WorldState;
    const eco = asViewerEconomy({ stocks: { x: 1 }, taxes: {} });
    const payload = buildGmViewerPayload(world, "f1", eco);
    assert.equal(payload.factionId, "f1");
    assert.deepEqual(payload.visibleSystemIds, ["a", "b"]);
    assert.equal(payload.economy?.stocks?.x, 1);
  });
});

describe("asViewerEconomy", () => {
  it("rejects rows without stocks", () => {
    assert.equal(asViewerEconomy({ unlockedTechs: [] }), null);
    assert.ok(asViewerEconomy({ stocks: {} }));
  });
});
