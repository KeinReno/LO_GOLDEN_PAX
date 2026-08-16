import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  caravanDropAmount,
  pickTargetSetNote,
  resolveMapSystemClick,
} from "./mapClickResolve.ts";

describe("mapClickResolve", () => {
  it("pick-target names the system", () => {
    const d = resolveMapSystemClick({
      systemId: "s2",
      pickingTarget: true,
      touchMoveArmed: false,
      selectedFleetId: "f1",
      selectedLegionId: null,
      factionId: "north",
      mobile: false,
      viewMode: "map",
      systemName: "Альтаир",
      unit: null,
      hops: 0,
    });
    assert.equal(d.kind, "pick-target");
    if (d.kind === "pick-target") {
      assert.equal(d.name, "Альтаир");
      assert.equal(pickTargetSetNote(d.name), "Цель: Альтаир");
    }
  });

  it("touch-move when own unit and hops", () => {
    const d = resolveMapSystemClick({
      systemId: "s2",
      pickingTarget: false,
      touchMoveArmed: true,
      selectedFleetId: "f1",
      selectedLegionId: null,
      factionId: "north",
      mobile: true,
      viewMode: "map",
      unit: { factionId: "north", systemId: "s1" },
      hops: 2,
    });
    assert.equal(d.kind, "touch-move");
    if (d.kind === "touch-move") {
      assert.equal(d.unitKind, "fleet");
      assert.equal(d.hops, 2);
    }
  });

  it("touch-move-fail without path", () => {
    const d = resolveMapSystemClick({
      systemId: "s2",
      pickingTarget: false,
      touchMoveArmed: true,
      selectedFleetId: "f1",
      selectedLegionId: null,
      factionId: "north",
      mobile: true,
      viewMode: "map",
      unit: { factionId: "north", systemId: "s1" },
      hops: 0,
    });
    assert.equal(d.kind, "touch-move-fail");
  });

  it("armed without a valid unit falls through to select", () => {
    const d = resolveMapSystemClick({
      systemId: "s2",
      pickingTarget: false,
      touchMoveArmed: true,
      selectedFleetId: null,
      selectedLegionId: null,
      factionId: "north",
      mobile: false,
      viewMode: "map",
      unit: null,
      hops: 0,
    });
    assert.equal(d.kind, "select");
  });

  it("plain select opens sheet on mobile map", () => {
    const d = resolveMapSystemClick({
      systemId: "s1",
      pickingTarget: false,
      touchMoveArmed: false,
      selectedFleetId: null,
      selectedLegionId: null,
      factionId: "north",
      mobile: true,
      viewMode: "map",
      unit: null,
      hops: 0,
    });
    assert.deepEqual(d, {
      kind: "select",
      systemId: "s1",
      openSheet: true,
    });
  });

  it("caravan drop is 25% stock, min 1", () => {
    assert.equal(caravanDropAmount(0), 1);
    assert.equal(caravanDropAmount(8), 2);
    assert.equal(caravanDropAmount(100), 25);
  });
});
