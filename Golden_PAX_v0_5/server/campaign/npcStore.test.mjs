import { describe, it, expect, beforeEach } from "vitest";
import { createDb } from "../db/store.mjs";
import { getContent } from "../contentLoader.mjs";
import { createCampaign, addFaction } from "./campaignStore.mjs";
import { seedFactionAccounts } from "./seed.mjs";
import { loadFactionCourt, saveFactionCourt, listFactionNpcs } from "./npcStore.mjs";
import { upsertNpc, removeNpc } from "../domain/court/npcRoster.mjs";

const content = getContent(["core"]);

describe("npcStore", () => {
  let db;
  let campaignId;
  beforeEach(() => {
    db = createDb(":memory:");
    const campaign = createCampaign(db, { name: "court" });
    campaignId = campaign.id;
    addFaction(db, campaignId, { id: "f0", name: "F", raceId: "race_human", colorHex: "#336699" });
    seedFactionAccounts(db, campaignId, "f0", content);
  });

  it("round-trips NPC CRUD and ensurePlayerRulers after a confirmed ruler remove", () => {
    let court = loadFactionCourt(db, campaignId, "f0", content);
    expect(court.internalBlocs.length).toBeGreaterThanOrEqual(11);
    const created = upsertNpc(court, { name: "Regent", raceId: "race_human", isPlayerRuler: true });
    saveFactionCourt(db, campaignId, "f0", { ...court, ...created });
    court = loadFactionCourt(db, campaignId, "f0", content);
    expect(court.rulerNpcId).toBeTruthy();
    expect(court.npcs[0].councilSeat).toBe("seat.ruler");

    const removed = removeNpc(court, court.npcs[0].id, { confirmSetRuler: true });
    saveFactionCourt(db, campaignId, "f0", { ...court, ...removed });
    expect(listFactionNpcs(db, campaignId, "f0")).toHaveLength(0);
    expect(loadFactionCourt(db, campaignId, "f0", content).rulerNpcId).toBeNull();
  });
});
