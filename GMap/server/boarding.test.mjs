/**
 * Kind-guard + boarding + empty-stack prune (v0.5 port into GMap).
 * Run from GMap/:  node --test server/boarding.test.mjs
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { loadContent, getContent } from "./contentLoader.mjs";
import {
  canEngage,
  canEngageSides,
  crewCountForRaise,
  forceAfterExchange,
} from "./forceKindGuard.mjs";
import {
  canBoard,
  resolveBoarding,
  syntheticCrewGroup,
  totalCrewCount,
  applyBoardingToWorld,
  applySurvivingCrew,
} from "./boarding.mjs";
import {
  cleanupEmptyComposition,
  pruneDestroyedGroups,
  resolveEngagementFight,
} from "./combatResolve.mjs";
import { raiseUnit } from "./forceRecruit.mjs";

const militia = {
  id: "unit.militia",
  tier: 1,
  roles: ["infantry", "militia"],
  stats: { damage: 8, defense: 8, hp: 70, speed: 4 },
};

function legionForce(count, id = "legion-1") {
  return {
    id,
    kind: "legion",
    factionId: "fA",
    systemId: "s1",
    composition: [
      {
        defId: "unit.militia",
        type: "Ополчение",
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
    id: extra.id || "fleet-1",
    kind: "fleet",
    factionId: extra.factionId || "fB",
    systemId: extra.systemId || "s1",
    composition: [
      {
        defId: "ship.scout",
        type: "Разведчик",
        tier: extra.tier ?? 1,
        roles: ["screen"],
        count: extra.shipCount ?? 1,
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

function miniWorld(legion, fleet) {
  return {
    factions: [
      { id: "fA", name: "A", primaryRaceId: null },
      { id: "fB", name: "B", primaryRaceId: null },
    ],
    systems: [{ id: "s1", ownerFactionId: "fB", planets: [] }],
    fleets: [fleet],
    legions: [legion],
  };
}

describe("canEngage", () => {
  it("allows same-kind fleet and legion pairs in the same system", () => {
    assert.deepEqual(
      canEngage({ kind: "fleet", systemId: "s1" }, { kind: "fleet", systemId: "s1" }),
      { ok: true },
    );
    assert.deepEqual(
      canEngage({ kind: "legion", systemId: "s1" }, { kind: "legion", systemId: "s1" }),
      { ok: true },
    );
  });

  it("rejects cross-kind engage (boarding is a different action)", () => {
    assert.equal(
      canEngage({ kind: "legion", systemId: "s1" }, { kind: "fleet", systemId: "s1" }).error,
      "cross_kind_engage_not_allowed",
    );
    assert.equal(
      canEngage({ kind: "fleet", systemId: "s1" }, { kind: "legion", systemId: "s1" }).error,
      "cross_kind_engage_not_allowed",
    );
  });

  it("rejects forces that are not in the same system", () => {
    assert.equal(
      canEngage({ kind: "legion", systemId: "s1" }, { kind: "legion", systemId: "s2" }).error,
      "not_same_system",
    );
  });
});

describe("canEngageSides", () => {
  it("rejects homogeneous legion vs fleet sides", () => {
    const gate = canEngageSides(
      { fleetIds: [], legionIds: ["l1"] },
      { fleetIds: ["f1"], legionIds: [] },
    );
    assert.equal(gate.error, "cross_kind_engage_not_allowed");
  });

  it("allows planetary assault override and mixed combined-arms", () => {
    assert.equal(
      canEngageSides(
        { fleetIds: ["f1"], legionIds: [] },
        { fleetIds: [], legionIds: ["l1"] },
        { allowPlanetaryAssault: true },
      ).ok,
      true,
    );
    assert.equal(
      canEngageSides(
        { fleetIds: ["f1"], legionIds: ["l1"] },
        { fleetIds: ["f2"], legionIds: [] },
      ).ok,
      true,
    );
  });
});

describe("crewCountForRaise", () => {
  it("is count × tier × crewPerTier for ships, 0 for units", () => {
    assert.equal(crewCountForRaise("ship", { tier: 1 }, 1, 5), 5);
    assert.equal(crewCountForRaise("ship", { tier: 2 }, 3, 5), 30);
    assert.equal(crewCountForRaise("unit", { tier: 1 }, 4, 5), 0);
  });
});

describe("empty-stack prune", () => {
  it("cleanupEmptyComposition drops count:0 groups so they cannot poison the next exchange", () => {
    const world = {
      fleets: [
        {
          id: "alive",
          composition: [
            { defId: "ship.scout", count: 0 },
            { defId: "ship.scout", count: 4 },
          ],
        },
        { id: "dead", composition: [{ defId: "ship.scout", count: 0 }] },
      ],
      legions: [
        {
          id: "leg",
          composition: [
            { defId: "unit.militia", count: 0 },
            { defId: "unit.militia", count: 2 },
          ],
        },
      ],
    };
    cleanupEmptyComposition(world);
    assert.equal(world.fleets.length, 1);
    assert.equal(world.fleets[0].id, "alive");
    assert.deepEqual(
      world.fleets[0].composition.map((g) => g.count),
      [4],
    );
    assert.equal(world.legions[0].composition.length, 1);
    assert.equal(world.legions[0].strength, 2);
    assert.equal(pruneDestroyedGroups([{ count: 0 }, { count: 3 }]).length, 1);
  });
});

describe("boarding", () => {
  before(() => {
    loadContent(["core"]);
  });

  it("allows a legion boarding a fleet and rejects reversed kinds", () => {
    assert.deepEqual(canBoard(legionForce(1), fleetForce(5)), { ok: true });
    assert.equal(canBoard(fleetForce(5), legionForce(1)).error, "boarder_must_be_legion");
    assert.equal(
      canBoard(legionForce(1), legionForce(1, "legion-2")).error,
      "target_must_be_fleet",
    );
  });

  it("uses persisted crewCount, not a recompute from tier", () => {
    const fleet = fleetForce(99, { tier: 9 });
    assert.equal(totalCrewCount(fleet, getContent()), 99);
    const group = syntheticCrewGroup(totalCrewCount(fleet), militia);
    assert.equal(group.defId, "unit.militia");
    assert.equal(group.count, 99);
    const result = resolveBoarding(legionForce(1), fleet, getContent());
    assert.equal(result.ok, true);
    assert.ok(result.powerB > result.powerA);
  });

  it("first-pass fallback is count × tier × crewPerTier when crewCount is absent", () => {
    const fleet = fleetForce(undefined, { tier: 1 });
    delete fleet.composition[0].crewCount;
    assert.equal(totalCrewCount(fleet, getContent()), 5);
  });

  it("crew retreats without a fight when heavily outmatched, and that captures", () => {
    const result = resolveBoarding(legionForce(10), fleetForce(1), getContent());
    assert.equal(result.ok, true);
    assert.equal(result.outcome, "retreat_b");
    assert.equal(result.captured, true);
    assert.deepEqual(result.lossesA, []);
    assert.deepEqual(result.lossesB, []);
    assert.equal(result.fleetComposition[0].crewCount, 1);
    assert.equal(result.fleetComposition[0].defId, "ship.scout");
  });

  it("a legion loss is a normal casualty outcome, not a wipeout and not a capture", () => {
    const result = resolveBoarding(legionForce(1), fleetForce(20), getContent());
    assert.equal(result.ok, true);
    assert.equal(result.captured, false);
    assert.equal(result.outcome, "win_b");
    const endCount = (result.groupsA || []).reduce((s, g) => s + (g.count || 0), 0);
    assert.ok(endCount <= 1);
  });

  it("zero persisted crew is an unopposed capture (does not recompute crew from tier)", () => {
    const result = resolveBoarding(legionForce(2), fleetForce(0, { tier: 3 }), getContent());
    assert.equal(result.ok, true);
    assert.equal(result.captured, true);
    assert.ok(result.outcome === "win_a" || result.outcome === "retreat_b");
    assert.equal(result.fleetComposition[0].crewCount, 0);
  });

  it("applyBoardingToWorld transfers fleet faction on capture", () => {
    const legion = legionForce(10);
    const fleet = fleetForce(1);
    const world = miniWorld(legion, fleet);
    const result = applyBoardingToWorld({
      world,
      factionId: "fA",
      legionId: legion.id,
      targetFleetId: fleet.id,
      content: getContent(),
    });
    assert.equal(result.ok, true);
    assert.equal(result.captured, true);
    assert.equal(world.fleets[0].factionId, "fA");
    assert.equal(world.fleets[0].composition[0].defId, "ship.scout");
  });

  it("raiseUnit persists crewCount on a ship group", () => {
    const content = getContent();
    const def = content.ships["ship.scout"];
    const planet = {
      id: "p1",
      ownerFactionId: "fA",
      population: 100,
      surfaceBuildings: [{ kind: "shipyard" }],
      orbitalBuildings: [],
    };
    const system = {
      id: "s1",
      ownerFactionId: "fA",
      planets: [planet],
      stations: [],
    };
    const result = raiseUnit(
      system,
      planet,
      def,
      "ship",
      "fA",
      1,
      { "currency.metal": 999, "currency.supply": 999 },
      content,
    );
    assert.equal(result.ok, true, result.error);
    assert.equal(result.group.crewCount, 5);
    assert.equal(result.popCost, 6);
  });

  it("a follow-up space fight after wiping zeros does not collapse attacker power", () => {
    const world = {
      factions: [
        { id: "fA", name: "A" },
        { id: "fB", name: "B" },
      ],
      systems: [{ id: "s1", ownerFactionId: "fB", planets: [] }],
      fleets: [
        {
          id: "att",
          factionId: "fA",
          systemId: "s1",
          composition: [{ defId: "ship.scout", count: 8, hp: 22 }],
        },
        {
          id: "def",
          factionId: "fB",
          systemId: "s1",
          composition: [
            { defId: "ship.scout", count: 0, hp: 0 },
            { defId: "ship.scout", count: 1, hp: 22 },
          ],
        },
      ],
      legions: [],
    };
    cleanupEmptyComposition(world);
    assert.ok(
      world.fleets.find((f) => f.id === "def").composition.every((g) => g.count > 0),
    );
    const first = resolveEngagementFight(world, {
      theater: "space",
      systemId: "s1",
      sides: [
        { factionId: "fA", fleetIds: ["att"], legionIds: [], stance: "hold" },
        { factionId: "fB", fleetIds: ["def"], legionIds: [], stance: "hold" },
      ],
    });
    assert.equal(first.ok, true);
    assert.ok(first.powerA > 0, "attacker power must not collapse to 0");
    cleanupEmptyComposition(world);
    const leftoverZeros = (world.fleets || []).flatMap((f) =>
      (f.composition || []).filter((g) => (g.count || 0) <= 0),
    );
    assert.equal(leftoverZeros.length, 0);
  });
});

describe("forceAfterExchange / applySurvivingCrew", () => {
  it("deletes a force whose side was wiped", () => {
    assert.deepEqual(forceAfterExchange({ id: "x", composition: [{ count: 1 }] }, []), {
      deleted: true,
      force: null,
    });
  });

  it("redistributes surviving crew across ship groups", () => {
    const next = applySurvivingCrew(
      [
        { defId: "ship.scout", crewCount: 10, count: 1 },
        { defId: "ship.scout", crewCount: 10, count: 1 },
      ],
      5,
    );
    assert.equal(next.reduce((s, g) => s + g.crewCount, 0), 5);
    assert.equal(next[0].defId, "ship.scout");
  });
});
