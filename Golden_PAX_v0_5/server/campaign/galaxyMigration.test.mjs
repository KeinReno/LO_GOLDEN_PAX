import { describe, it, expect, beforeEach } from "vitest";
import { createDb } from "../db/store.mjs";
import { loadContent } from "../contentLoader.mjs";
import { listFactions } from "./campaignStore.mjs";
import { getSystem, loadPlanet, listSystemsWithPlanets } from "./planetStore.mjs";
import { listSystemLinks } from "./systemLinksStore.mjs";
import { listSectors } from "./sectorStore.mjs";
import { mapGalaxy, assertMappedPlanet, filterWorld } from "../domain/planets/galaxyMigration.mjs";
import { persistMappedGalaxy } from "./galaxyMigration.mjs";
import { planetCapFromBuildings } from "../domain/planets/populationCap.mjs";

const content = loadContent(["core"]);

const world = {
  factions: [{ id: "faction_a", name: "A", color: "#112233", primaryRaceId: "race_human" }],
  sectors: [{ id: "sec1", name: "North", polygon: [0, 0, 1, 1], color: "#abcabc", notes: "n" }],
  links: [{ id: "l1", fromId: "s1", toId: "s2", type: "gate" }],
  systems: [
    {
      id: "s1",
      name: "One",
      x: 1.25,
      y: 2.5,
      kind: "stellar",
      stars: [{ class: "K", luminosity: 0.8 }],
      ownerFactionId: "faction_a",
      spaceObjects: ["refugees", "asteroid"],
      planets: [
        {
          id: "p1",
          name: "Home",
          type: "rocky",
          climate: "temperate",
          population: 50000,
          colonyType: "colony",
          ownerFactionId: "faction_a",
          raceComposition: [{ raceId: "race_human", percent: 100 }],
          resources: ["map.iron"],
          surfaceBuildings: [
            { id: "b1", kind: "residential", zone: "surface", name: "Hab" },
            { id: "b2", kind: "depot", zone: "surface", name: "Depot" },
            { id: "b3", kind: "mine", zone: "subsurface", name: "Shaft" },
          ],
          orbitalBuildings: [],
        },
      ],
    },
    {
      id: "s2",
      name: "Two",
      x: 9,
      y: 9,
      kind: "corridor",
      ownerFactionId: null,
      spaceObjects: [],
      planets: [
        {
          id: "p2",
          name: "Wild",
          population: 0,
          colonyType: "none",
          surfaceBuildings: [],
          orbitalBuildings: [],
        },
      ],
    },
  ],
};

describe("persistMappedGalaxy", () => {
  let db;
  beforeEach(() => {
    db = createDb(":memory:");
  });

  it("writes systems/planets/links/sectors through stores with derived population and grade", () => {
    const mapped = mapGalaxy(world, content);
    expect(mapped.ok).toBe(true);
    const { campaign, elapsedMs } = persistMappedGalaxy(db, mapped, { content, campaignName: "fixture" });
    expect(campaign.id).toBeTruthy();
    expect(elapsedMs).toBeGreaterThanOrEqual(0);

    expect(listFactions(db, campaign.id).map((f) => f.id)).toEqual(["faction_a"]);
    const s1 = getSystem(db, campaign.id, "s1");
    expect(s1).toMatchObject({ name: "One", x: 1.25, y: 2.5, kind: "stellar", ownerFactionId: "faction_a" });
    expect(s1.stars).toEqual([{ class: "K", luminosity: 0.8 }]);
    expect(s1.spaceObjects.map((o) => o.typeId).sort()).toEqual(["asteroid", "refugees"]);
    expect(s1.isCapital).toBe(false);

    const links = listSystemLinks(db, campaign.id);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ fromId: "s1", toId: "s2", type: "gate" });

    const sectors = listSectors(db, campaign.id);
    expect(sectors).toEqual([{ id: "sec1", name: "North", polygon: [0, 0, 1, 1], color: "#abcabc", notes: "n" }]);

    const p1 = loadPlanet(db, "s1", "p1");
    const src = world.systems[0].planets[0];
    assertMappedPlanet(src, p1, content);
    expect(p1.population).toBe(planetCapFromBuildings(p1, content));
    expect(p1.population).not.toBe(50000);
    expect(p1.surfaceBuildings.some((b) => b.zone === "subsurface")).toBe(true);
    expect(p1.surfaceBuildings.every((b) => b.buildingId)).toBe(true);
    expect(p1.loyalty).toBeUndefined();

    const nested = listSystemsWithPlanets(db, campaign.id);
    expect(nested).toHaveLength(2);
    expect(nested.find((s) => s.id === "s2").planets[0].population).toBe(0);
  });

  it("filterWorld sample still round-trips coordinates exactly", () => {
    const mapped = mapGalaxy(filterWorld(world, ["s1"]), content);
    const { campaign } = persistMappedGalaxy(db, mapped, { content });
    expect(listSystemsWithPlanets(db, campaign.id)).toHaveLength(1);
    const s1 = getSystem(db, campaign.id, "s1");
    expect(s1.x).toBe(1.25);
    expect(s1.y).toBe(2.5);
    expect(listSystemLinks(db, campaign.id)).toHaveLength(0);
  });
});
