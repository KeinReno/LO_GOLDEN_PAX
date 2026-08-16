/**
 * Tech grades 1→5 — port of v0.5 Tech Tree 2.0 P0 (not nested upgrades).
 * Run: node --test server/techGrades.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  factionTechGrade,
  gradeEffectMagnitude,
  gradeUpgradeCost,
  upgradeTechGrade,
  isGradeable,
  collectTechModifierEffects,
  MAX_TECH_GRADE,
  DEFAULT_GRADE_MAGNITUDE,
} from "./techGrades.mjs";

const gradeableDef = {
  id: "tech.g",
  name: "G",
  gradeable: true,
  gradeTable: {
    magnitude: [1, 1.15, 1.3, 1.5, 1.75],
    upgradeCost: [
      null,
      { "currency.cognitio": 20 },
      { "currency.cognitio": 40 },
      { "currency.cognitio": 70 },
      { "currency.cognitio": 110 },
    ],
  },
  effects: [{ effect: "production_mult", args: { resource: "currency.extracta", mult: 1.2 } }],
};

const content = {
  technologies: {
    "tech.g": gradeableDef,
    "tech.flat": { id: "tech.flat", name: "Flat", effects: [] },
  },
};

function eco(overrides = {}) {
  return { unlockedTechs: ["tech.g"], techGrades: {}, ...overrides };
}

describe("factionTechGrade", () => {
  it("is 0 when not researched, 1 when unlocked but ungraded", () => {
    assert.equal(factionTechGrade({ unlockedTechs: [] }, "tech.g"), 0);
    assert.equal(factionTechGrade(eco(), "tech.g"), 1);
    assert.equal(factionTechGrade(eco({ techGrades: { "tech.g": 3 } }), "tech.g"), 3);
  });
});

describe("gradeEffectMagnitude", () => {
  it("is 1 for a non-gradeable tech", () => {
    assert.equal(isGradeable(content.technologies["tech.flat"]), false);
    assert.equal(gradeEffectMagnitude(content.technologies["tech.flat"], 5), 1);
  });

  it("reads the magnitude table, falling back to first-pass defaults", () => {
    assert.equal(gradeEffectMagnitude(gradeableDef, 1), 1);
    assert.equal(gradeEffectMagnitude(gradeableDef, 3), 1.3);
    assert.equal(gradeEffectMagnitude({ gradeable: true }, 2), DEFAULT_GRADE_MAGNITUDE[1]);
  });
});

describe("upgradeTechGrade", () => {
  it("spends and bumps the counter; refuses max, unresearched, and non-gradeable", () => {
    const stocks = { "currency.cognitio": 100 };
    const result = upgradeTechGrade(eco(), "tech.g", stocks, content);
    assert.equal(result.ok, true);
    assert.equal(result.eco.techGrades["tech.g"], 2);
    assert.equal(result.stocks["currency.cognitio"], 80);

    assert.equal(upgradeTechGrade({ unlockedTechs: [] }, "tech.g", stocks, content).ok, false);
    assert.match(
      upgradeTechGrade(eco({ unlockedTechs: ["tech.flat"] }), "tech.flat", stocks, content).error,
      /not gradeable/,
    );
    assert.equal(gradeUpgradeCost(MAX_TECH_GRADE, gradeableDef), null);
    assert.match(
      upgradeTechGrade(eco({ techGrades: { "tech.g": 5 } }), "tech.g", stocks, content).error,
      /max/,
    );
  });
});

describe("collectTechModifierEffects — grades", () => {
  it("does not walk nested .efficiency upgrades", () => {
    const effects = collectTechModifierEffects(
      {
        unlockedTechs: ["tech.flat"],
        unlockedUpgrades: ["tech.flat.efficiency"],
        techGrades: {},
      },
      {
        technologies: {
          "tech.flat": {
            id: "tech.flat",
            name: "Flat",
            effects: [{ effect: "production_mult", args: { resource: "currency.energia", mult: 1.2 } }],
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
      { unlockedTechs: ["tech.g"], techGrades: { "tech.g": 1 } },
      content,
    );
    const g3 = collectTechModifierEffects(
      { unlockedTechs: ["tech.g"], techGrades: { "tech.g": 3 } },
      content,
    );
    assert.equal(g1[0].args.mult, 1.2);
    assert.ok(Math.abs(g3[0].args.mult - 1.2 * 1.3) < 1e-8);
  });
});
