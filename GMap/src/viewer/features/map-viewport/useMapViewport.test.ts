import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeMapBackgroundPaused,
  computeShowMapLayer,
} from "./mapLayerVisibility.ts";

describe("computeShowMapLayer", () => {
  it("hides map on mobile immersive rp", () => {
    assert.equal(
      computeShowMapLayer({
        hasPayload: true,
        mobile: true,
        viewMode: "rp",
        queueOpen: false,
        sheetOpen: false,
      }),
      false,
    );
  });

  it("keeps map under desktop workbench", () => {
    assert.equal(
      computeShowMapLayer({
        hasPayload: true,
        mobile: false,
        viewMode: "hq",
        queueOpen: false,
        sheetOpen: false,
      }),
      true,
    );
  });

  it("false without payload", () => {
    assert.equal(
      computeShowMapLayer({
        hasPayload: false,
        mobile: false,
        viewMode: "map",
        queueOpen: false,
        sheetOpen: false,
      }),
      false,
    );
  });
});

describe("computeMapBackgroundPaused", () => {
  it("pauses on mobile sheet room", () => {
    assert.equal(
      computeMapBackgroundPaused({
        mobile: true,
        viewMode: "hq",
        sheetOpen: false,
      }),
      true,
    );
  });
});
