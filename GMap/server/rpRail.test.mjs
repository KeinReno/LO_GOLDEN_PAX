import assert from "node:assert/strict";
import test from "node:test";
import { summarizeMessagesForRail } from "./rpStore.mjs";

test("empty rail has null last and zero prompts", () => {
  const rail = summarizeMessagesForRail([]);
  assert.equal(rail.lastAt, null);
  assert.equal(rail.lastPreview, null);
  assert.equal(rail.openPrompts, 0);
  assert.deepEqual(rail.marks, []);
});

test("rail keeps last preview and open prompt count without bodies on marks", () => {
  const rail = summarizeMessagesForRail([
    {
      id: "a",
      at: "2026-08-18T10:00:00.000Z",
      body: "hello from the field commander",
      type: "ic",
      fromMaster: false,
      visibility: "all",
      authorFactionId: "f1",
    },
    {
      id: "b",
      at: "2026-08-18T11:00:00.000Z",
      body: "choose",
      type: "prompt",
      fromMaster: true,
      visibility: "all",
      prompt: { status: "open" },
    },
  ]);
  assert.equal(rail.lastAt, "2026-08-18T11:00:00.000Z");
  assert.equal(rail.lastPreview, "choose");
  assert.equal(rail.openPrompts, 1);
  assert.equal(rail.marks.length, 2);
  assert.equal(rail.marks[0].body, undefined);
  assert.equal(rail.marks[0].authorFactionId, "f1");
});
