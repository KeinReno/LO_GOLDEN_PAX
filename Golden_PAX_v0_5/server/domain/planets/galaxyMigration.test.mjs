import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadContent } from "../../contentLoader.mjs";
import {
  assertMappedPlanet,
  assertMappedSystem,
  buildingCountCaps,
  collectKindZoneCombos,
  filterWorld,
  mapGalaxy,
  migratePlanet,
  percentileRank,
  resolveKindZoneDef,
  trimBuildings,
} from "./galaxyMigration.mjs";
import { planetCapFromBuildings } from "./populationCap.mjs";
import { surfaceSlotsForGrade } from "./planetGrade.mjs";

const content = loadContent(["core"]);

function b(id, kind, zone, name) {
  return { id, kind, zone, name: name || kind };
}

const fixture = {
  factions: [
    { id: "faction_a", name: "A", color: "#ffd500", primaryRaceId: "race_belator", password: "secret" },
  ],
  sectors: [{ id: "sec1", name: "Galivan", polygon: [1, 2, 3, 4], color: "#6e7f8d", notes: "lore" }],
  links: [{ id: "l1", fromId: "sys.small", toId: "sys.big", type: "corridor" }],
  systems: [
    {
      id: "sys.small",
      name: "Tiny",
      x: 10.5,
      y: -3,
      kind: "stellar",
      stars: [{ class: "G", luminosity: 1 }],
      ownerFactionId: "faction_a",
      spaceObjects: ["refugees", "asteroid"],
      isCapital: true,
      coOwnerFactionIds: ["faction_b"],
      logistics: { hopsToCapital: 0 },
      planets: [
        {
          id: "p.small",
          name: "Hamlet",
          type: "rocky",
          climate: "arid",
          habitable: true,
          population: 7,
          colonyType: "outpost",
          ownerFactionId: "faction_a",
          loyalty: 90,
          raceComposition: [{ raceId: "race_belator", percent: 100 }],
          resources: ["map.iron"],
          surfaceBuildings: [
            b("b1", "residential", "surface"),
            b("b2", "factory", "surface"),
            b("b3", "factory", "surface"),
            b("b4", "farm", "surface"),
            b("b5", "capitol", "surface"),
            b("b6", "mine", "surface"),
            b("b7", "depot", "surface"),
            b("b8", "factory", "surface"),
            b("b9", "factory", "surface"),
            b("b10", "farm", "surface"),
            b("b11", "defense", "surface"),
            b("b12", "lab", "surface"),
            b("b13", "barracks", "surface"),
            b("b14", "factory", "surface"),
            b("b15", "factory", "surface"),
            b("b16", "farm", "surface"),
            b("b17", "factory", "surface"),
            b("b18", "factory", "surface"),
            b("b19", "factory", "surface"),
            b("b20", "mine", "subsurface"),
          ],
          orbitalBuildings: [b("o1", "farm", "orbital"), b("o2", "spaceport", "orbital")],
        },
      ],
    },
    {
      id: "sys.big",
      name: "Huge",
      x: 99,
      y: 100,
      kind: "corridor",
      ownerFactionId: null,
      spaceObjects: ["pirate"],
      planets: [
        {
          id: "p.big",
          name: "Empty Megacity",
          type: "rocky",
          climate: "temperate",
          population: 398541252,
          colonyType: "none",
          surfaceBuildings: [],
          orbitalBuildings: [],
        },
        {
          id: "p.mid",
          name: "Colony",
          population: 1210023,
          colonyType: "colony",
          ownerFactionId: "faction_a",
          surfaceBuildings: [b("m1", "farm", "surface"), b("m2", "depot", "surface")],
          orbitalBuildings: [],
        },
      ],
    },
  ],
};

describe("building-count heuristic", () => {
  it("percentileRank is 0 at min and 1 at max", () => {
    const sorted = [7, 100, 1000, 1e6];
    expect(percentileRank(7, sorted)).toBe(0);
    expect(percentileRank(1e6, sorted)).toBe(1);
    expect(percentileRank(100, sorted)).toBeCloseTo(1 / 3);
  });

  it("pop 0 keeps zero buildings; low pop keeps ~1 surface", () => {
    expect(buildingCountCaps(0, 0)).toEqual({ maxSurface: 0, maxOrbital: 0 });
    expect(buildingCountCaps(7, 0).maxSurface).toBe(1);
    expect(buildingCountCaps(7, 0).maxOrbital).toBe(0);
    expect(buildingCountCaps(1e8, 1)).toEqual({ maxSurface: 48, maxOrbital: 12 });
  });

  it("trimBuildings prefers housing then capitol", () => {
    const kept = trimBuildings(
      [b("f", "factory", "surface"), b("r", "residential", "surface"), b("c", "capitol", "surface"), b("m", "mine", "surface")],
      2,
    );
    expect(kept.map((x) => x.kind)).toEqual(["residential", "capitol"]);
  });
});

describe("kind/zone resolution", () => {
  it("resolves every combo in the fixture, aliasing depot → factory", () => {
    const combos = collectKindZoneCombos(fixture);
    for (const key of combos.keys()) {
      const [kind, zone] = key.split("/");
      const r = resolveKindZoneDef(content, kind, zone);
      expect(r.ok, key).toBe(true);
    }
    const depot = resolveKindZoneDef(content, "depot", "surface");
    expect(depot.ok).toBe(true);
    expect(depot.aliased).toBe(true);
    expect(depot.def.kind).toBe("factory");
  });
});

