import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  inferPrimaryRaceId,
  stampFactionPrimaryRaces,
} from "./factions.mjs";

describe("stampFactionPrimaryRaces", () => {
  it("infers majority race from owned planet composition", () => {
    const world = {
      factions: [{ id: "fA", primaryRaceId: null }],
      systems: [
        {
          ownerFactionId: "fA",
          planets: [
            {
              population: 10,
              raceComposition: [
                { raceId: "heshah", percent: 80 },
                { raceId: "sikuri", percent: 20 },
              ],
            },
          ],
        },
      ],
    };
    assert.equal(inferPrimaryRaceId(world, "fA"), "heshah");
    stampFactionPrimaryRaces(world);
    assert.equal(world.factions[0].primaryRaceId, "heshah");
  });

  it("does not overwrite an existing primaryRaceId", () => {
    const world = {
      factions: [{ id: "fA", primaryRaceId: "race_human" }],
      systems: [
        {
          ownerFactionId: "fA",
          planets: [
            { population: 10, raceComposition: [{ raceId: "heshah", percent: 100 }] },
          ],
        },
      ],
    };
    stampFactionPrimaryRaces(world);
    assert.equal(world.factions[0].primaryRaceId, "race_human");
  });

  it("prefers faction-id catalog hint over mixed planet majority", () => {
    const world = {
      factions: [{ id: "faction_karned", primaryRaceId: null }],
      systems: [
        {
          ownerFactionId: "faction_karned",
          planets: [
            { population: 10, raceComposition: [{ raceId: "race_lithoid", percent: 100 }] },
          ],
        },
      ],
    };
    stampFactionPrimaryRaces(world, { race_karned: { id: "race_karned" } });
    assert.equal(world.factions[0].primaryRaceId, "race_karned");
  });
});
