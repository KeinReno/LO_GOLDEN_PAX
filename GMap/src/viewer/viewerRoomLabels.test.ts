import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { viewerWorkbenchSubtitle } from "./viewerRoomLabels.ts";

describe("viewerWorkbenchSubtitle", () => {
  it("forces copy is loadout, not a catalog", () => {
    const text = viewerWorkbenchSubtitle("forces") ?? "";
    assert.match(text, /конструктор/i);
    assert.doesNotMatch(text, /каталог/i);
  });

  it("planet subtitle is the job, not a widget tour", () => {
    const text = viewerWorkbenchSubtitle("planet") ?? "";
    assert.match(text, /этот ход/i);
    assert.doesNotMatch(text, /Alt\+/);
  });

  it("diplomacy subtitle names the desk", () => {
    const text = viewerWorkbenchSubtitle("diplomacy") ?? "";
    assert.match(text, /стол/i);
    assert.match(text, /разделы/i);
  });

  it("rp subtitle names scenes", () => {
    const text = viewerWorkbenchSubtitle("rp") ?? "";
    assert.match(text, /сцен/i);
  });

  it("quests subtitle is this-turn work, not a widget tour", () => {
    const text = viewerWorkbenchSubtitle("quests") ?? "";
    assert.match(text, /этот ход/i);
    assert.doesNotMatch(text, /СКМ/i);
    assert.doesNotMatch(text, /перевернуть/i);
  });
});
