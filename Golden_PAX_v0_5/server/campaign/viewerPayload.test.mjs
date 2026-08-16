import { describe, it, expect, beforeEach } from "vitest";
import { createDb } from "../db/store.mjs";
import { getContent } from "../contentLoader.mjs";
import { createCampaign, addFaction } from "./campaignStore.mjs";
import { seedFactionAccounts } from "./seed.mjs";
import { createSystem, createPlanet } from "./planetStore.mjs";
import { createSystemLink } from "./systemLinksStore.mjs";
import { createForce } from "./forcesStore.mjs";
import { saveEconomyAccount, loadEconomyAccount } from "./economyStore.mjs";
import { setRelation } from "./diplomacyStore.mjs";
import { persistOccupation } from "./occupy.mjs";
import { buildViewerPayload } from "./viewerPayload.mjs";

const content = getContent(["core"]);

describe("viewerPayload leak + occupy persist", () => {
  let db;
  let campaignId;

  beforeEach(() => {
    db = createDb(":memory:");
    const campaign = createCampaign(db, { name: "Fog Table" });
    campaignId = campaign.id;
    addFaction(db, campaignId, { id: "f1", name: "Alpha", raceId: "race_human", colorHex: "#111111" });
    addFaction(db, campaignId, { id: "f2", name: "Bravo", raceId: "race_belator", colorHex: "#222222" });
    seedFactionAccounts(db, campaignId, "f1", content);
    seedFactionAccounts(db, campaignId, "f2", content);

    createSystem(db, campaignId, { id: "A", name: "Alpha Home", ownerFactionId: "f1", x: 0, y: 0 });
    createSystem(db, campaignId, { id: "B", name: "Mid", ownerFactionId: null, x: 1, y: 0 });
    createSystem(db, campaignId, { id: "C", name: "Bravo Home", ownerFactionId: "f2", x: 2, y: 0 });
    createSystemLink(db, campaignId, { fromId: "A", toId: "B", type: "corridor" });
    createSystemLink(db, campaignId, { fromId: "B", toId: "C", type: "corridor" });
    createPlanet(db, campaignId, "A", { id: "pA", name: "A I", ownerFactionId: "f1", population: 10 });
    createPlanet(db, campaignId, "C", { id: "pC", name: "C I", ownerFactionId: "f2", population: 50 });
    createForce(db, campaignId, {
      factionId: "f2",
      kind: "legion",
      name: "Bravo Host",
      systemId: "C",
      composition: [{ defId: "unit.militia", count: 12, roles: ["infantry"], damage: 8, defense: 8 }],
    });
    const eco2 = loadEconomyAccount(db, campaignId, "f2");
    eco2.stocks["currency.metal"] = 999;
    saveEconomyAccount(db, campaignId, "f2", eco2, { turn: 0, journal: [] });
    setRelation(db, campaignId, "f1", "f2", "war");
  });

  it("f1 view does not leak f2 stocks, 2-hop systems, or foreign composition", () => {
    const view = buildViewerPayload(db, campaignId, "f1", content);
    expect(view.error).toBeUndefined();
    expect(view.viewer).toEqual({ role: "player", factionId: "f1" });
    expect(view.visibleSystemIds.sort()).toEqual(["A", "B"]);
    expect(view.systems.map((s) => s.id).sort()).toEqual(["A", "B"]);
    expect(view.systems.find((s) => s.id === "C")).toBeUndefined();
    expect(view.systems.find((s) => s.id === "A").knowledge).toBe(0);
    expect(view.systems.find((s) => s.id === "A").planets[0].population).toBe(10);
    expect(view.systems.find((s) => s.id === "B").knowledge).toBe(1);
    expect(view.systems.find((s) => s.id === "B").planets).toBeUndefined();

    const blob = JSON.stringify(view);
    expect(blob).not.toMatch(/"currency\.metal":999/);
    expect(view.self.economy.stocks["currency.metal"]).toBeDefined();
    expect(view.others.some((o) => o.id === "f2")).toBe(true);
    expect(view.others[0].raceId).toBeUndefined();
    expect(view.others[0].pegResourceId).toBeUndefined();
    expect(view.sectors).toBeUndefined();

    expect(view.forces.filter((f) => f.factionId === "f2")).toEqual([]);
  });

  it("foreign force on a visible system is spotted without composition", () => {
    createForce(db, campaignId, {
      factionId: "f2",
      kind: "fleet",
      name: "Spy",
      systemId: "B",
      composition: [{ defId: "ship.scout", count: 3, roles: ["screen"] }],
      engineTier: 1,
      fuelTier: 1,
      movementPoints: 3,
    });
    const view = buildViewerPayload(db, campaignId, "f1", content);
    const spy = view.forces.find((f) => f.name === "Spy");
    expect(spy).toMatchObject({ factionId: "f2", knowledge: "spotted", systemId: "B", approxCount: 3 });
    expect(spy.composition).toBeUndefined();
    expect(spy.movementPoints).toBeUndefined();
    expect(spy.engineTier).toBeUndefined();
  });

  it("persistOccupation transfers owner on C", () => {
    const result = persistOccupation(db, campaignId, "C", "f1");
    expect(result.ok).toBe(true);
    expect(result.system.ownerFactionId).toBe("f1");
    expect(result.system.planets[0].ownerFactionId).toBe("f1");
    expect(result.system.planets[0].population).toBe(46);
  });
});
