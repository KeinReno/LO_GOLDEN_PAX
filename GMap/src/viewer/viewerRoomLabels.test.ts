import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { viewerWorkbenchSubtitle } from "./viewerRoomLabels.ts";

describe("viewerWorkbenchSubtitle", () => {
  it("forces copy is loadout, not a catalog", () => {
    const text = viewerWorkbenchSubtitle("forces") ?? "";
    assert.match(text, /оснащение/i);
    assert.doesNotMatch(text, /каталог/i);
  });
});
