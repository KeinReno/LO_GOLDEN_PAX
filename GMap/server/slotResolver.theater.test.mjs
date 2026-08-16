/**
 * Theater split: ship guns ≠ legion small arms ≠ map ores.
 * Run: node --test server/slotResolver.theater.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resourceMatchesRequire } from "./slotResolver.mjs";
import { getContent } from "./contentLoader.mjs";
import { canBuildWithTech } from "./techActions.mjs";
import { canRaiseUnit } from "./forceRecruit.mjs";
import { addBuildingFlows, emptyFlows } from "./flowEngine.mjs";

describe("resourceMatchesRequire theater", () => {
  const ore = { id: "map.iron", properties: ["strong", "weapon"], category: "A", tier: 1 };
  const spaceGun = {
    id: "module.space.kinetic_cannon",
    kind: "module",
    theater: "space",
    properties: ["weapon", "kinetic"],
    category: "C",
    tier: 1,
  };
  const groundGun = {
    id: "module.ground.rifle",
    kind: "module",
    theater: "ground",
    properties: ["weapon", "small_arms"],
    category: "C",
    tier: 1,
  };

  it("rejects ores in theater-gated weapon slots", () => {
    assert.equal(
      resourceMatchesRequire(ore, { properties: ["weapon"], theater: "space", tier: ">=1" }),
      false,
    );
  });

  it("rejects space modules in ground slots and vice versa", () => {
    assert.equal(
      resourceMatchesRequire(spaceGun, { properties: ["weapon"], theater: "ground" }),
      false,
    );
    assert.equal(
      resourceMatchesRequire(groundGun, { properties: ["weapon"], theater: "space" }),
      false,
    );
  });

  it("rejects crafted modules in building slots without theater", () => {
    assert.equal(
      resourceMatchesRequire(spaceGun, { category: "C", tier: ">=1" }),
      false,
    );
    assert.equal(resourceMatchesRequire(ore, { properties: ["strong"], tier: ">=1" }), true);
  });

  it("accepts matching theater modules", () => {
    assert.equal(
      resourceMatchesRequire(spaceGun, { properties: ["weapon"], theater: "space", tier: ">=1" }),
      true,
    );
    assert.equal(
      resourceMatchesRequire(groundGun, { properties: ["weapon"], theater: "ground", tier: ">=1" }),
      true,
    );
  });
});

describe("content bind", () => {
  const c = getContent();

  it("loads crafted modules into map_resources", () => {
    assert.equal(c.map_resources["module.space.kinetic_cannon"]?.theater, "space");
    assert.equal(c.map_resources["module.ground.rifle"]?.theater, "ground");
    assert.equal(c.buildings["building.kinetic_forge"]?.requireProperties?.[0], "kinetic");
    assert.equal(c.buildings["building.armory"]?.requireProperties?.[0], "small_arms");
  });

  it("gates workshops on unlocked properties, not construction slots", () => {
    const def = c.buildings["building.kinetic_forge"];
    const blocked = canBuildWithTech({ techTiers: { C: 3 }, unlockedProperties: [] }, def);
    assert.equal(blocked.ok, false);
    const open = canBuildWithTech(
      { techTiers: { C: 3 }, unlockedProperties: ["kinetic"] },
      def,
    );
    assert.equal(open.ok, true);
  });

  it("gates corvette raise on keel property", () => {
    const system = {
      ownerFactionId: "fA",
      planets: [
        {
          ownerFactionId: "fA",
          orbitalBuildings: [{ kind: "spaceport" }],
          surfaceBuildings: [],
        },
      ],
    };
    const planet = { ownerFactionId: "fA" };
    const def = c.ships["ship.corvette"];
    assert.equal(canRaiseUnit(system, planet, def, "ship", "fA").ok, false);
    assert.equal(
      canRaiseUnit(system, planet, def, "ship", "fA", { unlockedProperties: ["corvette_keel"] }).ok,
      true,
    );
  });

  it("credits named module production instead of A–F flow", () => {
    const flows = emptyFlows();
    const named = {};
    addBuildingFlows(flows, c.buildings["building.kinetic_forge"], c, null, {
      namedProduction: named,
      rateScale: 1,
    });
    assert.equal(named["module.space.kinetic_cannon"], 1);
    const cRate = Object.values(flows.C || {}).reduce((s, cell) => s + (cell.rate || 0), 0);
    assert.equal(cRate, 0);
  });
});
