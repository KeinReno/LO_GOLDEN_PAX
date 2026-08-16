import { describe, it, expect } from "vitest";
import { rollNpcTaskProgress } from "../combat/dice.mjs";
import { giveNpcTask, tickNpcTasks, ACTIVE_EFFECT_DEFAULT_TURNS } from "./npcTasks.mjs";
import { defaultNpc } from "./npcRoster.mjs";
import { getContent } from "../../contentLoader.mjs";

const content = getContent(["core"]);

function npc(overrides = {}) {
  return defaultNpc({ id: "n1", name: "Agent", raceId: "r", ...overrides });
}

describe("rollNpcTaskProgress", () => {
  it("maps 1-2→0.6, 3-4→1, 5-6→1.4", () => {
    expect(rollNpcTaskProgress(null, null, () => 1).mult).toBe(0.6);
    expect(rollNpcTaskProgress(null, null, () => 2).mult).toBe(0.6);
    expect(rollNpcTaskProgress(null, null, () => 3).mult).toBe(1);
    expect(rollNpcTaskProgress(null, null, () => 4).mult).toBe(1);
    expect(rollNpcTaskProgress(null, null, () => 5).mult).toBe(1.4);
    expect(rollNpcTaskProgress(null, null, () => 6).mult).toBe(1.4);
  });

  it("over many rolls lands in all three buckets (not a single-roll assertion)", () => {
    const counts = { 0.6: 0, 1: 0, 1.4: 0 };
    for (let i = 0; i < 600; i++) counts[rollNpcTaskProgress().mult] += 1;
    expect(counts[0.6]).toBeGreaterThan(80);
    expect(counts[1]).toBeGreaterThan(80);
    expect(counts[1.4]).toBeGreaterThan(80);
    expect(counts[0.6] + counts[1] + counts[1.4]).toBe(600);
  });
});

describe("giveNpcTask validation", () => {
  it("rejects busy, dead, hidden, and posted-away NPCs", () => {
    const turn = 4;
    expect(giveNpcTask({ npc: npc({ currentTask: { id: "t" } }), npcs: [npc({ currentTask: { id: "t" } })], turn, content, taskId: "court_task.survey" }).error).toBe("npc_busy");
    expect(giveNpcTask({ npc: npc({ status: "dead" }), npcs: [npc({ status: "dead" })], turn, content, taskId: "court_task.survey" }).error).toBe("npc_unavailable");
    expect(giveNpcTask({ npc: npc({ status: "hidden" }), npcs: [npc({ status: "hidden" })], turn, content, taskId: "court_task.survey" }).error).toBe("npc_unavailable");
    expect(
      giveNpcTask({
        npc: npc({ posting: { kind: "governor", systemId: "s1", sinceTurn: 0 } }),
        npcs: [npc({ posting: { kind: "governor", systemId: "s1", sinceTurn: 0 } })],
        turn,
        content,
        taskId: "court_task.survey",
      }).error,
    ).toBe("npc_posted");
  });
});

describe("tickNpcTasks", () => {
  it("on completion applies effects with expiresTurn = turn + 10", () => {
    const given = giveNpcTask({ npc: npc(), npcs: [npc()], turn: 5, content, taskId: "court_task.drill" });
    expect(given.ok).toBe(true);
    const ticked = tickNpcTasks({ npcs: given.npcs, turn: 8 });
    const done = ticked.npcs[0];
    expect(done.currentTask).toBeNull();
    expect(done.status).toBe("active");
    expect(ticked.activeEffects[0].expiresTurn).toBe(8 + ACTIVE_EFFECT_DEFAULT_TURNS);
    expect(ticked.activeEffects[0].source.kind).toBe("npc_task");
    expect(ticked.activeEffects[0].effect).toBe("stat_mult");
  });

  it("advances a linked quest arc on completion", () => {
    const given = giveNpcTask({
      npc: npc(),
      npcs: [npc()],
      turn: 1,
      content,
      taskId: "court_task.survey",
      linkedQuestId: "q1",
    });
    const quests = [{ id: "q1", status: "active", arc: { currentStage: 0, stages: ["a", "b", "c"] } }];
    const ticked = tickNpcTasks({ npcs: given.npcs, turn: 3, quests, rng: () => 3 });
    expect(ticked.quests[0].arc.currentStage).toBe(1);
    expect(ticked.journal.some((j) => j.subtype === "quest_arc_advance")).toBe(true);
  });

  it("applies dice only when linkedQuestId is set", () => {
    const withQuest = giveNpcTask({
      npc: npc(),
      npcs: [npc()],
      turn: 0,
      content,
      taskId: "court_task.survey",
      linkedQuestId: "q1",
    });
    const slow = tickNpcTasks({ npcs: withQuest.npcs, turn: 1, rng: () => 1 });
    expect(slow.npcs[0].currentTask.progress).toBeCloseTo(0.6 * 0.5, 8);

    const noQuest = giveNpcTask({ npc: npc({ id: "n2" }), npcs: [npc({ id: "n2" })], turn: 0, content, taskId: "court_task.survey" });
    const even = tickNpcTasks({ npcs: noQuest.npcs, turn: 1, rng: () => 1 });
    expect(even.npcs[0].currentTask.progress).toBeCloseTo(0.5, 8);
  });

  it("npc_task_speed_mult raises this-turn progress vs the same task without it", () => {
    const given = giveNpcTask({ npc: npc(), npcs: [npc()], turn: 0, content, taskId: "court_task.survey" });
    const baseline = tickNpcTasks({ npcs: given.npcs, turn: 1 });
    const boosted = tickNpcTasks({
      npcs: given.npcs,
      turn: 1,
      courtEffects: [{ effect: "npc_task_speed_mult", args: { mult: 1.15 }, scope: "faction" }],
    });
    expect(boosted.npcs[0].currentTask.progress).toBeGreaterThan(baseline.npcs[0].currentTask.progress);
    expect(boosted.npcs[0].currentTask.progress).toBeCloseTo(0.5 * 1.15, 8);
  });
});
