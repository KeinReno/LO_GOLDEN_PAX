import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { planetCapFromBuildings as newFn } from "./populationCap.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const oldModulePath = path.resolve(__dirname, "../../../../GMap/server/planetActions.mjs");
const oldContentLoaderPath = path.resolve(__dirname, "../../../../GMap/server/contentLoader.mjs");

describe("planetCapFromBuildings parity with GMap (real content)", () => {
  it("matches for an empty planet, one with real buildings, and different colony types", async () => {
    const { planetCapFromBuildings: oldFn } = await import(oldModulePath);
    const { getContent } = await import(oldContentLoaderPath);
    const content = getContent(["core"]);

    const bare = { surfaceBuildings: [], orbitalBuildings: [], colonyType: "none" };
    expect(newFn(bare, content)).toBe(oldFn(bare, content));

    const withBuildings = {
      surfaceBuildings: [{ buildingId: "building.residential" }, { buildingId: "building.capitol" }],
      orbitalBuildings: [{ buildingId: "building.orbital_defense" }],
      colonyType: "outpost",
    };
    expect(newFn(withBuildings, content)).toBe(oldFn(withBuildings, content));

    const core = { surfaceBuildings: [], orbitalBuildings: [], colonyType: "core" };
    expect(newFn(core, content)).toBe(oldFn(core, content));

    const disabled = { surfaceBuildings: [{ buildingId: "building.residential", disabled: true }], orbitalBuildings: [], colonyType: "none" };
    expect(newFn(disabled, content)).toBe(oldFn(disabled, content));
  });
});
