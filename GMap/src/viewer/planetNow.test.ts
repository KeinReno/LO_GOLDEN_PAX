import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPlanetNowItems } from "./planetNow.ts";

describe("buildPlanetNowItems", () => {
  it("puts build before labor when both exist", () => {
    const items = buildPlanetNowItems({
      emptySurface: 1,
      emptyOrbital: 0,
      laborFree: 2,
      laborOpen: 2,
      idleBuildingName: "Шахта",
      canUpgradeSurface: true,
    });
    assert.equal(items[0]?.id, "build-surface");
    assert.equal(items[1]?.id, "labor");
    assert.match(items[1]?.detail ?? "", /Шахта/);
  });

  it("stays quiet when nothing is due", () => {
    const items = buildPlanetNowItems({
      emptySurface: 0,
      emptyOrbital: 0,
      laborFree: 0,
      laborOpen: 0,
      canUpgradeSurface: false,
    });
    assert.equal(items.length, 0);
  });
});
