import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickActiveCardBattle } from "./cardBattlePick.ts";
import { useViewerBattleSessionStore } from "../../../state/viewerBattleSessionStore.ts";

const card = (id: string, factionId = "me") => ({
  id,
  mode: "card" as const,
  status: "active" as const,
  theater: "fleet" as const,
  systemId: "sys_test",
  sides: [{ factionId }],
});

describe("pickActiveCardBattle", () => {
  it("returns null when minimized without pin", () => {
    assert.equal(
      pickActiveCardBattle([card("a")], "me", null, true),
      null,
    );
  });

  it("prefers pinned id", () => {
    const a = card("a");
    const b = card("b");
    assert.equal(
      pickActiveCardBattle([a, b], "me", "b", false)?.id,
      "b",
    );
  });

  it("falls back to own active card engagement", () => {
    const auto = {
      id: "x",
      mode: "auto",
      status: "active",
      sides: [{ factionId: "me" }],
    };
    const mine = card("c");
    assert.equal(
      pickActiveCardBattle([auto, mine], "me", null, false)?.id,
      "c",
    );
  });

  it("hides overlay when minimized pin does not match", () => {
    assert.equal(
      pickActiveCardBattle([card("a")], "me", "other", true),
      null,
    );
  });
});

describe("battle stanceBusy", () => {
  it("survives minimizeCardBattle", () => {
    const s = useViewerBattleSessionStore.getState();
    s.setStanceBusy(true);
    s.minimizeCardBattle();
    assert.equal(useViewerBattleSessionStore.getState().stanceBusy, true);
    s.setStanceBusy(false);
  });
});

describe("battle engagements", () => {
  it("keeps list across minimizeCardBattle", () => {
    const s = useViewerBattleSessionStore.getState();
    s.setEngagements([card("e1")]);
    s.minimizeCardBattle();
    assert.equal(useViewerBattleSessionStore.getState().engagements[0]?.id, "e1");
    s.setEngagements([]);
  });
});
