import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recruitOpenGate, recruitPickNote } from "./recruitMapPick.ts";

describe("recruitOpenGate", () => {
  it("lets ordinary map clicks through when not picking", () => {
    assert.deepEqual(recruitOpenGate(null, "s1"), { action: "pass" });
  });

  it("opens a highlighted hub and blocks the rest", () => {
    const pick = { tab: "ships" as const, hubIds: ["yard"] };
    assert.deepEqual(recruitOpenGate(pick, "yard"), {
      action: "consume",
      tab: "ships",
    });
    const blocked = recruitOpenGate(pick, "other");
    assert.equal(blocked.action, "block");
  });
});

describe("recruitPickNote", () => {
  it("says to click a highlighted yard and mentions pop cost", () => {
    const text = recruitPickNote("ships", 2);
    assert.match(text, /верф/i);
    assert.match(text, /население/i);
  });
});
