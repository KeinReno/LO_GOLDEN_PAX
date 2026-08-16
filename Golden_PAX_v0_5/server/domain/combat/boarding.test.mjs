/**
 * Behavior test (NOT a port — GMap has no boarding mechanic). Crew group
 * construction, contingent-retreat, capture vs loss. Combat math stays
 * resolveExchange's; this file only checks the boarding wrapper.
 */
import { describe, it, expect } from "vitest";
import { canBoard, resolveBoarding, syntheticCrewGroup, totalCrewCount } from "./boarding.mjs";

const militia = {
  id: "unit.militia",
  tier: 1,
  roles: ["infantry", "militia"],
  stats: { damage: 8, defense: 8, hp: 70, speed: 4 },
};
const content = { combat_matchups: {}, rules: {}, units: { "unit.militia": militia } };

function legionForce(count, id = "legion-1") {
  return {
    id,
    kind: "legion",
    factionId: "fA",
    composition: [
      {
        defId: "unit.militia",
        tier: 1,
        roles: ["infantry", "militia"],
        count,
        damage: 8,
        defense: 8,
        hp: 70,
        speed: 4,
        maxHp: 70,
      },
    ],
  };
}

function fleetForce(crewCount, extra = {}) {
  return {
    id: "fleet-1",
    kind: "fleet",
    factionId: "fB",
    composition: [
      {
        defId: "ship.scout",
        tier: extra.tier ?? 1,
        roles: ["screen"],
        count: 1,
        crewCount,
        damage: 4,
        armor: 4,
        shields: 2,
        hp: 22,
        accuracy: 65,
        maxHp: 22,
      },
    ],
  };
}

describe("canBoard", () => {
  it("allows a legion boarding a fleet", () => {
    expect(canBoard(legionForce(1), fleetForce(5))).toEqual({ ok: true });
  });

  it("rejects same-kind or reversed kinds", () => {
    expect(canBoard(fleetForce(5), legionForce(1)).error).toBe("boarder_must_be_legion");
    expect(canBoard(legionForce(1), legionForce(1, "legion-2")).error).toBe("target_must_be_fleet");
  });
});

describe("synthetic crew group", () => {
  it("is militia-shaped with the persisted crewCount, not a recompute from tier", () => {
    const fleet = fleetForce(99, { tier: 9 });
    expect(totalCrewCount(fleet)).toBe(99);
    const group = syntheticCrewGroup(totalCrewCount(fleet), militia);
    expect(group).toMatchObject({ defId: "unit.militia", count: 99, damage: 8, defense: 8, hp: 70, speed: 4, maxHp: 70 });
    const result = resolveBoarding(legionForce(1), fleet, content);
    expect(result.ok).toBe(true);
    expect(result.groupsB[0]?.count ?? 0).toBeGreaterThan(0);
    // Defender count started at persisted 99, not tier×5 (=45)
    expect(result.powerB).toBeGreaterThan(result.powerA);
  });
});

describe("resolveBoarding", () => {
  it("crew retreats without a fight when heavily outmatched, and that captures", () => {
    const result = resolveBoarding(legionForce(10), fleetForce(1), content);
    expect(result.ok).toBe(true);
    expect(result.outcome).toBe("retreat_b");
    expect(result.captured).toBe(true);
    expect(result.lossesA).toEqual([]);
    expect(result.lossesB).toEqual([]);
    expect(result.fleetComposition[0].crewCount).toBe(1);
    expect(result.fleetComposition[0].defId).toBe("ship.scout");
  });

  it("a legion win captures; surviving crew stays on the ship group", () => {
    const result = resolveBoarding(legionForce(10), fleetForce(1), content);
    expect(result.captured).toBe(true);
    expect(result.fleetComposition[0].defId).toBe("ship.scout");
    expect(result.fleetComposition[0].count).toBe(1);
  });

  it("a legion loss is a normal casualty outcome, not a wipeout and not a capture", () => {
    const result = resolveBoarding(legionForce(1), fleetForce(20), content);
    expect(result.ok).toBe(true);
    expect(result.captured).toBe(false);
    expect(result.outcome).toBe("win_b");
    expect(result.fleetComposition[0].defId).toBe("ship.scout");
    const startCount = 1;
    const endCount = (result.groupsA || []).reduce((s, g) => s + (g.count || 0), 0);
    expect(endCount).toBeLessThanOrEqual(startCount);
  });

  it("live retreat stance (powerMult 0.35) lets 5 militia capture 5 crew", () => {
    const live = { ...content, combat_stances: { retreat: { id: "retreat", powerMult: 0.35, casualtyTakenMult: 0.5 } } };
    const result = resolveBoarding(legionForce(5), fleetForce(5), live);
    expect(result.ok).toBe(true);
    expect(result.outcome).toBe("retreat_b");
    expect(result.captured).toBe(true);
  });

  it("zero persisted crew is an unopposed capture (does not recompute crew from tier)", () => {
    const result = resolveBoarding(legionForce(2), fleetForce(0, { tier: 3 }), content);
    expect(result.ok).toBe(true);
    expect(result.captured).toBe(true);
    expect(result.outcome).toBe("win_a");
    expect(result.fleetComposition[0].crewCount).toBe(0);
  });
});
