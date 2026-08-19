/**
 * Science ↔ buildings: unique megas, recompute from standing buildings, fillOnly slots.
 * Run: node --test server/techUnlockRebuild.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getContent } from "./contentLoader.mjs";
import {
  DEFAULT_TECH_TIERS,
  canBuildWithTech,
  collectRequiredProperties,
  recomputeUnlocksFromTechs,
} from "./techActions.mjs";

const startTiers = () => ({ ...DEFAULT_TECH_TIERS });

describe("unique megas", () => {
  it("gates Belator archive and Damyl gates by F tier in the raw catalog", () => {
    const c = getContent();
    const archive = c.buildings["mega.archive.belator"];
    const gates = c.buildings["mega.gate.damyl"];
    assert.equal(archive.category, "F");
    assert.equal(archive.tier, 9);
    assert.equal(gates.category, "F");
    assert.equal(gates.tier, 8);
    assert.equal(canBuildWithTech({ techTiers: startTiers() }, archive).ok, false);
    assert.equal(
      canBuildWithTech({ techTiers: { ...startTiers(), F: 8 } }, archive).ok,
      true,
    );
    assert.equal(canBuildWithTech({ techTiers: startTiers() }, gates).ok, false);
    assert.equal(
      canBuildWithTech({ techTiers: { ...startTiers(), F: 7 } }, gates).ok,
      true,
    );
  });
});

describe("recomputeUnlocksFromTechs", () => {
  it("keeps F10 from a standing Belator archive after wipe", () => {
    const c = getContent();
    const eco = {
      unlockedTechs: [],
      techTiers: startTiers(),
      unlockedProperties: [],
    };
    const world = {
      systems: [
        {
          ownerFactionId: "belator",
          planets: [
            {
              ownerFactionId: "belator",
              surfaceBuildings: [{ buildingId: "mega.archive.belator" }],
            },
          ],
        },
      ],
    };
    recomputeUnlocksFromTechs(eco, c, "belator", world);
    assert.equal(eco.techTiers.F, 10);
  });

  it("drops catalogPending techs and ignores their unlock_tech_tier", () => {
    const eco = {
      unlockedTechs: ["tech.stub_pending"],
      techTiers: startTiers(),
      unlockedProperties: ["catalog.scan"],
      techGrades: { "tech.stub_pending": 3 },
    };
    const content = {
      technologies: {
        "tech.stub_pending": {
          id: "tech.stub_pending",
          catalogPending: true,
          effects: [
            { effect: "unlock_tech_tier", args: { category: "A", to: 9 } },
            { effect: "unlock_property", args: { property: "catalog.scan" } },
          ],
        },
      },
    };
    recomputeUnlocksFromTechs(eco, content);
    assert.deepEqual(eco.unlockedTechs, []);
    assert.equal(eco.techTiers.A, 1);
    assert.equal(eco.unlockedProperties.includes("catalog.scan"), false);
    assert.equal(eco.techGrades["tech.stub_pending"], undefined);
  });
});

describe("fillOnly slots", () => {
  it("does not block relic vault construction on anomaly", () => {
    const c = getContent();
    const vault = c.buildings["building.relic_vault"];
    assert.equal(collectRequiredProperties(vault).has("anomaly"), false);
    const blocked = canBuildWithTech(
      { techTiers: { ...startTiers(), F: 4 }, roleScores: { exotic: 0 } },
      vault,
    );
    assert.equal(blocked.ok, false);
    const open = canBuildWithTech(
      { techTiers: { ...startTiers(), F: 4 }, roleScores: { exotic: 99999 } },
      vault,
    );
    assert.equal(open.ok, true);
  });
});

describe("name passport", () => {
  it("does not open the anomaly collector on letter A alone", () => {
    const c = getContent();
    const collector = c.buildings["extract.anomaly_collector"];
    assert.equal(collector.requireProperties?.[0], "anomaly_tap");
    const tapping = c.technologies["tech.anomaly_tapping"];
    assert.ok(
      tapping.effects?.some(
        (e) => e.effect === "unlock_property" && e.args?.property === "anomaly_tap",
      ),
    );
    const letterOnly = canBuildWithTech(
      { techTiers: { ...startTiers(), A: 9 } },
      collector,
    );
    assert.equal(letterOnly.ok, false);
    const named = canBuildWithTech(
      { techTiers: { ...startTiers(), A: 9 }, unlockedProperties: ["anomaly_tap"] },
      collector,
    );
    assert.equal(named.ok, true);
  });
});
