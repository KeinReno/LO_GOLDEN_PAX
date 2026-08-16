import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ViewerPayload } from "../../../state/types.ts";
import { emptyViewerPlayWorld } from "../map-viewport/viewerPlayMapModel.ts";
import {
  activeQuestCount,
  diploIncomingOffers,
  factionThemeVars,
  tradePartnerCount,
  viewerPlayHudStats,
  warCountForFaction,
} from "./viewerPlayHudStats.ts";

function payload(partial: Partial<ViewerPayload> & { factionId?: string }): ViewerPayload {
  return {
    factionId: "f1",
    world: emptyViewerPlayWorld(),
    ...partial,
  } as ViewerPayload;
}

describe("viewerPlayHudStats", () => {
  it("counts wars involving the player", () => {
    const p = payload({
      world: {
        ...emptyViewerPlayWorld(),
        diplomacy: [
          { aId: "f1", bId: "x", relation: "war" },
          { aId: "a", bId: "b", relation: "war" },
          { aId: "f1", bId: "y", relation: "peace" },
        ],
      } as ViewerPayload["world"],
    });
    assert.equal(warCountForFaction(p), 1);
  });

  it("counts active quests and incoming diplo", () => {
    const p = payload({
      world: {
        ...emptyViewerPlayWorld(),
        quests: [
          { status: "active" },
          { status: "done" },
          { status: "hidden" },
        ],
      } as ViewerPayload["world"],
      diploOffers: { incoming: [{ id: "o1" }, { id: "o2" }] } as ViewerPayload["diploOffers"],
      tradePartnerIds: ["a", "b"],
    });
    assert.equal(activeQuestCount(p), 1);
    assert.equal(diploIncomingOffers(p).length, 2);
    assert.equal(tradePartnerCount(p), 2);
    assert.equal(viewerPlayHudStats(p).warCount, 0);
  });

  it("faction theme falls back to gold", () => {
    const css = factionThemeVars(undefined);
    assert.equal(css["--faction"], "#c9a227");
    assert.equal(factionThemeVars({ color: "#11", fillColor: "#22" })["--faction"], "#11");
  });
});
