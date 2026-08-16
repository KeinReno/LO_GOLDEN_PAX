import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isDesktopWorkbenchView,
  isMobileImmersiveView,
  pickRoomKey,
} from "./roomViewFlags.ts";
import { resolveViewerRoomPanel } from "./viewerRoomRegistry.ts";

describe("room flags", () => {
  it("desktop workbench rooms", () => {
    assert.equal(isDesktopWorkbenchView(false, "hq"), true);
    assert.equal(isDesktopWorkbenchView(false, "map"), false);
    assert.equal(isDesktopWorkbenchView(true, "hq"), false);
  });

  it("mobile immersive rp/quests", () => {
    assert.equal(isMobileImmersiveView(true, "rp"), true);
    assert.equal(isMobileImmersiveView(true, "hq"), false);
    assert.equal(isMobileImmersiveView(false, "rp"), false);
  });

  it("pickRoomKey", () => {
    assert.equal(pickRoomKey("map", false), null);
    assert.equal(pickRoomKey("hq", false), "hq");
    assert.equal(pickRoomKey("quests", true), "quests");
    assert.equal(pickRoomKey("quests", false), "quests");
    assert.equal(pickRoomKey("rp", false), "rp");
  });
});

describe("resolveViewerRoomPanel", () => {
  const panels = { hq: "HQ", rp: "RP", quests: "Q" };

  it("skips map and rp workbench", () => {
    assert.equal(resolveViewerRoomPanel("map", false, panels), null);
    assert.equal(resolveViewerRoomPanel("rp", false, panels), null);
  });

  it("skips sheet panel while immersive", () => {
    assert.equal(resolveViewerRoomPanel("quests", true, panels), null);
    assert.equal(resolveViewerRoomPanel("hq", false, panels), "HQ");
  });
});
