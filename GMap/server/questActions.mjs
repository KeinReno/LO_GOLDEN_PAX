/**
 * Instant quest actions (A9): throw yearly dice / resolve choice / resolve dice.
 */
import { getContent } from "./contentLoader.mjs";
import { reservedAp, readIntents, writeIntents } from "./intents.mjs";
import { writeLiveBoard } from "./tableStore.mjs";
import {
  hasRolledYearlyQuests,
  resolveQuestChoice,
  resolveQuestDice,
  rollYearlyQuests,
} from "./questEngine.mjs";

function recordAppliedIntent({ factionId, defId, payload, note, turn, apCost }) {
  const intent = {
    id: `int_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    defId,
    factionId,
    turn,
    status: "applied",
    apCost: apCost ?? 0,
    payload: payload || {},
    note: note || "",
    submittedAt: new Date().toISOString(),
    resolvedAt: new Date().toISOString(),
    source: "quest",
  };
  const list = readIntents();
  list.push(intent);
  writeIntents(list);
  return intent;
}

/**
 * @param {{ world: object, factionId: string, action: string, questId?: string, choiceId?: string, specIndex?: number, note?: string, message?: string, apMax?: number }} opts
 */
export function applyQuestAction(opts) {
  const {
    world,
    factionId,
    action,
    questId,
    choiceId,
    specIndex = 0,
    note,
    message,
  } = opts;
  if (!world) return { ok: false, error: "Нет мира" };
  if (!factionId) return { ok: false, error: "Нет фракции" };

  const content = getContent();
  const turn = world.meta?.turn ?? 0;

  if (action === "send_quest_message") {
    if (!questId) return { ok: false, error: "questId required" };
    const text = String(message || note || "").trim().slice(0, 2000);
    if (!text) return { ok: false, error: "Пустое сообщение" };
    const quest = (world.quests || []).find((q) => q.id === questId);
    if (!quest) return { ok: false, error: "Квест не найден" };
    if (quest.sourceFactionId && quest.sourceFactionId !== factionId) {
      return { ok: false, error: "Чужой квест" };
    }
    if (!Array.isArray(quest.history)) quest.history = [];
    quest.history.push({
      at: new Date().toISOString(),
      turn,
      kind: "message",
      body: text,
      authorName: "Игрок",
    });
    writeLiveBoard(world, { backup: false, reason: "quest_message" });
    return { ok: true, quest, message: "Сообщение записано в журнал квеста" };
  }

  const defId =
    action === "throw_quest_dice"
      ? "intent.throw_quest_dice"
      : action === "resolve_quest_choice"
        ? "intent.resolve_quest_choice"
        : action === "resolve_quest_dice"
          ? "intent.resolve_quest_dice"
          : null;
  if (!defId) return { ok: false, error: "Неизвестное действие квеста" };

  const apCost = content.intents?.[defId]?.ap ?? 0;

  if (action === "throw_quest_dice") {
    if (hasRolledYearlyQuests(world, factionId)) {
      return { ok: false, error: "Кубик ежеходных квестов уже брошен в этом ходу" };
    }
    const result = rollYearlyQuests(factionId, world, content);
    if (!result.ok) return result;
    writeLiveBoard(world, { backup: false, reason: "quest_throw_dice" });
    const intent = recordAppliedIntent({
      factionId,
      defId,
      payload: { roll: result.roll, count: result.count },
      note: note || result.message,
      turn,
      apCost,
    });
    return {
      ok: true,
      intent,
      roll: result.roll,
      count: result.count,
      quests: result.quests,
      message: result.message,
      reservedAp: reservedAp(factionId, turn),
    };
  }

  if (action === "resolve_quest_choice") {
    const result = resolveQuestChoice(questId, choiceId, world, content, {
      factionId,
      intentId: null,
    });
    if (!result.ok) return result;
    writeLiveBoard(world, { backup: false, reason: "quest_choice" });
    const intent = recordAppliedIntent({
      factionId,
      defId,
      payload: { questId, choiceId },
      note: note || `choice:${choiceId}`,
      turn,
      apCost,
    });
    return {
      ok: true,
      intent,
      quest: result.quest,
      choice: result.choice,
      effects: result.effects,
      reservedAp: reservedAp(factionId, turn),
    };
  }

  if (action === "resolve_quest_dice") {
    const result = resolveQuestDice(questId, specIndex, world, content, {
      factionId,
      choiceId,
      intentId: null,
    });
    if (!result.ok) return result;
    writeLiveBoard(world, { backup: false, reason: "quest_dice" });
    const intent = recordAppliedIntent({
      factionId,
      defId,
      payload: {
        questId,
        specIndex,
        choiceId: choiceId || null,
        rolls: result.rolls,
        success: result.success,
      },
      note: note || result.message,
      turn,
      apCost,
    });
    return {
      ok: true,
      intent,
      quest: result.quest,
      rolls: result.rolls,
      success: result.success,
      message: result.message,
      spec: result.spec,
      effects: result.effects,
      reservedAp: reservedAp(factionId, turn),
    };
  }

  return { ok: false, error: "Неизвестное действие квеста" };
}

/** Tick appliers — mutate world, return boolean. */
export function applyThrowQuestDice(world, intent, journal) {
  const result = rollYearlyQuests(intent.factionId, world, getContent());
  if (!result.ok) {
    journal.push({
      at: new Date().toISOString(),
      type: "reject",
      intentId: intent.id,
      reason: result.error,
    });
    return false;
  }
  journal.push({
    at: new Date().toISOString(),
    type: "quest_yearly_roll",
    intentId: intent.id,
    factionId: intent.factionId,
    roll: result.roll,
    count: result.count,
  });
  return true;
}

export function applyResolveQuestChoice(world, intent, journal) {
  const result = resolveQuestChoice(
    intent.payload?.questId,
    intent.payload?.choiceId,
    world,
    getContent(),
    { factionId: intent.factionId, intentId: intent.id },
  );
  if (!result.ok) {
    journal.push({
      at: new Date().toISOString(),
      type: "reject",
      intentId: intent.id,
      reason: result.error,
    });
    return false;
  }
  journal.push({
    at: new Date().toISOString(),
    type: "quest_choice",
    intentId: intent.id,
    questId: intent.payload?.questId,
    choiceId: intent.payload?.choiceId,
  });
  return true;
}

export function applyResolveQuestDice(world, intent, journal) {
  const result = resolveQuestDice(
    intent.payload?.questId,
    intent.payload?.specIndex ?? 0,
    world,
    getContent(),
    {
      factionId: intent.factionId,
      choiceId: intent.payload?.choiceId,
      intentId: intent.id,
    },
  );
  if (!result.ok) {
    journal.push({
      at: new Date().toISOString(),
      type: "reject",
      intentId: intent.id,
      reason: result.error,
    });
    return false;
  }
  journal.push({
    at: new Date().toISOString(),
    type: "quest_dice",
    intentId: intent.id,
    questId: intent.payload?.questId,
    rolls: result.rolls,
    success: result.success,
  });
  return true;
}
