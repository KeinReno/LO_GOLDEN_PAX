/**
 * Yearly quest rolling + choice/dice resolution + expiry + normalization.
 * Extracted from ../questEngine.mjs.
 */
import { getContent } from "../contentLoader.mjs";
import {
  formatDiceMessage,
  logDiceToRp,
  rollDice,
  rollRecurringQuests,
  rollSuccess,
} from "../dice.mjs";
import { factionById, ownedSystems, matchesFilter, buildFilterContext } from "./queryHelpers.mjs";
import { applyQuestEffects } from "./effects.mjs";

function nowIso() {
  return new Date().toISOString();
}

function ensureMeta(world) {
  if (!world.meta || typeof world.meta !== "object") world.meta = {};
  if (!world.meta.yearlyQuestRolls || typeof world.meta.yearlyQuestRolls !== "object") {
    world.meta.yearlyQuestRolls = {};
  }
  if (!Array.isArray(world.quests)) world.quests = [];
  return world.meta;
}

function pickSystemId(world, factionId) {
  const owned = ownedSystems(world, factionId);
  if (!owned.length) return null;
  return owned[Math.floor(Math.random() * owned.length)]?.id ?? null;
}

function catalogQuestToInstance(def, factionId, systemId, turn, expiresTurn) {
  return {
    id: `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    catalogId: def.id,
    name: def.name,
    summary: def.summary,
    detail: def.detail || "",
    systemId,
    sourceSystemId: systemId,
    sourceFactionId: factionId,
    status: "active",
    type: "yearly",
    history: [
      {
        at: nowIso(),
        turn,
        kind: "message",
        body: "Квест появился в ежеходном пуле.",
      },
    ],
    choices: Array.isArray(def.choices) ? structuredClone(def.choices) : [],
    diceRequired: Array.isArray(def.diceRequired)
      ? structuredClone(def.diceRequired)
      : undefined,
    expiresTurn,
  };
}

function pushHistory(quest, entry) {
  if (!Array.isArray(quest.history)) quest.history = [];
  quest.history.push(entry);
}

function currentChoices(quest) {
  if (quest.arc?.stages?.length) {
    const stage = quest.arc.stages[quest.arc.currentStage] || quest.arc.stages[0];
    if (stage?.choices?.length) return stage.choices;
  }
  return quest.choices || [];
}

function findChoice(quest, choiceId) {
  return currentChoices(quest).find((c) => c.id === choiceId) || null;
}

/**
 * Roll 1d6 and spawn that many filtered yearly quests for a faction.
 */
export function rollYearlyQuests(factionId, world, content, opts = {}) {
  ensureMeta(world);
  const turn = world.meta?.turn ?? 0;
  if (world.meta.yearlyQuestRolls[factionId] === turn && !opts.force) {
    return { ok: false, error: "Кубик ежеходных квестов уже брошен в этом ходу" };
  }

  const { count, roll } = rollRecurringQuests();
  const pack = content || getContent();
  const catalog = pack.yearly_quests || {};
  const defs = Object.values(catalog);
  const ctx = buildFilterContext(world, factionId);

  const matched = defs.filter((d) => matchesFilter(d.filterBy, ctx));
  const neutrals = defs.filter((d) => d.neutral || !d.filterBy || !Object.keys(d.filterBy).length);

  const pool = [...matched];
  while (pool.length < count) {
    const filler = neutrals[pool.length % Math.max(1, neutrals.length)];
    if (!filler) break;
    if (!pool.includes(filler)) pool.push(filler);
    else pool.push(filler);
    if (pool.length > defs.length + count) break;
  }

  // Shuffle lightly
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const picked = pool.slice(0, count);
  const expiresTurn = turn + 1;
  const created = [];
  for (const def of picked) {
    const systemId = pickSystemId(world, factionId);
    const q = catalogQuestToInstance(def, factionId, systemId, turn, expiresTurn);
    world.quests.push(q);
    created.push(q);
  }

  world.meta.yearlyQuestRolls[factionId] = turn;

  const faction = factionById(world, factionId);
  const body = formatDiceMessage(
    { count: 1, sides: 6, label: "1d6 ежеходных квестов" },
    [roll],
    null,
    faction?.name || "Игрок",
  );
  logDiceToRp(factionId, `${body} → ${created.length} квест(ов)`);

  return {
    ok: true,
    roll,
    count: created.length,
    quests: created,
    message: body,
  };
}

export function hasRolledYearlyQuests(world, factionId) {
  ensureMeta(world);
  const turn = world.meta?.turn ?? 0;
  return world.meta.yearlyQuestRolls[factionId] === turn;
}

/**
 * Expire yearly quests whose expiresTurn has arrived.
 */
export function expireQuests(world, turn, journal = []) {
  ensureMeta(world);
  for (const q of world.quests) {
    if (q.status !== "active") continue;
    if (q.expiresTurn == null) continue;
    if (Number(q.expiresTurn) > turn) continue;
    q.status = "expired";
    pushHistory(q, {
      at: nowIso(),
      turn,
      kind: "message",
      body: "Срок истёк — квест закрыт без решения.",
      outcome: "expired",
    });
    journal.push({ type: "quest_expired", questId: q.id, name: q.name });
  }
}

export function resolveQuestChoice(questId, choiceId, world, content, opts = {}) {
  ensureMeta(world);
  const quest = (world.quests ?? []).find((q) => q.id === questId);
  if (!quest) return { ok: false, error: "Квест не найден" };
  if (quest.status !== "active") return { ok: false, error: "Квест уже закрыт" };

  const choice = findChoice(quest, choiceId);
  if (!choice) return { ok: false, error: "Выбор не найден" };

  if (choice.diceRequired?.length) {
    return {
      ok: false,
      error: "Сначала нужен бросок кубика",
      needsDice: true,
      diceRequired: choice.diceRequired,
    };
  }

  const factionId = opts.factionId || quest.sourceFactionId;
  if (!factionId) return { ok: false, error: "Нет фракции квеста" };
  if (opts.factionId && quest.sourceFactionId && opts.factionId !== quest.sourceFactionId) {
    return { ok: false, error: "Чужой квест" };
  }

  const turn = world.meta?.turn ?? 0;
  const effectResult = applyQuestEffects(world, factionId, choice.effects || [], {
    turn,
    questId: quest.id,
    label: quest.name,
    intentId: opts.intentId,
    reason: "quest_choice",
  });
  if (effectResult.error) {
    return { ok: false, error: effectResult.error };
  }

  pushHistory(quest, {
    at: nowIso(),
    turn,
    kind: "choice",
    body: `Выбор: ${choice.label}`,
    authorName: opts.authorName,
    outcome: effectResult.notes.join("; ") || "ok",
  });

  if (choice.nextStageId && quest.arc?.stages?.length) {
    const idx = quest.arc.stages.findIndex((s) => s.id === choice.nextStageId);
    if (idx >= 0) {
      quest.arc.currentStage = idx;
      pushHistory(quest, {
        at: nowIso(),
        turn,
        kind: "stage_change",
        body: `Стадия: ${quest.arc.stages[idx].label}`,
      });
    } else {
      quest.status = "done";
    }
  } else {
    quest.status = "done";
  }

  if (effectResult.notes.length) {
    pushHistory(quest, {
      at: nowIso(),
      turn,
      kind: "reward",
      body: effectResult.notes.join("; "),
    });
  }

  return { ok: true, quest, choice, effects: effectResult };
}

export function resolveQuestDice(questId, specIndex, world, content, opts = {}) {
  ensureMeta(world);
  const quest = (world.quests ?? []).find((q) => q.id === questId);
  if (!quest) return { ok: false, error: "Квест не найден" };
  if (quest.status !== "active") return { ok: false, error: "Квест уже закрыт" };

  const factionId = opts.factionId || quest.sourceFactionId;
  if (!factionId) return { ok: false, error: "Нет фракции квеста" };
  if (opts.factionId && quest.sourceFactionId && opts.factionId !== quest.sourceFactionId) {
    return { ok: false, error: "Чужой квест" };
  }

  const choiceId = opts.choiceId || null;
  const choice = choiceId ? findChoice(quest, choiceId) : null;

  let specs = [];
  if (choice?.diceRequired?.length) specs = choice.diceRequired;
  else if (quest.diceRequired?.length) specs = quest.diceRequired;
  else if (quest.arc?.stages?.[quest.arc.currentStage]?.diceRequired?.length) {
    specs = quest.arc.stages[quest.arc.currentStage].diceRequired;
  }

  const idx = Math.max(0, Math.floor(Number(specIndex) || 0));
  const spec = specs[idx];
  if (!spec) return { ok: false, error: "Нет спецификации кубика" };

  const rolls = rollDice(spec);
  const success = rollSuccess(spec, rolls);
  const faction = factionById(world, factionId);
  const turn = world.meta?.turn ?? 0;
  const message = formatDiceMessage(spec, rolls, success, faction?.name || "Игрок");
  logDiceToRp(factionId, message);

  pushHistory(quest, {
    at: nowIso(),
    turn,
    kind: "dice",
    body: message,
    authorName: opts.authorName || faction?.name,
    outcome: success === true ? "success" : success === false ? "fail" : "roll",
  });

  let effectResult = { applied: [], notes: [] };
  if (choice) {
    const effects =
      success === true
        ? choice.onSuccess || []
        : success === false
          ? choice.onFail || []
          : [];
    effectResult = applyQuestEffects(world, factionId, effects, {
      turn,
      questId: quest.id,
      label: quest.name,
      intentId: opts.intentId,
      reason: "quest_dice",
    });
    if (effectResult.error) {
      return { ok: false, error: effectResult.error, rolls, success, message };
    }
    // Consume choice after dice resolution for yearly quests
    if (choice.nextStageId && quest.arc?.stages?.length) {
      const sidx = quest.arc.stages.findIndex((s) => s.id === choice.nextStageId);
      if (sidx >= 0) {
        quest.arc.currentStage = sidx;
      } else {
        quest.status = "done";
      }
    } else {
      quest.status = "done";
    }
    if (effectResult.notes.length) {
      pushHistory(quest, {
        at: nowIso(),
        turn,
        kind: "reward",
        body: effectResult.notes.join("; "),
        outcome: success === true ? "success" : "fail",
      });
    }
  }

  return {
    ok: true,
    quest,
    rolls,
    success,
    message,
    spec,
    effects: effectResult,
  };
}

/**
 * Normalize a raw quest object (migration helper).
 */
export function normalizeQuest(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    ...raw,
    id: String(raw.id || `q_${Math.random().toString(36).slice(2, 8)}`),
    name: String(raw.name || "Квест"),
    summary: String(raw.summary || ""),
    detail: raw.detail,
    systemId: raw.systemId ?? null,
    status: raw.status || "active",
    type: raw.type || "side",
    sourceFactionId: raw.sourceFactionId ?? null,
    sourceSystemId: raw.sourceSystemId ?? raw.systemId ?? null,
    sourceNpcId: raw.sourceNpcId ?? null,
    arc: raw.arc,
    history: Array.isArray(raw.history) ? raw.history : [],
    choices: Array.isArray(raw.choices) ? raw.choices : undefined,
    diceRequired: Array.isArray(raw.diceRequired) ? raw.diceRequired : undefined,
    expiresTurn: raw.expiresTurn ?? null,
    catalogId: raw.catalogId ?? null,
  };
}
