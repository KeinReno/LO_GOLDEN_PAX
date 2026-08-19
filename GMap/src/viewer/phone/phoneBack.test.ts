import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickPhoneBackLayer, type PhoneBackSnap } from "./phoneBack.ts";

const base: PhoneBackSnap = {
  dockMoreOpen: false,
  queueOpen: false,
  menuOpen: false,
  settingsOpen: false,
  mapFiltersOpen: false,
  mapFocusLevel: "galaxy",
  systemFocusId: null,
  viewMode: "map",
};

describe("pickPhoneBackLayer", () => {
  it("map with nothing open lets the browser leave", () => {
    assert.equal(pickPhoneBackLayer(base), null);
  });

  it("closes more menu before the room", () => {
    assert.equal(
      pickPhoneBackLayer({ ...base, dockMoreOpen: true, viewMode: "hq" }),
      "more",
    );
  });

  it("closes planet then dive then room", () => {
    assert.equal(
      pickPhoneBackLayer({
        ...base,
        mapFocusLevel: "planet",
        systemFocusId: "sol",
        viewMode: "map",
      }),
      "planet",
    );
    assert.equal(
      pickPhoneBackLayer({
        ...base,
        systemFocusId: "sol",
        viewMode: "map",
      }),
      "dive",
    );
    assert.equal(pickPhoneBackLayer({ ...base, viewMode: "forces" }), "room");
  });
});
