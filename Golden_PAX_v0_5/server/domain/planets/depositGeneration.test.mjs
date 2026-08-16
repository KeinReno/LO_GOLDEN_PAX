/**
 * NOT a port — new design (grill Q1 / spec Priority 3c). Matching reuses
 * biomeMatch.mjs; empty biome_tags are excluded on purpose (see
 * depositGeneration.mjs header). Subset size 1–3 is a first-pass default.
 */
import { describe, it, expect } from "vitest";
import { getContent } from "../../contentLoader.mjs";
import { planetMatchesBiome } from "./biomeMatch.mjs";
import {
  resourceMatchesPlanet,
  depositsMatchingPlanet,
  generatePlanetResources,
  resolvePlanetResources,
  DEFAULT_DEPOSIT_MIN,
  DEFAULT_DEPOSIT_MAX,
} from "./depositGeneration.mjs";

const content = getContent(["core"]);

const fixture = {
  map_resources: {
    "map.iron": { id: "map.iron", biome_tags: ["rocky", "desert"] },
    "map.gas": { id: "map.gas", biome_tags: ["gas_giant"] },
    "map.ice": { id: "map.ice", biome_tags: ["ice"] },
    "map.alloys": { id: "map.alloys", biome_tags: [] },
    "map.only_desert": { id: "map.only_desert", biome_tags: ["desert"] },
  },
};

describe("resourceMatchesPlanet", () => {
  it("matches when any biome_tag hits type or climate (including aliases)", () => {
    const rockyArid = { type: "rocky", climate: "arid" };
    expect(resourceMatchesPlanet(rockyArid, ["rocky", "desert"])).toBe(true);
    expect(resourceMatchesPlanet(rockyArid, ["desert"])).toBe(true); // arid → desert
    expect(resourceMatchesPlanet({ type: "gas" }, ["gas_giant"])).toBe(true);
    expect(resourceMatchesPlanet(rockyArid, ["gas_giant"])).toBe(false);
  });

  it("rejects empty or missing biome_tags — untagged deposits are not auto-placed", () => {
    const planet = { type: "rocky", climate: "arid" };
    expect(resourceMatchesPlanet(planet, [])).toBe(false);
    expect(resourceMatchesPlanet(planet, undefined)).toBe(false);
  });
});

describe("depositsMatchingPlanet", () => {
  it("returns only tagged deposits that match, in content order", () => {
    expect(depositsMatchingPlanet({ type: "rocky", climate: "arid" }, fixture)).toEqual([
      "map.iron",
      "map.only_desert",
    ]);
    expect(depositsMatchingPlanet({ type: "gas" }, fixture)).toEqual(["map.gas"]);
    expect(depositsMatchingPlanet({ type: "ocean", climate: "temperate" }, fixture)).toEqual([]);
  });
});

describe("generatePlanetResources", () => {
  it("rolls between 1 and 3 (first-pass default), never more than the matching pool", () => {
    const planet = { type: "rocky", climate: "arid" };
    const pool = depositsMatchingPlanet(planet, fixture);
    expect(pool.length).toBe(2);

    expect(generatePlanetResources(planet, fixture, { rng: () => 0 })).toHaveLength(DEFAULT_DEPOSIT_MIN);
    const maxRoll = generatePlanetResources(planet, fixture, { rng: () => 0.999 });
    expect(maxRoll.length).toBe(Math.min(pool.length, DEFAULT_DEPOSIT_MAX));
    expect(new Set(maxRoll).size).toBe(maxRoll.length);
    for (const id of maxRoll) expect(pool).toContain(id);
  });

  it("returns [] when nothing matches", () => {
    expect(generatePlanetResources({ type: "ocean" }, fixture, { rng: () => 0.5 })).toEqual([]);
  });
});

describe("resolvePlanetResources", () => {
  it("keeps explicit resources (including []) even when autoGenerate is on", () => {
    const planet = { type: "rocky", climate: "arid", autoGenerateResources: true };
    expect(resolvePlanetResources({ ...planet, resources: ["map.gas"] }, fixture)).toEqual(["map.gas"]);
    expect(resolvePlanetResources({ ...planet, resources: [] }, fixture)).toEqual([]);
  });

  it("generates only when the flag is set and resources was omitted", () => {
    const generated = resolvePlanetResources(
      { type: "rocky", climate: "arid", autoGenerateResources: true },
      fixture,
      { rng: () => 0 },
    );
    expect(generated.length).toBeGreaterThanOrEqual(1);
    expect(generated.every((id) => ["map.iron", "map.only_desert"].includes(id))).toBe(true);

    expect(resolvePlanetResources({ type: "rocky", climate: "arid" }, fixture)).toEqual([]);
  });
});

describe("real map_resources.json", () => {
  it("every generated id actually biome-matches the planet", () => {
    const planet = { type: "rocky", climate: "arid" };
    const ids = generatePlanetResources(planet, content, { rng: () => 0.5 });
    expect(ids.length).toBeGreaterThanOrEqual(DEFAULT_DEPOSIT_MIN);
    expect(ids.length).toBeLessThanOrEqual(DEFAULT_DEPOSIT_MAX);
    for (const id of ids) {
      const def = content.map_resources[id];
      expect(def).toBeTruthy();
      expect(def.biome_tags.some((tag) => planetMatchesBiome(planet, tag))).toBe(true);
    }
  });
});
