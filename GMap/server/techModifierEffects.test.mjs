/**
 * collectTechModifierEffects after grades: no nested-upgrade walk; scale by grade.
 * Run: node --test server/techModifierEffects.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { collectTechModifierEffects } from "./techGrades.mjs";

const content = {
  technologies: {
    "tech.boost": {
      id: "tech.boost",
      name: "Boost",
      gradeable: true,
      gradeTable: { magnitude: [1, 1.15, 1.3, 1.5, 1.75] },
      effects: [{ effect: "production_mult", args: { resource: "currency.extracta", mult: 1.2 } }],
    },
    "tech.flat": {
      id: "tech.flat",
      name: "Flat",
      effects: [{ effect: "production_mult", args: { resource: "currency.energia", mult: 1.2 } }],
    },
  },
};

describe("collectTechModifierEffects — grades", () => {
  it("does not walk nested upgrades (that system is not the magnitude axis)", () => {
    const effects = collectTechModifierEffects(
      {
        unlockedTechs: ["tech.flat"],
        unlockedUpgrades: ["tech.flat.efficiency"],
        techGrades: {},
      },
      {
        technologies: {
          "tech.flat": {
            ...content.technologies["tech.flat"],
            upgrades: [
              {
                id: "tech.flat.efficiency",
                effects: [{ effect: "production_mult", args: { resource: "currency.energia", mult: 9 } }],
              },
            ],
          },
        },
      },
    );
    assert.equal(effects.length, 1);
    assert.equal(effects[0].args.mult, 1.2);
  });

  it("grade 1 leaves magnitude at 1; grade 3 scales args.mult", () => {
    const g1 = collectTechModifierEffects(
      { unlockedTechs: ["tech.boost"], techGrades: { "tech.boost": 1 } },
      content,
    );
    const g3 = collectTechModifierEffects(
      { unlockedTechs: ["tech.boost"], techGrades: { "tech.boost": 3 } },
      content,
    );
    assert.equal(g1[0].args.mult, 1.2);
    assert.ok(Math.abs(g3[0].args.mult - 1.2 * 1.3) < 1e-8);
  });

  it("a non-gradeable tech is unchanged (multiplier 1)", () => {
    const effects = collectTechModifierEffects({ unlockedTechs: ["tech.flat"] }, content);
    assert.equal(effects[0].args.mult, 1.2);
  });
});
