import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { matchesFilter as newFn } from "./filterContext.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const oldModulePath = path.resolve(__dirname, "../../../../GMap/server/questEngine.mjs");

function ctx(overrides) {
  return {
    era: 1,
    warCount: 0,
    hasRefugees: false,
    borderWithWar: false,
    hasRace: () => false,
    hasBuilding: () => false,
    lowLoyaltyRace: () => false,
    arcActive: () => false,
    ...overrides,
  };
}

describe("matchesFilter parity with GMap", () => {
  it("matches across every filter condition", async () => {
    const { matchesFilter: oldFn } = await import(oldModulePath);

    const cases = [
      [{ minEra: 2 }, ctx({ era: 1 })],
      [{ minEra: 2 }, ctx({ era: 3 })],
      [{ maxWarCount: 1 }, ctx({ warCount: 2 })],
      [{ hasRefugees: true }, ctx({ hasRefugees: false })],
      [{ hasRefugees: true }, ctx({ hasRefugees: true })],
      [{ requiresRace: "race_avian" }, ctx({ hasRace: (r) => r === "race_avian" })],
      [{ requiresBuilding: "building.x" }, ctx({ hasBuilding: () => false })],
      [{ excludeIfArcActive: "arc.war" }, ctx({ arcActive: () => true })],
      [{}, ctx()],
      [null, ctx()],
    ];

    for (const [filterBy, c] of cases) {
      expect(newFn(filterBy, c)).toBe(oldFn(filterBy, c));
    }
  });
});
