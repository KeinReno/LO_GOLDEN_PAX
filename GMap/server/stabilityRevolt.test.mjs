/**
 * 3-stage stability revolt: planet.stability meter (not loyalty).
 * Run from GMap/:  node --test server/stabilityRevolt.test.mjs
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { loadContent } from "./contentLoader.mjs";
import { syntheticCrewGroup } from "./boarding.mjs";
import { buildModifierStack, applyFlatThenMult } from "./modifierStack.mjs";
import { checkRevolt, runLoyaltyPhase, computePlanetLoyalty } from "./loyalty.mjs";
import {
  revoltStage,
  stabilityBand,
  stabilityCfg,
  rebelCount,
  spawnRebelForce,
  resolveRebelEngagement,
  resolveSecession,
  shouldSecede,
  rebelFactionId,
  majorityRaceId,
  applyStabilityRevolt,
  collectRevoltProductionEffects,
  tickPlanetStability,
  planetStabilityValue,
} from "./stabilityRevolt.mjs";

const militia = {
  id: "unit.militia",
  tier: 1,
  roles: ["infantry", "militia"],
  stats: { damage: 8, defense: 8, hp: 70, speed: 4 },
};

const content = {
  units: { "unit.militia": militia },
  combat_matchups: {},
  rules: {},
  races: {},
  buildings: {},
  cultures: {},
  pois: {},
  faction_traits: { traits: {} },
  economy_balance: {
    stability: {
      startingValue: 50,
      min: 0,
      max: 100,
      naturalDecay: -1,
      stage1Threshold: 40,
      stage2Threshold: 25,
      stage3DurationTurns: 3,
      stage1ProductionMult: 0.85,
      stage2ProductionMult: 0.75,
      rebelPopShare: 0.2,
      loyaltyCollapseDrain: -2,
      loyaltyCollapseThreshold: 20,
    },
  },
};

function planetBase(extra = {}) {
  return {
    id: "p1",
    name: "Helios",
    systemId: "s1",
    population: 50,
    loyalty: 50,
    stability: 50,
    ownerFactionId: "fA",
    raceComposition: [
      { raceId: "race_belator", percent: 80 },
      { raceId: "race_human", percent: 20 },
    ],
    ...extra,
  };
}

function worldOf(planet, extra = {}) {
  const system = {
    id: "s1",
    ownerFactionId: "fA",
    planets: [planet],
    ...extra.system,
  };
  return {
    meta: { turn: extra.turn ?? 10 },
    factions: [
      { id: "fA", primaryRaceId: "race_human", name: "A", activeEffects: [] },
    ],
    systems: [system],
    legions: extra.legions || [],
    fleets: [],
    loyaltyMatrix: {},
  };
}

describe("stage formula", () => {
  it("bands are distinct and ordered: 2 < 1 < 0 at 25 / 40", () => {
    const cfg = stabilityCfg(content);
    assert.equal(cfg.stage1Threshold, 40);
    assert.equal(cfg.stage2Threshold, 25);
    assert.equal(cfg.stage3DurationTurns, 3);
    assert.ok(cfg.stage2Threshold < cfg.stage1Threshold);
    assert.equal(stabilityBand(50, content), 0);
    assert.equal(stabilityBand(40, content), 0);
    assert.equal(stabilityBand(39, content), 1);
    assert.equal(stabilityBand(25, content), 1);
    assert.equal(stabilityBand(24, content), 2);
    assert.equal(revoltStage(planetBase({ stability: 50 }), content), 0);
    assert.equal(revoltStage(planetBase({ stability: 39 }), content), 1);
    assert.equal(revoltStage(planetBase({ stability: 24 }), content), 2);
  });

  it("unset planet.stability starts at 50, not at loyalty", () => {
    assert.equal(planetStabilityValue({ loyalty: 10 }, content), 50);
    assert.equal(planetStabilityValue({ stability: 47 }, content), 47);
  });
});

describe("tick: decay + stability_add + loyalty<20 drain", () => {
  it("naturalDecay −1 when calm", () => {
    const planet = planetBase({ stability: 50, loyalty: 50 });
    const world = worldOf(planet);
    const r = tickPlanetStability(world, world.systems[0], planet, content);
    assert.equal(r.value, 49);
    assert.equal(r.delta, -1);
    assert.equal(r.stage, 0);
  });

  it("loyalty < 20 adds collapse drain, does not spawn by itself", () => {
    const planet = planetBase({ stability: 50, loyalty: 10 });
    const world = worldOf(planet);
    const r = tickPlanetStability(world, world.systems[0], planet, content);
    assert.equal(r.delta, -3);
    assert.equal(r.value, 47);
    const ev = checkRevolt(world, world.systems[0], planet, content);
    assert.equal(ev.type, "revolt_deferred");
    const phase = runLoyaltyPhase(world, content);
    assert.equal(world.legions.length, 0);
    assert.ok(!phase.journal.some((e) => e.type === "revolt" || e.type === "revolt"));
  });

  it("stability_add offsets decay on the stability meter", () => {
    const planet = planetBase({ stability: 50, loyalty: 50 });
    const world = worldOf(planet);
    world.factions[0].activeEffects = [
      { effect: "stability_add", args: { amount: 4 } },
    ];
    const r = tickPlanetStability(world, world.systems[0], planet, content);
    assert.equal(r.delta, 3);
    assert.equal(r.value, 53);
  });
});

describe("stage 1 — production debuff", () => {
  it("lowers production:* vs a calm planet (before/after)", () => {
    const wCalm = worldOf(planetBase({ stability: 50 }));
    const wHot = worldOf(planetBase({ stability: 35 }));
    const stackCalm = buildModifierStack(
      collectRevoltProductionEffects(wCalm, "fA", content),
    );
    const stackHot = buildModifierStack(
      collectRevoltProductionEffects(wHot, "fA", content),
    );
    const afterCalm = applyFlatThenMult(100, stackCalm.channels["production:*"]);
    const afterHot = applyFlatThenMult(100, stackHot.channels["production:*"]);
    assert.equal(afterCalm, 100);
    assert.equal(afterHot, 85);
    const wS2 = worldOf(planetBase({ stability: 10 }));
    const stackS2 = buildModifierStack(
      collectRevoltProductionEffects(wS2, "fA", content),
    );
    const afterS2 = applyFlatThenMult(100, stackS2.channels["production:*"]);
    assert.equal(afterS2, 75);
    assert.ok(afterS2 < afterHot);
  });
});

describe("stage 2 — rebels from lost pop", () => {
  it("militia stats via boarding syntheticCrewGroup; count deducted from pop", () => {
    const planet = planetBase({ stability: 0 });
    const expected = rebelCount(planet, 0, content);
    assert.equal(expected, Math.max(1, Math.floor((50 * 0.2 * 25) / 25)));
    const spawned = spawnRebelForce(planet, content, { stability: 0, turn: 7 });
    assert.equal(planet.population, 50 - expected);
    assert.equal(spawned.lostPop, expected);
    assert.equal(spawned.count, expected);
    assert.deepEqual(spawned.composition[0], syntheticCrewGroup(expected, militia));
    assert.equal(spawned.composition[0].defId, "unit.militia");
    assert.equal(spawned.stance, "retreat");
    assert.equal(spawned.factionId, rebelFactionId("p1", 7));
  });

  it("does not spawn extra people beyond lost pop", () => {
    const planet = planetBase({ population: 3, stability: 0 });
    const spawned = spawnRebelForce(planet, content, { stability: 0 });
    assert.equal(spawned.count, spawned.lostPop);
    assert.equal(planet.population + spawned.lostPop, 3);
  });

  it("applyStabilityRevolt at stage 2 spends pop and mints a rebel legion", () => {
    const planet = planetBase({ stability: 10, loyalty: 50, population: 50 });
    const world = worldOf(planet, { turn: 4 });
    const { journal } = applyStabilityRevolt(world, content);
    const ev = journal.find((e) => e.type === "revolt");
    assert.ok(ev);
    assert.ok(ev.lostPop >= 1);
    assert.equal(planet.population, 50 - ev.lostPop);
    assert.equal(world.legions.length, 1);
    assert.equal(world.legions[0].composition[0].defId, "unit.militia");
    assert.ok(world.factions.some((f) => f.id === ev.rebelFactionId));
  });

  it("stage 1 stability does not spawn rebels", () => {
    const planet = planetBase({ stability: 35, loyalty: 50 });
    const world = worldOf(planet);
    const { journal } = applyStabilityRevolt(world, content);
    assert.ok(!journal.some((e) => e.type === "revolt"));
    assert.equal(world.legions.length, 0);
    assert.equal(planet.population, 50);
  });
});

describe("stage 3 — secession", () => {
  it("mints a queryable faction payload with inherited race", () => {
    const planet = planetBase({ stability: 10 });
    const copy = { ...planet };
    const rebels = spawnRebelForce(copy, content, { stability: 10, turn: 12 });
    const plan = resolveSecession(
      { id: "fA", primaryRaceId: "race_human" },
      planet,
      { ...rebels, id: "force-r", spawnTurn: 12 },
      15,
      content,
    );
    assert.equal(plan.newFaction.id, rebelFactionId("p1", 12));
    assert.equal(plan.newFaction.primaryRaceId, "race_belator");
    assert.equal(plan.newFaction.raceId, "race_belator");
    assert.equal(plan.planetId, "p1");
    assert.equal(plan.sourceFactionId, "fA");
    assert.equal(majorityRaceId(planet, "race_human"), "race_belator");
    assert.match(plan.newFaction.color, /^#[0-9a-f]{6}$/);
  });

  it("secedes after stage3DurationTurns, not on the spawn tick", () => {
    assert.equal(shouldSecede({ stage2SinceTurn: 10 }, 10, content), false);
    assert.equal(shouldSecede({ stage2SinceTurn: 10 }, 12, content), false);
    assert.equal(shouldSecede({ stage2SinceTurn: 10 }, 13, content), true);
  });

  it("applyStabilityRevolt transfers the planet to the new faction after duration", () => {
    const planet = planetBase({ stability: 8, loyalty: 50, population: 40 });
    const world = worldOf(planet, { turn: 10 });
    const first = applyStabilityRevolt(world, content);
    const spawnEv = first.journal.find((e) => e.type === "revolt");
    assert.ok(spawnEv);
    world.meta.turn = 13;
    const second = applyStabilityRevolt(world, content);
    const secede = second.journal.find((e) => e.type === "secession");
    assert.ok(secede);
    assert.equal(planet.ownerFactionId, secede.newFactionId);
    assert.equal(world.systems[0].ownerFactionId, secede.newFactionId);
    const fac = world.factions.find((f) => f.id === secede.newFactionId);
    assert.ok(fac);
    assert.equal(fac.isNpc, true);
    const legion = world.legions.find((l) => l.id === spawnEv.rebelLegionId);
    assert.equal(legion.factionId, secede.newFactionId);
  });
});

describe("loyalty < 20 vs the stability meter", () => {
  it("low loyalty with high stability does not spawn", () => {
    const planet = planetBase({ loyalty: 10, stability: 50, population: 20 });
    const world = worldOf(planet, { turn: 2 });
    const { journal } = applyStabilityRevolt(world, content);
    assert.ok(!journal.some((e) => e.type === "revolt"));
    assert.equal(world.legions.length, 0);
    assert.equal(planet.stability, 47);
  });

  it("occupation-low stability with high loyalty does spawn", () => {
    const planet = planetBase({ loyalty: 70, stability: 20, population: 20 });
    const world = worldOf(planet, { turn: 2 });
    const { journal } = applyStabilityRevolt(world, content);
    assert.ok(journal.some((e) => e.type === "revolt"));
  });

  it("computePlanetLoyalty is unchanged by planet.stability", () => {
    const empty = {
      races: {},
      cultures: {},
      buildings: {},
      pois: {},
      faction_traits: { traits: {} },
    };
    const unset = planetBase({ loyalty: 50 });
    delete unset.stability;
    const occ = planetBase({ loyalty: 50, stability: 47 });
    const world = worldOf(unset);
    const a = computePlanetLoyalty(world, world.systems[0], unset, empty);
    const b = computePlanetLoyalty(world, world.systems[0], occ, empty);
    assert.equal(a, b);
  });
});

describe("contingent retreat (combatResolve 80% rule)", () => {
  before(() => {
    loadContent(["core"]);
  });

  it("rebels retreat without a fight when heavily outmatched", () => {
    const planet = planetBase({ population: 10, stability: 24 });
    const copy = { ...planet };
    const spawned = spawnRebelForce(copy, content, {
      stability: 24,
      factionId: "rebel.p1.1",
      systemId: "s1",
    });
    const rebels = {
      id: "rebel-1",
      ...spawned,
      systemId: "s1",
    };
    const garrison = {
      id: "gar-1",
      kind: "legion",
      factionId: "fA",
      systemId: "s1",
      composition: [syntheticCrewGroup(40, militia)],
    };
    const world = worldOf(planet, { legions: [garrison, rebels] });
    const result = resolveRebelEngagement(world, garrison, rebels);
    assert.equal(result.ok, true);
    assert.equal(result.outcome, "retreat_b");
    assert.deepEqual(result.lossesA, []);
    assert.deepEqual(result.lossesB, []);
  });
});

describe("standDown after suppression/recovery (was: ReferenceError, undefined standDown)", () => {
  // Garrison-instant-wipe (spawnAndMaybeEngage's `result.ok && !rebelsAlive`)
  // shares the exact same standDown(world, planet) as the recovery path below —
  // a garrison sweep (1..30, several rebel pop sizes) never lands a clean
  // single-exchange kill: it's either a rebel win/draw (too weak) or an
  // auto-retreat (stanceB "retreat" trips <80%-power before any exchange
  // happens). Not reachable from a single spawn tick via count tuning alone;
  // covered indirectly since both call sites invoke the same function.

  it("stability recovery stands down an ongoing revolt", () => {
    const planet = planetBase({ stability: 8, loyalty: 50, population: 40 });
    const world = worldOf(planet, { turn: 10 });
    const first = applyStabilityRevolt(world, content);
    const spawnEv = first.journal.find((e) => e.type === "revolt");
    assert.ok(spawnEv);
    assert.equal(world.legions.length, 1);
    assert.equal(world.factions.length, 2);

    planet.stability = 45;
    world.meta.turn = 11;
    const second = applyStabilityRevolt(world, content);
    const standDownEv = second.journal.find((e) => e.type === "revolt_stand_down");
    assert.ok(standDownEv);
    assert.equal(planet.revolt, null);
    assert.equal(world.legions.length, 0);
    assert.equal(world.factions.length, 1);
  });
});










