import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  shouldAbandonEngagement,
  abandonReason,
  engagementHasGhostFaction,
  engagementForcesLeftTheater,
} from "./abandon.mjs";

const world = {
  factions: [{ id: "faction_a" }, { id: "faction_b" }],
  fleets: [
    { id: "fl_here", systemId: "sys-1" },
    { id: "fl_away", systemId: "sys-2" },
  ],
};

describe("shouldAbandonEngagement", () => {
  it("keeps a co-located fight with live factions", () => {
    const eng = {
      systemId: "sys-1",
      sides: [
        { factionId: "faction_a", fleetIds: ["fl_here"] },
        { factionId: "faction_b", fleetIds: [] },
      ],
    };
    assert.equal(shouldAbandonEngagement(world, eng), false);
  });

  it("abandons when a side is not a board faction", () => {
    const eng = {
      systemId: "sys-1",
      sides: [
        { factionId: "64928514-afb3-4cdb-b79c-23dd39cdcbd0", fleetIds: ["fl_here"] },
        { factionId: "faction_b", fleetIds: [] },
      ],
    };
    assert.equal(engagementHasGhostFaction(world, eng), true);
    assert.equal(abandonReason(world, eng), "ghost_faction");
    assert.equal(shouldAbandonEngagement(world, eng), true);
  });

  it("abandons when a listed fleet already left the theater", () => {
    const eng = {
      systemId: "sys-1",
      sides: [
        { factionId: "faction_a", fleetIds: ["fl_away"] },
        { factionId: "faction_b", fleetIds: ["fl_here"] },
      ],
    };
    assert.equal(engagementForcesLeftTheater(world, eng), true);
    assert.equal(abandonReason(world, eng), "left_theater");
    assert.equal(shouldAbandonEngagement(world, eng), true);
  });
});
