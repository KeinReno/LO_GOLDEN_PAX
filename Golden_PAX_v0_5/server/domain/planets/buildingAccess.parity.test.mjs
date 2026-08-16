import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { canFactionBuildDef as newFn, raceIdsFromComposition as newRaceIds } from "./buildingAccess.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const oldModulePath = path.resolve(__dirname, "../../../../GMap/server/buildingAccess.mjs");

describe("buildingAccess parity with GMap", () => {
  it("canFactionBuildDef matches across generic/faction-locked/race-locked defs", async () => {
    const old = await import(oldModulePath);

    const defs = [
      { faction: "generic" },
      { faction: "belator" },
      { faction: "belator", prerequisites: { race: "belator" } },
      { faction: "generic", prerequisites: { races: ["human", "avian"] } },
    ];
    const cases = [
      ["faction_belator", { raceIds: ["belator"] }],
      ["faction_human", { raceIds: ["human"] }],
      ["faction_human", { raceIds: [] }],
      ["faction_human", { raceIds: ["human", "avian"] }],
    ];

    for (const def of defs) {
      for (const [factionId, opts] of cases) {
        expect(newFn(def, factionId, opts)).toBe(old.canFactionBuildDef(def, factionId, opts));
      }
    }
  });

  it("raceIdsFromComposition matches", async () => {
    const old = await import(oldModulePath);
    const comp = [{ raceId: "race_human", percent: 60 }, { raceId: "race_belator", percent: 40 }];
    expect(newRaceIds(comp)).toEqual(old.raceIdsFromComposition(comp));
    expect(newRaceIds(undefined)).toEqual(old.raceIdsFromComposition(undefined));
  });
});
