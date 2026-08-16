import { describe, it, expect, beforeEach } from "vitest";
import { createDb } from "../db/store.mjs";
import { getContent } from "../contentLoader.mjs";
import { createCampaign, addFaction } from "./campaignStore.mjs";
import { createSystem, createPlanet, loadPlanet, loadSystemWithPlanets, listFactionPlanets, savePlanet } from "./planetStore.mjs";
import { colonizePlanet } from "../domain/planets/colonization.mjs";
import { placeBuilding } from "../domain/planets/construction.mjs";

const content = getContent(["core"]);

function setup(db) {
  const campaign = createCampaign(db, { name: "World Test" });
  addFaction(db, campaign.id, { id: "fA", name: "A", raceId: "race_human", colorHex: "#336699" });
  const system = createSystem(db, campaign.id, { id: "sys1", name: "Sys 1", ownerFactionId: "fA" });
  const planet = createPlanet(db, campaign.id, system.id, { id: "p1", name: "Planet 1", type: "rocky", climate: "arid", habitable: true });
  return { campaignId: campaign.id, system, planet };
}

describe("planetStore round-trips", () => {
  let db;
  beforeEach(() => {
    db = createDb(":memory:");
  });

  it("loadPlanet returns the shape domain/planets functions expect, with empty building lists", () => {
    const { campaignId, system, planet } = setup(db);
    const loaded = loadPlanet(db, system.id, planet.id);
    expect(loaded).toMatchObject({ id: "p1", name: "Planet 1", population: 0, colonyType: "none", surfaceBuildings: [], orbitalBuildings: [] });
    void campaignId;
  });

  it("colonizePlanet's result round-trips through savePlanet/loadPlanet", () => {
    const { campaignId, system, planet } = setup(db);
    const result = colonizePlanet(system, planet, "fA", "outpost", { "currency.metal": 100, "currency.supply": 100 }, content, { mode: "auto", founderRaceId: "race_human", factionPlanets: [] });
    expect(result.ok).toBe(true);

    savePlanet(db, campaignId, result.planet);
    const reloaded = loadPlanet(db, system.id, planet.id);
    expect(reloaded.ownerFactionId).toBe("fA");
    expect(reloaded.population).toBeGreaterThan(0);
    expect(reloaded.colonyType).toBe("outpost");
  });

  it("placeBuilding's result persists the building instance", () => {
    const { campaignId, system, planet } = setup(db);
    const colonized = colonizePlanet(system, planet, "fA", "outpost", { "currency.metal": 100, "currency.supply": 100 }, content, { mode: "auto", founderRaceId: "race_human", factionPlanets: [] }).planet;
    savePlanet(db, campaignId, colonized);

    const buildResult = placeBuilding(system, colonized, content.buildings["building.mine"], "fA", { "currency.metal": 100, "currency.supply": 100, "currency.extracta": 100 }, content);
    expect(buildResult.ok).toBe(true);
    savePlanet(db, campaignId, buildResult.planet);

    const reloaded = loadPlanet(db, system.id, planet.id);
    expect(reloaded.surfaceBuildings).toHaveLength(1);
    expect(reloaded.surfaceBuildings[0].buildingId).toBe("building.mine");
  });

  it("listFactionPlanets finds owned planets across systems", () => {
    const { campaignId, system, planet } = setup(db);
    const owned = colonizePlanet(system, planet, "fA", "outpost", { "currency.metal": 100, "currency.supply": 100 }, content, { mode: "auto", founderRaceId: "race_human", factionPlanets: [] }).planet;
    savePlanet(db, campaignId, owned);

    expect(listFactionPlanets(db, campaignId, "fA")).toHaveLength(1);
    expect(listFactionPlanets(db, campaignId, "fB")).toHaveLength(0);
  });

  it("loadSystemWithPlanets nests every planet in the system", () => {
    const { campaignId, system } = setup(db);
    createPlanet(db, campaignId, system.id, { id: "p2", name: "Planet 2", habitable: true });
    const loaded = loadSystemWithPlanets(db, campaignId, system.id);
    expect(loaded.planets.map((p) => p.id).sort()).toEqual(["p1", "p2"]);
  });

  it("new planets start at grade 1 (8/4 slots); savePlanet persists a grade upgrade", () => {
    const { campaignId, system, planet } = setup(db);
    expect(planet.grade).toBe(1);
    expect(planet.orbitalGrade).toBe(1);
    expect(planet.surfaceSlots).toBe(8);
    expect(planet.orbitalSlots).toBe(4);

    savePlanet(db, campaignId, { ...planet, grade: 2, orbitalGrade: 3 });
    const reloaded = loadPlanet(db, system.id, planet.id);
    expect(reloaded.grade).toBe(2);
    expect(reloaded.surfaceSlots).toBe(18);
    expect(reloaded.orbitalGrade).toBe(3);
    expect(reloaded.orbitalSlots).toBe(8);
  });

  it("createSystem persists space objects and loadSystemWithPlanets returns them", () => {
    const { campaignId } = setup(db);
    const sys = createSystem(db, campaignId, {
      id: "sys2",
      name: "Belt",
      ownerFactionId: "fA",
      spaceObjects: [{ typeId: "asteroid", remainingAmount: 240 }],
    });
    expect(sys.spaceObjects).toHaveLength(1);
    expect(sys.spaceObjects[0].typeId).toBe("asteroid");
    expect(sys.spaceObjects[0].remainingAmount).toBe(240);
    const loaded = loadSystemWithPlanets(db, campaignId, "sys2");
    expect(loaded.spaceObjects[0].typeId).toBe("asteroid");
  });

  it("createSystem persists display x/y and isCapital", () => {
    const { campaignId } = setup(db);
    const sys = createSystem(db, campaignId, { id: "sys3", name: "Cap", ownerFactionId: "fA", x: 10.5, y: -3, isCapital: true });
    expect(sys).toMatchObject({ x: 10.5, y: -3, isCapital: true });
    const loaded = loadSystemWithPlanets(db, campaignId, "sys3");
    expect(loaded.x).toBe(10.5);
    expect(loaded.isCapital).toBe(true);
  });

  it("createSystem persists kind and stars", () => {
    const { campaignId } = setup(db);
    const sys = createSystem(db, campaignId, {
      id: "sys4",
      name: "Solis",
      kind: "stellar",
      stars: [{ class: "G", luminosity: 1.4 }],
      x: 1,
      y: 2,
    });
    expect(sys.kind).toBe("stellar");
    expect(sys.stars).toEqual([{ class: "G", luminosity: 1.4 }]);
  });

  it("savePlanet/loadPlanet round-trips subsurface and deep buildings in the surface pool", () => {
    const { campaignId, system, planet } = setup(db);
    savePlanet(db, campaignId, {
      ...planet,
      surfaceBuildings: [
        { id: "b1", buildingId: "building.mine", name: "Mine", kind: "mine", zone: "surface" },
        { id: "b2", buildingId: "extract.deep_shaft", name: "Shaft", kind: "mine", zone: "subsurface" },
        { id: "b3", buildingId: "extract.anomaly_collector", name: "Deep", kind: "mine", zone: "deep" },
      ],
    });
    const reloaded = loadPlanet(db, system.id, planet.id);
    expect(reloaded.surfaceBuildings.map((b) => b.zone).sort()).toEqual(["deep", "subsurface", "surface"]);
    expect(reloaded.orbitalBuildings).toHaveLength(0);
  });
});
