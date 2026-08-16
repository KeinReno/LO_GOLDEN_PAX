/**
 * NPC court tasks. Port of GMap/server/narrative.mjs `applyGiveNpcTask` /
 * `processNpcTasks` (validation, per-turn progress, completion → expiring
 * faction effects, linked-quest advance).
 *
 * Dice: only when `linkedQuestId` is set — port that exact condition, do
 * not apply dice universally. Multiplier from domain/combat/dice.mjs's
 * `rollNpcTaskProgress` (GMap/server/dice.mjs verbatim).
 *
 * `npc_task_speed_mult` is applied here directly (not via the general
 * modifier-stack consumers). Completing a task writes effects with
 * `expiresTurn` — same shape as domain/diplomacy/treaties.mjs, default
 * duration matching GMap `ACTIVE_EFFECT_DEFAULT_TURNS = 10`.
 *
 * Linked quests use domain/quests/quest.mjs `advanceLinkedQuest`.
 */
import { rollNpcTaskProgress } from "../combat/dice.mjs";
import { buildModifierStack, mergeChannels } from "../economy/modifierStack.mjs";
import { advanceLinkedQuest } from "../quests/quest.mjs";

export const ACTIVE_EFFECT_DEFAULT_TURNS = 10;

function cloneEffects(list) {
  if (!Array.isArray(list)) return [];
  return list.map((e) =>
    e && typeof e === "object" ? { ...e, args: e.args ? { ...e.args } : e.args } : e,
  );
}

export function resolveCourtTaskDef(content, taskId) {
  if (!taskId) return null;
  return content?.court_tasks?.tasks?.[taskId] || content?.npc_tasks?.[taskId] || content?.tasks?.[taskId] || null;
}

function taskSpeedMult(courtEffects) {
  const relevant = (courtEffects ?? []).filter(
    (e) => (e.scope || "faction") === "faction" && e.effect === "npc_task_speed_mult",
  );
  if (!relevant.length) return 1;
  const stack = buildModifierStack(relevant);
  const ch = mergeChannels(stack.channels["npc_task:*"], null);
  return ch?.mult ?? 1;
}

/**
 * @param {{ npc: object, npcs: object[], turn: number, content: object, taskId?: string, taskLabel?: string, etaTurn?: number, linkedQuestId?: string }} args
 */
export function giveNpcTask({ npc, npcs, turn, content, taskId, taskLabel, etaTurn, linkedQuestId }) {
  const taskDef = resolveCourtTaskDef(content, taskId);
  const effects = cloneEffects(taskDef?.effects);
  let label = String(taskLabel || "").trim();
  if (!label && taskDef?.label) label = String(taskDef.label);

  let eta = Math.floor(Number(etaTurn));
  if ((!Number.isFinite(eta) || eta <= turn) && taskDef?.etaTurns != null) {
    eta = turn + Math.max(1, Math.floor(Number(taskDef.etaTurns)));
  }

  if (!npc || !label) return { ok: false, error: "npc_task_params" };
  if (!Number.isFinite(eta) || eta <= turn) return { ok: false, error: "npc_task_eta" };
  if (npc.currentTask) return { ok: false, error: "npc_busy" };
  if (npc.status === "dead" || npc.status === "hidden") return { ok: false, error: "npc_unavailable" };
  const postingKind = npc.posting?.kind || "court";
  if (postingKind !== "court") return { ok: false, error: "npc_posted" };

  const currentTask = {
    id: `ntask_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    label,
    startedTurn: turn,
    etaTurn: eta,
    progress: 0,
    effects,
    linkedQuestId: linkedQuestId || undefined,
    taskId: taskId || undefined,
  };
  const next = (npcs ?? []).map((n) => (n.id === npc.id ? { ...n, currentTask, status: "busy" } : n));
  return { ok: true, npcs: next, task: currentTask };
}

/**
 * @param {{ npcs: object[], turn: number, activeEffects?: object[], quests?: object[], courtEffects?: object[], rng?: Function }} args
 */
export function tickNpcTasks({ npcs, turn, activeEffects = [], quests = [], courtEffects = [], rng }) {
  const journal = [];
  let nextEffects = activeEffects.filter((e) => e.expiresTurn == null || Number(e.expiresTurn) > turn);
  let nextQuests = quests;
  const speed = taskSpeedMult(courtEffects);
  const nextNpcs = (npcs ?? []).map((npc) => {
    const task = npc.currentTask;
    if (!task) return npc;

    const duration = Math.max(1, (task.etaTurn ?? turn + 1) - (task.startedTurn ?? turn));
    let step = (1 / duration) * speed;
    let diceRoll = null;
    if (task.linkedQuestId) {
      const r = rollNpcTaskProgress(null, npc, rng);
      step *= r.mult;
      diceRoll = r.roll;
    }

    const progress = Math.min(1, (task.progress ?? 0) + step);
    const done = progress >= 1 || turn >= (task.etaTurn ?? Infinity);
    if (!done) {
      return { ...npc, currentTask: { ...task, progress } };
    }

    const effects = Array.isArray(task.effects) ? task.effects : [];
    for (const e of effects) {
      nextEffects = [
        ...nextEffects,
        {
          ...e,
          expiresTurn: e.expiresTurn != null ? Number(e.expiresTurn) : turn + ACTIVE_EFFECT_DEFAULT_TURNS,
          source: e.source || { kind: "npc_task", id: task.id, label: `${npc.name}: ${task.label}` },
          scope: e.scope || "faction",
        },
      ];
    }

    journal.push({
      type: "court",
      subtype: "npc_task_complete",
      npcId: npc.id,
      npcName: npc.name,
      taskLabel: task.label,
      taskId: task.id,
      diceRoll,
      effectsApplied: effects.length,
    });

    if (task.linkedQuestId) {
      const advanced = advanceLinkedQuest(nextQuests, task.linkedQuestId, { npcId: npc.id });
      nextQuests = advanced.quests;
      journal.push(...advanced.journal);
    }

    return {
      ...npc,
      currentTask: null,
      status: npc.status === "busy" ? "active" : npc.status,
    };
  });

  return { npcs: nextNpcs, activeEffects: nextEffects, quests: nextQuests, journal };
}
