import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ViewerPayload, WorldState } from "../../state/types.ts";
import { emptyViewerPlayWorld } from "../features/map-viewport/viewerPlayMapModel.ts";
import { visiblePlayerQuests } from "./adaptQuest.ts";
import { collectAttention, questAttentionCount } from "./questAttention.ts";
import type { Quest } from "./types.ts";

function world(partial: Partial<WorldState> = {}): WorldState {
  return { ...emptyViewerPlayWorld(), ...partial };
}

function payload(w: WorldState, factionId = "f1"): ViewerPayload {
  return { factionId, world: w } as ViewerPayload;
}

function uiQuest(partial: Partial<Quest> & Pick<Quest, "id" | "title">): Quest {
  return {
    kind: "side",
    status: "active",
    narrative: false,
    hook: "hook",
    description: "desc",
    ...partial,
  };
}

describe("visiblePlayerQuests", () => {
  it("hides another empire's main quest and keeps own + foreign", () => {
    const w = world({
      quests: [
        {
          id: "mine",
          name: "Мой",
          summary: "",
          systemId: null,
          status: "active",
          type: "side",
          sourceFactionId: "f1",
        },
        {
          id: "their-main",
          name: "Чужой сюжет",
          summary: "",
          systemId: null,
          status: "active",
          type: "main",
          sourceFactionId: "f2",
        },
        {
          id: "foreign",
          name: "От соседа",
          summary: "",
          systemId: null,
          status: "active",
          type: "foreign",
          sourceFactionId: "f2",
        },
        {
          id: "hidden",
          name: "Скрыт",
          summary: "",
          systemId: null,
          status: "hidden",
          sourceFactionId: "f1",
        },
      ],
    });
    const ids = visiblePlayerQuests(w, "f1").map((q) => q.id);
    assert.deepEqual(ids, ["mine", "foreign"]);
  });
});

describe("questAttentionCount", () => {
  it("counts unrolled yearly dice, not every active quest", () => {
    const w = world({
      quests: [
        {
          id: "idle",
          name: "В работе",
          summary: "",
          systemId: null,
          status: "active",
          sourceFactionId: "f1",
        },
        {
          id: "theirs",
          name: "Чужой",
          summary: "",
          systemId: null,
          status: "active",
          sourceFactionId: "f2",
          type: "side",
        },
      ],
    });
    assert.equal(questAttentionCount(payload(w)), 1);
  });

  it("counts a choice on your quest even after the yearly dice", () => {
    const base = emptyViewerPlayWorld();
    const w = world({
      meta: { ...base.meta, turn: 4, yearlyQuestRolls: { f1: 4 } },
      quests: [
        {
          id: "pick",
          name: "Выбор",
          summary: "",
          systemId: null,
          status: "active",
          sourceFactionId: "f1",
          choices: [{ id: "a", label: "Да" }],
        },
      ],
    });
    assert.equal(questAttentionCount(payload(w)), 1);
  });

  it("is zero when dice already rolled and nothing needs a decision", () => {
    const base = emptyViewerPlayWorld();
    const w = world({
      meta: { ...base.meta, turn: 4, yearlyQuestRolls: { f1: 4 } },
      quests: [
        {
          id: "idle",
          name: "В работе",
          summary: "",
          systemId: null,
          status: "active",
          sourceFactionId: "f1",
        },
      ],
    });
    assert.equal(questAttentionCount(payload(w)), 0);
  });
});

describe("collectAttention", () => {
  it("lists choice quests before expiry", () => {
    const items = collectAttention(
      [
        uiQuest({ id: "e", title: "Срок", expiresTurn: 3 }),
        uiQuest({
          id: "c",
          title: "Выбор",
          choices: [
            { id: "1", label: "A" },
            { id: "2", label: "B" },
          ],
        }),
      ],
      2,
    );
    assert.deepEqual(
      items.map((i) => i.quest.id),
      ["c", "e"],
    );
    assert.equal(items[0]?.label, "2 выбора");
  });
});
