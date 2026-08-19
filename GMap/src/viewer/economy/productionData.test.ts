import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickFocusBuildSystemId } from "./productionNav.ts";
import { ECONOMY_SECTIONS } from "./types.ts";

describe("economy production nav", () => {
  it("section hotkeys are Alt+digit so dock 1–5 stay rooms", () => {
    assert.deepEqual(
      ECONOMY_SECTIONS.map((s) => s.hotkey),
      ["Alt+1", "Alt+2", "Alt+3", "Alt+4", "Alt+5"],
    );
  });

  it("pickFocusBuildSystemId prefers deficit signal over first owned", () => {
    const systems = [
      { id: "first", ownerFactionId: "me" },
      { id: "hole", ownerFactionId: "me" },
    ];
    assert.equal(
      pickFocusBuildSystemId("me", systems, [{ systemId: "hole" }]),
      "hole",
    );
    assert.equal(pickFocusBuildSystemId("me", systems, []), "first");
    assert.equal(pickFocusBuildSystemId("me", [], []), null);
  });
});