describe("migratePlanet", () => {
  const populatedSorted = [7, 1210023, 398541252];

  it("does not copy old population; cap comes from kept buildings", () => {
    const src = fixture.systems[0].planets[0];
    const made = migratePlanet(src, { system: fixture.systems[0], content, populatedSorted });
    expect(made.ok).toBe(true);
    assertMappedPlanet(src, made.planet, content);
    expect(made.planet.population).not.toBe(7);
    expect(made.planet.population).toBe(planetCapFromBuildings(made.planet, content));
    expect(made.planet.surfaceBuildings.length).toBe(1);
    expect(made.planet.surfaceBuildings[0].kind).toBe("residential");
    expect(made.planet.grade).toBe(1);
    expect(made.planet.loyalty).toBeUndefined();
  });

  it("high-pop world with no buildings and colonyType none stays empty (pop 0)", () => {
    const src = fixture.systems[1].planets[0];
    const made = migratePlanet(src, { system: fixture.systems[1], content, populatedSorted });
    expect(made.planet.population).toBe(0);
    expect(made.planet.colonyType).toBe("none");
    expect(made.planet.surfaceBuildings).toHaveLength(0);
  });

  it("starting grade is the smallest that fits kept surface buildings", () => {
    const src = {
      id: "p.fit",
      name: "Fit",
      population: 1e8,
      colonyType: "colony",
      surfaceBuildings: Array.from({ length: 9 }, (_, i) => b(`s${i}`, "farm", "surface")),
      orbitalBuildings: Array.from({ length: 5 }, (_, i) => b(`o${i}`, "farm", "orbital")),
    };
    const made = migratePlanet(src, { system: { ownerFactionId: "faction_a" }, content, populatedSorted: [1e8] });
    expect(made.planet.surfaceBuildings.length).toBe(9);
    expect(made.planet.grade).toBe(2);
    expect(surfaceSlotsForGrade(made.planet.grade, content)).toBeGreaterThanOrEqual(9);
    expect(made.planet.orbitalGrade).toBe(2);
    assertMappedPlanet(src, made.planet, content);
  });
});

describe("mapGalaxy", () => {
  it("copies x/y/links/sectors/kind/stars and drops forbidden fields", () => {
    const mapped = mapGalaxy(fixture, content);
    expect(mapped.ok).toBe(true);
    const tiny = mapped.systems.find((s) => s.id === "sys.small");
    assertMappedSystem(tiny);
    expect(tiny).toMatchObject({ x: 10.5, y: -3, kind: "stellar" });
    expect(tiny.stars).toEqual([{ class: "G", luminosity: 1 }]);
    expect(tiny.isCapital).toBeUndefined();
    expect(tiny.coOwnerFactionIds).toBeUndefined();
    expect(tiny.logistics).toBeUndefined();
    expect(tiny.spaceObjects.map((o) => o.typeId).sort()).toEqual(["asteroid", "refugees"]);
    expect(tiny.spaceObjects.find((o) => o.typeId === "refugees").remainingAmount).toBeNull();
    expect(tiny.spaceObjects.find((o) => o.typeId === "asteroid").remainingAmount).toBe(240);
    expect(mapped.links).toEqual([{ id: "l1", fromId: "sys.small", toId: "sys.big", type: "corridor" }]);
    expect(mapped.sectors[0]).toMatchObject({ id: "sec1", notes: "lore", polygon: [1, 2, 3, 4] });
    expect(mapped.factions[0].password).toBeUndefined();
    expect(mapped.factions[0].raceId).toBe("race_belator");
    expect(mapped.planets.every((p) => p.systemId)).toBe(true);
  });

  it("filterWorld keeps only selected systems and internal links", () => {
    const sliced = filterWorld(fixture, ["sys.small"]);
    expect(sliced.systems).toHaveLength(1);
    expect(sliced.links).toHaveLength(0);
  });
});

const publishedPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../GMap/data/published.json");

describe("published.json mapping", () => {
  it.skipIf(!fs.existsSync(publishedPath))("resolves every kind/zone combo and does not copy large populations", () => {
    const world = JSON.parse(fs.readFileSync(publishedPath, "utf8"));
    const mapped = mapGalaxy(world, content);
    expect(mapped.ok).toBe(true);
    expect(mapped.unresolvedCombos).toEqual([]);
    expect(mapped.report.kindZoneCombos).toContain("depot/surface");
    expect(mapped.systems).toHaveLength(world.systems.length);
    expect(mapped.links).toHaveLength(world.links.length);
    const srcByPlanet = new Map();
    for (const sys of world.systems) {
      for (const p of sys.planets || []) srcByPlanet.set(p.id, p);
    }
    let checked = 0;
    for (const planet of mapped.planets) {
      const src = srcByPlanet.get(planet.id);
      if (!src) continue;
      assertMappedPlanet(src, planet, content);
      checked += 1;
    }
    expect(checked).toBe(mapped.planets.length);
  });
});
