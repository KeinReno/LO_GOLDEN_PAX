import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planetActionMsg, systemActionMsg } from "./viewerActionCopy.ts";
import { patchViewerPayload, sessionPatchFromAction, worldAfterCancelOrder } from "./viewerSessionPatch.ts";
import type { WorldState, ViewerPayload } from "../../../state/types.ts";

describe("viewerActionCopy", () => {
  it("planet labels", () => {
    assert.equal(planetActionMsg("staff"), "Рабочие назначены");
    assert.equal(planetActionMsg("unknown"), "Готово");
  });

  it("system labels", () => {
    assert.equal(systemActionMsg("produce_ship"), "Корабли добавлены во флот");
    assert.equal(systemActionMsg("x"), "Готово");
  });
});

describe("worldAfterCancelOrder", () => {
  it("drops order and fleet route", () => {
    const world = {
      orders: [
        { id: "o1", fleetId: "f1" },
        { id: "o2" },
      ],
      fleets: [{ id: "f1", route: [{ to: "s2" }] }],
      legions: [],
    } as unknown as WorldState;
    const next = worldAfterCancelOrder(world, "o1");
    assert.equal(next.orders.length, 1);
    assert.equal(next.orders[0]?.id, "o2");
    assert.deepEqual(next.fleets[0]?.route, []);
  });
});

describe("patchViewerPayload", () => {
  it("keeps prev when field omitted", () => {
    const prev = {
      world: { id: "w1" },
      factionId: "f1",
      visibleSystemIds: ["s1"],
      reservedAp: 2,
      economy: { stocks: { ore: 1 } },
    } as unknown as ViewerPayload;
    const next = patchViewerPayload(prev, { reservedAp: 5 });
    assert.equal(next.reservedAp, 5);
    assert.equal(next.factionId, "f1");
    assert.equal(next.economy, prev.economy);
  });
});

describe("sessionPatchFromAction", () => {
  it("returns null next when payload missing", () => {
    const { next, world } = sessionPatchFromAction(null, {
      world: { id: "w2" } as unknown as ViewerPayload["world"],
      reservedAp: 3,
    });
    assert.equal(next, null);
    assert.equal((world as unknown as { id: string })?.id, "w2");
  });

  it("patches payload and surfaces world", () => {
    const prev = {
      world: { id: "w1" },
      factionId: "f1",
      reservedAp: 1,
    } as unknown as ViewerPayload;
    const { next, world } = sessionPatchFromAction(prev, {
      world: { id: "w2" } as unknown as ViewerPayload["world"],
      reservedAp: 4,
    });
    assert.equal(next?.reservedAp, 4);
    assert.equal(next?.factionId, "f1");
    assert.equal((world as unknown as { id: string })?.id, "w2");
  });
});
