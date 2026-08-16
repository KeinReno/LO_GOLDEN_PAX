/**
 * Court effect consumers (COURT_AND_NPC_ROSTER_SPEC Part 4/5).
 * Run from GMap/:  node --test server/courtConsumers.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getContent } from "./contentLoader.mjs";
import { buildModifierStack, applyFlatThenMult } from "./modifierStack.mjs";
import {
  syncNpcPassiveEffects,
  npcProductionMultForSystem,
  courtPopGrowthEffects,
  npcTaskSpeedMult,
} from "./courtGovernance.mjs";
import { applyCourtStatMultToGroups } from "./courtStatMult.mjs";
import { processNpcTasks } from "./narrative.mjs";
import { defaultNpc } from "./courtRoster.mjs";

function worldFor(npcs, extra = {}) {
  return {
    meta: { turn: 4 },
    factions: [
      {
        id: "f1",
        rulerNpcId: extra.rulerNpcId ?? null,
        npcs,
        activeEffects: [],
        council: extra.council,
      },
    ],
    systems: extra.systems ?? [
      {
        id: "sys.1",
        ownerFactionId: "f1",
        planets: [{ id: "p1", population: 10, ownerFactionId: "f1" }],
      },
    ],
    quests: extra.quests ?? [],
  };
}

describe("production_mult consumer (governor posting)", () => {
  it("raises system supply multiplier vs the same system without a governor", () => {
    getContent();
    const vacant = worldFor([]);
    syncNpcPassiveEffects(vacant);
    const before = npcProductionMultForSystem(
      vacant,
      "f1",
      "sys.1",
      "currency.supply",
    );

    const posted = worldFor([
      defaultNpc({
        id: "gov",
        name: "Steward",
        raceId: "race_human",
        status: "away",
        posting: { kind: "governor", systemId: "sys.1", sinceTurn: 0 },
      }),
    ]);
    syncNpcPassiveEffects(posted);
    const after = npcProductionMultForSystem(
      posted,
      "f1",
      "sys.1",
      "currency.supply",
    );
    assert.equal(before, 1);
    assert.ok(after > before);
    assert.equal(after, 1.12);
  });
});

describe("stat_mult consumer (commander posting)", () => {
  it("raises group damage vs the same stacks without the posting", () => {
    getContent();
    const groups = [
      {
        parentKind: "legion",
        parentId: "leg.1",
        damage: 10,
        armor: 4,
        count: 1,
        hp: 100,
        maxHp: 100,
        accuracy: 50,
        roles: ["infantry"],
      },
    ];
    const vacant = worldFor([]);
    syncNpcPassiveEffects(vacant);
    const before = applyCourtStatMultToGroups(
      groups,
      vacant.factions[0],
    )[0].damage;

    const posted = worldFor([
      defaultNpc({
        id: "cmd",
        name: "Marshal",
        raceId: "race_human",
        status: "away",
        posting: {
          kind: "commander",
          legionId: "leg.1",
          forceId: "leg.1",
          sinceTurn: 0,
        },
      }),
    ]);
    syncNpcPassiveEffects(posted);
    const afterGroups = applyCourtStatMultToGroups(groups, posted.factions[0]);
    assert.equal(before, 10);
    assert.ok(afterGroups[0].damage > before);
    // local 1.1 × faction echo 1.03
    assert.equal(Number(afterGroups[0].damage.toFixed(4)), 11.33);
  });
});

describe("pop_growth_mult consumer (NPC trait)", () => {
  it("changes the pop_growth channel vs the same faction without the trait", () => {
    getContent();
    const vacant = worldFor([]);
    syncNpcPassiveEffects(vacant);
    const beforeFx = courtPopGrowthEffects(vacant.factions[0]);
    const beforeCh = buildModifierStack(beforeFx).channels.pop_growth;

    const withTrait = worldFor([
      defaultNpc({
        id: "reg",
        name: "Builder",
        raceId: "race_human",
        traitIds: ["npc_trait.regent_builder"],
      }),
    ]);
    syncNpcPassiveEffects(withTrait);
    const afterFx = courtPopGrowthEffects(withTrait.factions[0]);
    const afterCh = buildModifierStack(afterFx).channels.pop_growth;
    assert.equal(beforeFx.length, 0);
    assert.ok(afterFx.some((e) => e.effect === "pop_growth_mult"));
    const grown = applyFlatThenMult(10, afterCh);
    const base = applyFlatThenMult(10, beforeCh);
    assert.ok(grown > base);
    assert.equal(Number(grown.toFixed(4)), 10.5);
  });
});

describe("npc_task_speed_mult (task tick)", () => {
  it("raises this-turn progress vs the same task without the trait", () => {
    getContent();
    const task = {
      id: "t1",
      label: "Survey",
      startedTurn: 0,
      etaTurn: 2,
      progress: 0,
      effects: [],
    };
    const plain = worldFor([
      defaultNpc({
        id: "n",
        name: "Agent",
        raceId: "race_human",
        status: "busy",
        currentTask: { ...task },
      }),
    ]);
    syncNpcPassiveEffects(plain);
    processNpcTasks(plain, 1, []);
    const baseline = plain.factions[0].npcs[0].currentTask.progress;

    const fast = worldFor([
      defaultNpc({
        id: "n",
        name: "Agent",
        raceId: "race_human",
        status: "busy",
        traitIds: ["npc_trait.psion_agent"],
        currentTask: { ...task },
      }),
    ]);
    syncNpcPassiveEffects(fast);
    assert.ok(npcTaskSpeedMult(fast.factions[0]) > 1);
    processNpcTasks(fast, 1, []);
    const boosted = fast.factions[0].npcs[0].currentTask.progress;
    assert.equal(baseline, 0.5);
    assert.ok(boosted > baseline);
    assert.equal(Number(boosted.toFixed(4)), 0.575);
  });
});
