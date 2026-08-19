import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canFactionBuildDef } from "./buildingAccess.ts";

describe("canFactionBuildDef", () => {
  it("fails closed when a race is required and the mix is empty", () => {
    const def = { faction: "belator", prerequisites: { race: "norborian" } };
    assert.equal(canFactionBuildDef(def, "belator"), false);
    assert.equal(canFactionBuildDef(def, "belator", { raceIds: [] }), false);
    assert.equal(
      canFactionBuildDef(def, "faction_belator", { raceIds: ["norborian"] }),
      true,
    );
  });
});
