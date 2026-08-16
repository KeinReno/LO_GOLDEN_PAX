/**
 * NOT a port — new design (notes/2026-08-13-galaxy-migration-grill.md Q4).
 * Control = system ownership; combat modifiers; usage-based depletion
 * designed from scratch (Q4d: planet deposits do not deplete and are
 * not a pattern to copy).
 */
import { describe, it, expect } from "vitest";
import { emptyFlows } from "../economy/flowEngine.mjs";
import {
  addSystemSpaceObjectEffects,
  spaceObjectCombatModifier,
  depleteSpaceObject,
  depleteSystemSpaceObjects,
  instantiateSpaceObject,
  spaceObjectDrawnAmount,
} from "./spaceObjects.mjs";

const content = {
  space_objects: {
    objects: {
      asteroid: {
        id: "asteroid",
        depletes: true,
        startingRemaining: 240,
        effects: [
          { effect: "rate_mod", args: { category: "A", tier: 2, amount: 1 } },
          { effect: "rate_mod", args: { category: "A", tier: 3, amount: 1 } },
          { effect: "rate_mod", args: { category: "A", tier: 4, amount: 1 } },
        ],
      },
      minefield: {
        id: "minefield",
        combat: { challengerPowerMult: 0.9 },
        effects: [{ effect: "demand_mod", args: { category: "C", tier: 4, amount: 1 } }],
      },
      nebula: {
        id: "nebula",
        combat: { bothPowerMult: 0.95 },
        effects: [{ effect: "rate_mod", args: { category: "B", tier: 3, amount: 1 } }],
      },
    },
  },
};

describe("control follows system ownership", () => {
  it("owned system applies asteroid rate; unowned and other-faction do not", () => {
    const owned = emptyFlows();
    addSystemSpaceObjectEffects(
      owned,
      { ownerFactionId: "fA", spaceObjects: [{ typeId: "asteroid", remainingAmount: 240 }] },
      "fA",
      content,
    );
    expect(owned.A[2].rate).toBe(1);
    expect(owned.A[3].rate).toBe(1);
    expect(owned.A[4].rate).toBe(1);

    const unowned = emptyFlows();
    addSystemSpaceObjectEffects(
      unowned,
      { ownerFactionId: null, spaceObjects: [{ typeId: "asteroid", remainingAmount: 240 }] },
      "fA",
      content,
    );
    expect(unowned.A[2].rate).toBe(0);

    const other = emptyFlows();
    addSystemSpaceObjectEffects(
      other,
      { ownerFactionId: "fB", spaceObjects: [{ typeId: "asteroid", remainingAmount: 240 }] },
      "fA",
      content,
    );
    expect(other.A[2].rate).toBe(0);
  });
});

describe("combat modifiers", () => {
  it("minefield hurts the challenger, not the owner; unowned is 1", () => {
    const system = { ownerFactionId: "fA", spaceObjects: [{ typeId: "minefield" }] };
    expect(spaceObjectCombatModifier(system, content, "fA")).toBe(1);
    expect(spaceObjectCombatModifier(system, content, "fB")).toBe(0.9);
    expect(spaceObjectCombatModifier({ ownerFactionId: null, spaceObjects: [{ typeId: "minefield" }] }, content, "fA")).toBe(1);
  });

  it("environmental bothPowerMult applies to owner and challenger", () => {
    const system = { ownerFactionId: "fA", spaceObjects: [{ typeId: "nebula" }] };
    expect(spaceObjectCombatModifier(system, content, "fA")).toBe(0.95);
    expect(spaceObjectCombatModifier(system, content, "fB")).toBe(0.95);
  });
});

describe("depletion (new design, not deposit-reuse)", () => {
  it("asteroid drawn amount is the sum of positive rate_mod", () => {
    expect(spaceObjectDrawnAmount(content.space_objects.objects.asteroid)).toBe(3);
  });

  it("depleteSpaceObject reduces remaining and removes at zero", () => {
    const inst = { typeId: "asteroid", remainingAmount: 5 };
    const def = content.space_objects.objects.asteroid;
    const mid = depleteSpaceObject(inst, 3, def);
    expect(mid.removed).toBe(false);
    expect(mid.instance.remainingAmount).toBe(2);
    const gone = depleteSpaceObject(mid.instance, 3, def);
    expect(gone.removed).toBe(true);
    expect(gone.instance.remainingAmount).toBe(0);
  });

  it("does not deplete non-depleting types or unowned systems", () => {
    const nebulaSys = { ownerFactionId: "fA", spaceObjects: [{ id: "n1", typeId: "nebula" }] };
    const nebulaNext = depleteSystemSpaceObjects(nebulaSys, content);
    expect(nebulaNext.removed).toHaveLength(0);
    expect(nebulaNext.spaceObjects).toHaveLength(1);

    const unowned = { ownerFactionId: null, spaceObjects: [{ id: "a1", typeId: "asteroid", remainingAmount: 240 }] };
    const unownedNext = depleteSystemSpaceObjects(unowned, content);
    expect(unownedNext.changed).toBe(false);
    expect(unownedNext.spaceObjects[0].remainingAmount).toBe(240);
  });

  it("instantiateSpaceObject sets remaining only when depletes", () => {
    expect(instantiateSpaceObject("asteroid", content).instance.remainingAmount).toBe(240);
    expect(instantiateSpaceObject("minefield", content).instance.remainingAmount).toBeNull();
    expect(instantiateSpaceObject("nope", content).ok).toBe(false);
  });
});
