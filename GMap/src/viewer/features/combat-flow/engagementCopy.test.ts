import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cardBattleRequestMsg,
  replaceEngagement,
  stanceLockedMsg,
} from "./engagementCopy.ts";

describe("engagementCopy", () => {
  it("stance locked toast", () => {
    assert.equal(stanceLockedMsg("Штурм"), "Поза «Штурм» зафиксирована");
  });

  it("card request toasts", () => {
    assert.match(cardBattleRequestMsg(true), /взаимное/);
    assert.match(cardBattleRequestMsg(false), /отправлен/);
  });

  it("replaceEngagement swaps matching id", () => {
    const next = replaceEngagement(
      [
        { id: "a", mode: "auto" },
        { id: "b", mode: "auto" },
      ],
      "b",
      { id: "b", mode: "card" },
    );
    assert.equal(next[1]?.mode, "card");
    assert.equal(next[0]?.mode, "auto");
  });
});
