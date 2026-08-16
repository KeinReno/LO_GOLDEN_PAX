/**
 * Behavior tests for tech modifier collection after Tech Tree 2.0.
 *
 * collectTechModifierEffects started as a byte-parity port of GMap's
 * function (unlocked techs + nested upgrades). Priority 0 replaced the
 * dead upgrade branch with grades — this file is therefore NOT a parity
 * suite anymore. Ungraded / non-gradeable parent effects still match the
 * previous shape (raw args, no upgrade walk).
 */
import { describe, it, expect } from "vitest";
import { collectTechModifierEffects } from "./techModifierEffects.mjs";

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

describe("collectTechModifierEffects — grades (new design)", () => {
  it("does not walk nested upgrades (that system is gone)", () => {
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
    expect(effects).toHaveLength(1);
    expect(effects[0].args.mult).toBe(1.2);
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
    expect(g1[0].args.mult).toBeCloseTo(1.2, 8);
    expect(g3[0].args.mult).toBeCloseTo(1.2 * 1.3, 8);
  });

  it("a non-gradeable tech is unchanged (multiplier 1)", () => {
    const effects = collectTechModifierEffects({ unlockedTechs: ["tech.flat"] }, content);
    expect(effects[0].args.mult).toBe(1.2);
  });
});
