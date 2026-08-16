import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { planetMatchesBiome as newMatch, planetAllowsBuildingBiome as newAllows } from "./biomeMatch.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const oldModulePath = path.resolve(__dirname, "../../../../GMap/server/biomeMatch.mjs");

describe("biomeMatch parity with GMap", () => {
  it("matches across type/climate combinations and restriction lists", async () => {
    const old = await import(oldModulePath);

    const planets = [
      { type: "rocky", climate: "arid" },
      { type: "ocean", climate: "temperate" },
      { type: "gas", climate: "" },
      { type: "toxic", climate: "swamp" },
      { type: "ice", climate: "frozen" },
      { type: "artifact", climate: "" },
    ];
    const restrictions = ["desert", "ocean", "gas_giant", "swamp", "ice", "ruin", "mountainous", "volcanic", "anomaly", "unknown_tag"];

    for (const planet of planets) {
      for (const r of restrictions) {
        expect(newMatch(planet, r)).toBe(old.planetMatchesBiome(planet, r));
      }
      expect(newAllows(planet, restrictions)).toBe(old.planetAllowsBuildingBiome(planet, restrictions));
      expect(newAllows(planet, [])).toBe(old.planetAllowsBuildingBiome(planet, []));
      expect(newAllows(planet, undefined)).toBe(old.planetAllowsBuildingBiome(planet, undefined));
    }
  });
});
