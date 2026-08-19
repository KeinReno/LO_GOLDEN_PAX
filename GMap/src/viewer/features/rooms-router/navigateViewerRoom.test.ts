import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isDesktopWorkbenchView,
  isPlayerDockCompact,
  isMobileImmersiveView,
  pickRoomKey,
} from "./roomViewFlags.ts";
import { resolveViewerRoomPanel } from "./viewerRoomRegistry.ts";

describe("room flags", () => {
  it("desktop workbench rooms", () => {
    assert.equal(isDesktopWorkbenchView(false, "hq"), true);
    assert.equal(isDesktopWorkbenchView(false, "rp"), true);
    assert.equal(isDesktopWorkbenchView(false, "planet"), false);
    assert.equal(isDesktopWorkbenchView(false, "map"), false);
    assert.equal(isDesktopWorkbenchView(true, "hq"), false);
  });

  it("compact dock on dive or workbench", () => {
    assert.equal(isPlayerDockCompact(false, "map", true), true);
    assert.equal(isPlayerDockCompact(false, "map", false), false);
    assert.equal(isPlayerDockCompact(false, "economy", false), true);
    assert.equal(isPlayerDockCompact(true, "map", true), false);
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

  it("skips map; RP is a workbench room", () => {
    assert.equal(resolveViewerRoomPanel("map", false, panels), null);
    assert.equal(resolveViewerRoomPanel("rp", false, panels), "RP");
  });

  it("skips sheet panel while immersive", () => {
    assert.equal(resolveViewerRoomPanel("quests", true, panels), null);
    assert.equal(resolveViewerRoomPanel("hq", false, panels), "HQ");
  });
});
