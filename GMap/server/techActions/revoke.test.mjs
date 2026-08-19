/**
 * GM revoke: drop unlocked tech and rebuild derived unlocks.
 * Run: node --test server/techActions/revoke.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TECH_TIERS,
  recomputeUnlocksFromTechs,
  stripTechFromEco,
} from "../techActions.mjs";

describe("stripTechFromEco", () => {
  it("removes the tech, upgrades, queue and rebuilds the derived tier", () => {
    const content = {
      technologies: {
        "tech.foo": {
          id: "tech.foo",
          effects: [
            { effect: "unlock_tech_tier", args: { category: "A", to: 4 } },
          ],
        },
      },
    };
    const eco = {
      unlockedTechs: ["tech.foo"],
      unlockedUpgrades: ["tech.foo.u1"],
      techGrades: { "tech.foo": 2 },
      techSockets: { "tech.foo": "map.iron" },
      researchQueue: ["tech.foo"],
      acquiredTechs: [{ techId: "tech.foo" }],
      techTiers: { ...DEFAULT_TECH_TIERS, A: 4 },
      unlockedProperties: [],
    };
    assert.equal(stripTechFromEco(eco, "tech.foo"), true);
    recomputeUnlocksFromTechs(eco, content);
    assert.deepEqual(eco.unlockedTechs, []);
    assert.deepEqual(eco.unlockedUpgrades, []);
    assert.deepEqual(eco.researchQueue, []);
    assert.equal(eco.techGrades["tech.foo"], undefined);
    assert.equal(eco.techSockets["tech.foo"], undefined);
    assert.equal(eco.techTiers.A, 1);
  });

  it("returns false when the tech was not unlocked", () => {
    const eco = { unlockedTechs: ["tech.other"] };
    assert.equal(stripTechFromEco(eco, "tech.foo"), false);
    assert.deepEqual(eco.unlockedTechs, ["tech.other"]);
  });
});
