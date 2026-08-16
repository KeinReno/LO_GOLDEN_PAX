/**
 * NOT a port — new design (TECH_TREE_2_INTEGRATION_SPEC.md Priority 0).
 * GMap has no tech-grade ladder.
 */
import { describe, it, expect } from "vitest";
import {
  factionTechGrade,
  gradeEffectMagnitude,
  gradeUpgradeCost,
  upgradeTechGrade,
  isGradeable,
  MAX_TECH_GRADE,
  DEFAULT_GRADE_MAGNITUDE,
} from "./techGrade.mjs";
import { defaultTechAccount } from "./techAccount.mjs";

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

const content = { technologies: { "tech.g": gradeableDef, "tech.flat": { id: "tech.flat", name: "Flat", effects: [] } } };

function account(overrides = {}) {
  return { ...defaultTechAccount("f1"), unlockedTechs: ["tech.g"], ...overrides };
}

describe("factionTechGrade", () => {
  it("is 0 when the tech is not researched, 1 when unlocked but ungraded", () => {
    expect(factionTechGrade(defaultTechAccount("f1"), "tech.g")).toBe(0);
    expect(factionTechGrade(account(), "tech.g")).toBe(1);
    expect(factionTechGrade(account({ techGrades: { "tech.g": 3 } }), "tech.g")).toBe(3);
  });
});

describe("gradeEffectMagnitude", () => {
  it("is 1 for a non-gradeable tech (no-op for existing Pass 4 behavior)", () => {
    expect(isGradeable(content.technologies["tech.flat"])).toBe(false);
    expect(gradeEffectMagnitude(content.technologies["tech.flat"], 5)).toBe(1);
  });

  it("reads the magnitude table, falling back to the documented first-pass defaults", () => {
    expect(gradeEffectMagnitude(gradeableDef, 1)).toBe(1);
    expect(gradeEffectMagnitude(gradeableDef, 3)).toBe(1.3);
    expect(gradeEffectMagnitude({ gradeable: true }, 2)).toBe(DEFAULT_GRADE_MAGNITUDE[1]);
  });
});

describe("upgradeTechGrade", () => {
  it("spends and bumps the counter; refuses max grade, unresearched, and non-gradeable", () => {
    const stocks = { "currency.cognitio": 100 };
    const result = upgradeTechGrade(account(), "tech.g", stocks, content);
    expect(result.ok).toBe(true);
    expect(result.techAccount.techGrades["tech.g"]).toBe(2);
    expect(result.stocks["currency.cognitio"]).toBe(80);

    expect(upgradeTechGrade(defaultTechAccount("f1"), "tech.g", stocks, content).ok).toBe(false);
    expect(upgradeTechGrade(account({ unlockedTechs: ["tech.flat"] }), "tech.flat", stocks, content).error).toMatch(/not gradeable/);
    expect(gradeUpgradeCost(MAX_TECH_GRADE, gradeableDef)).toBeNull();
    expect(upgradeTechGrade(account({ techGrades: { "tech.g": 5 } }), "tech.g", stocks, content).error).toMatch(/max/);
  });
});
