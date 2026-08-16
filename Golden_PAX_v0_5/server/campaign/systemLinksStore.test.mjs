import { describe, it, expect, beforeEach } from "vitest";
import { createDb } from "../db/store.mjs";
import { createCampaign, addFaction } from "./campaignStore.mjs";
import { createSystem } from "./planetStore.mjs";
import { createSystemLink, listSystemLinks, findUndirectedLink, deleteSystemLink, replaceOutgoingLinks } from "./systemLinksStore.mjs";

describe("systemLinksStore", () => {
  let db, campaignId;
  beforeEach(() => {
    db = createDb(":memory:");
    campaignId = createCampaign(db, { name: "Links" }).id;
    addFaction(db, campaignId, { id: "fA", name: "A", raceId: "race_human", colorHex: "#336699" });
    createSystem(db, campaignId, { id: "a", name: "A", ownerFactionId: "fA", x: 1, y: 2, isCapital: true });
    createSystem(db, campaignId, { id: "b", name: "B", ownerFactionId: "fA" });
    createSystem(db, campaignId, { id: "c", name: "C", ownerFactionId: "fA" });
  });

  it("creates an undirected link and lists it as { fromId, toId, type }", () => {
    const made = createSystemLink(db, campaignId, { fromId: "a", toId: "b", type: "gate" });
    expect(made.ok).toBe(true);
    expect(made.link).toMatchObject({ fromId: "a", toId: "b", type: "gate" });
    expect(listSystemLinks(db, campaignId)).toHaveLength(1);
    expect(findUndirectedLink(db, campaignId, "b", "a")?.id).toBe(made.link.id);
  });

  it("rejects a duplicate undirected pair", () => {
    createSystemLink(db, campaignId, { fromId: "a", toId: "b", type: "corridor" });
    const again = createSystemLink(db, campaignId, { fromId: "b", toId: "a", type: "gate" });
    expect(again.ok).toBe(false);
    expect(again.error).toBe("link_exists");
  });

  it("replaceOutgoingLinks swaps this system's authored edges", () => {
    createSystemLink(db, campaignId, { fromId: "a", toId: "b", type: "corridor" });
    const replaced = replaceOutgoingLinks(db, campaignId, "a", [{ toSystemId: "c", type: "damyl_planet" }]);
    expect(replaced.ok).toBe(true);
    const links = listSystemLinks(db, campaignId);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ fromId: "a", toId: "c", type: "damyl_planet" });
  });

  it("deleteSystemLink removes the row", () => {
    const made = createSystemLink(db, campaignId, { fromId: "a", toId: "b", type: "corridor" });
    expect(deleteSystemLink(db, campaignId, made.link.id)).toBe(true);
    expect(listSystemLinks(db, campaignId)).toHaveLength(0);
  });
});
