import { describe, it, expect, beforeEach } from "vitest";
import { createDb } from "../db/store.mjs";
import { createCampaign, addFaction } from "./campaignStore.mjs";
import { createSystem, createPlanet } from "./planetStore.mjs";
import { createForce, loadForce, listFactionForces, listCampaignForces, saveForce, deleteForce, transferForceFaction } from "./forcesStore.mjs";

describe("forcesStore round-trips", () => {
  let db, campaignId;
  beforeEach(() => {
    db = createDb(":memory:");
    const campaign = createCampaign(db, { name: "Forces Test" });
    campaignId = campaign.id;
    addFaction(db, campaignId, { id: "fA", name: "A", raceId: "race_human", colorHex: "#336699" });
    addFaction(db, campaignId, { id: "fB", name: "B", raceId: "race_human", colorHex: "#663399" });
  });

  it("creates and loads a force with its composition intact", () => {
    const system = createSystem(db, campaignId, { id: "sys1", name: "Sys 1", ownerFactionId: "fA" });
    const planet = createPlanet(db, campaignId, system.id, { id: "p1", name: "P1", habitable: true });
    const composition = [{ defId: "unit.militia", tier: 1, count: 5, roles: ["infantry"] }];
    const created = createForce(db, campaignId, { factionId: "fA", kind: "legion", name: "1st Levy", homePlanetId: planet.id, composition });
    const loaded = loadForce(db, campaignId, created.id);
    expect(loaded).toMatchObject({ factionId: "fA", kind: "legion", name: "1st Levy", homePlanetId: planet.id, composition });
  });

  it("defaults kind to fleet for anything other than legion", () => {
    const created = createForce(db, campaignId, { factionId: "fA", name: "Scout Wing", composition: [] });
    expect(created.kind).toBe("fleet");
  });

  it("listFactionForces only returns the querying faction's forces", () => {
    createForce(db, campaignId, { factionId: "fA", name: "A1", composition: [] });
    createForce(db, campaignId, { factionId: "fB", name: "B1", composition: [] });
    expect(listFactionForces(db, campaignId, "fA")).toHaveLength(1);
    expect(listFactionForces(db, campaignId, "fB")).toHaveLength(1);
  });

  it("listCampaignForces returns every faction's forces", () => {
    createForce(db, campaignId, { factionId: "fA", name: "A1", composition: [] });
    createForce(db, campaignId, { factionId: "fB", name: "B1", composition: [] });
    expect(listCampaignForces(db, campaignId)).toHaveLength(2);
  });

  it("saveForce updates composition in place", () => {
    const created = createForce(db, campaignId, { factionId: "fA", name: "A1", composition: [{ defId: "x", tier: 1, count: 1 }] });
    saveForce(db, campaignId, { ...created, composition: [{ defId: "x", tier: 1, count: 2 }] });
    expect(loadForce(db, campaignId, created.id).composition).toEqual([{ defId: "x", tier: 1, count: 2 }]);
  });

  it("deleteForce removes it", () => {
    const created = createForce(db, campaignId, { factionId: "fA", name: "A1", composition: [] });
    deleteForce(db, campaignId, created.id);
    expect(loadForce(db, campaignId, created.id)).toBeNull();
  });

  it("transferForceFaction changes factionId in the database", () => {
    const created = createForce(db, campaignId, { factionId: "fA", kind: "fleet", name: "Prize", composition: [{ defId: "ship.scout", count: 1, crewCount: 5 }] });
    const transferred = transferForceFaction(db, campaignId, created.id, "fB");
    expect(transferred.factionId).toBe("fB");
    expect(loadForce(db, campaignId, created.id).factionId).toBe("fB");
    expect(listFactionForces(db, campaignId, "fA")).toHaveLength(0);
    expect(listFactionForces(db, campaignId, "fB")[0].id).toBe(created.id);
  });

  it("persists systemId, movementPoints, and engine/fuel tiers", () => {
    createSystem(db, campaignId, { id: "sys1", name: "Sys 1", ownerFactionId: "fA" });
    const created = createForce(db, campaignId, {
      factionId: "fA",
      kind: "fleet",
      name: "Scout",
      systemId: "sys1",
      movementPoints: 4,
      engineTier: 1,
      fuelTier: 2,
      composition: [],
    });
    expect(created.systemId).toBe("sys1");
    expect(created.movementPoints).toBe(4);
    expect(created.engineTier).toBe(1);
    expect(created.fuelTier).toBe(2);
    saveForce(db, campaignId, { ...created, movementPoints: 1 });
    expect(loadForce(db, campaignId, created.id).movementPoints).toBe(1);
  });
});
