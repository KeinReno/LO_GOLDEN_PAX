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

  it("counts quest attention (unrolled dice) not every active pin", () => {
    const base = emptyViewerPlayWorld();
    const p = payload({
      world: {
        ...base,
        quests: [
          {
            id: "idle",
            name: "В работе",
            summary: "",
            systemId: null,
            status: "active",
            sourceFactionId: "f1",
          },
          {
            id: "theirs",
            name: "Чужой",
            summary: "",
            systemId: null,
            status: "active",
            sourceFactionId: "f2",
            type: "side",
          },
          { id: "done", name: "Готово", summary: "", systemId: null, status: "done" },
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

  it("counts court attention as ungoverned systems plus vacant houses", () => {
    const p = payload({
      world: {
        ...emptyViewerPlayWorld(),
        systems: [
          {
            id: "s1",
            name: "A",
            ownerFactionId: "f1",
            planets: [{ population: 12 }],
          },
          {
            id: "s2",
            name: "B",
            ownerFactionId: "f1",
            planets: [{ population: 8 }],
          },
          {
            id: "s3",
            name: "Empty",
            ownerFactionId: "f1",
            planets: [{ population: 0 }],
          },
        ],
        factions: [
          {
            id: "f1",
            npcs: [],
            internalBlocs: [
              { id: "h1", name: "Vacant", kind: "house", stance: "neutral", influence: 0 },
              {
                id: "h2",
                name: "Held",
                kind: "house",
                stance: "loyal",
                influence: 10,
                leaderNpcId: "n1",
              },
            ],
          },
        ],
      } as unknown as ViewerPayload["world"],
    });
    assert.equal(viewerPlayHudStats(p).courtAttentionCount, 3);
  });
});
