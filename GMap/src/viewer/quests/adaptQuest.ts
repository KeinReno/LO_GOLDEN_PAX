import type {
  FactionNpc,
  Quest as WorldQuest,
  QuestHistoryEntry,
  QuestType,
  ViewerPayload,
  WorldState,
} from "../../state/types";
import type {
  DiceCheck,
  NpcTaskView,
  Quest,
  QuestChoice,
  QuestKind,
  QuestLogEntry,
  QuestObjective,
  QuestStatus,
} from "./types";
import { QUEST_ART_BY_KIND } from "./types.ts";
import {
  formatChoiceCostLabel,
  formatWorldEffectsLabel,
  uiEffectsFromWorld,
} from "./questChoiceUi.ts";

export function visiblePlayerQuests(
  world: WorldState,
  factionId?: string,
): WorldQuest[] {
  return (world.quests ?? []).filter((q) => {
    if (q.status === "hidden") return false;
    if (!factionId) return true;
    if (!q.sourceFactionId || q.sourceFactionId === factionId) return true;
    // Issued by someone else, shown as an incoming foreign offer.
    if (q.type === "foreign") return true;
    return false;
  });
}

function mapKind(type: QuestType | undefined): QuestKind {
  if (type === "yearly") return "perturn";
  if (type === "main" || type === "faction" || type === "foreign") return type;
  return "side";
}

export function mapStatus(status: WorldQuest["status"]): QuestStatus {
  switch (status) {
    case "active":
      return "active";
    case "done":
      return "completed";
    case "expired":
      return "failed";
    case "hidden":
      return "locked";
    default:
      return "active";
  }
}

function historyAuthor(
  h: QuestHistoryEntry,
): QuestLogEntry["author"] {
  if (h.kind === "message") {
    const name = (h.authorName ?? "").toLowerCase();
    if (name.includes("gm") || name.includes("мастер")) return "gm";
    if (name.includes("npc") || name.includes("агент")) return "npc";
    if (name) return "player";
    return "gm";
  }
  return "system";
}

export function historyToLog(
  history: QuestHistoryEntry[] | undefined,
  questId: string,
): QuestLogEntry[] {
  return (history ?? []).map((h, i) => ({
    id: `${questId}-h-${i}-${h.at}`,
    turn: h.turn,
    author: historyAuthor(h),
    authorName: h.authorName,
    text: h.outcome ? `${h.body}\n${h.outcome}` : h.body,
    timestamp: h.at,
  }));
}

/** Mirror server stockCostsFromEffects for UI affordance. */
export function stockCostsFromEffects(
  effects: { effect?: string; args?: { resource?: string; amount?: number } }[] | undefined,
): Record<string, number> {
  const need: Record<string, number> = {};
  for (const e of effects || []) {
    if (
      (e.effect === "upkeep_flat" || e.effect === "production_flat") &&
      e.args?.resource
    ) {
      const delta = Number(e.args.amount || 0);
      if (delta < 0) {
        const id = String(e.args.resource);
        need[id] = (need[id] || 0) + Math.abs(delta);
      }
    }
  }
  return need;
}

export { formatChoiceCostLabel };

export function canAffordCosts(
  costs: Record<string, number> | undefined,
  stocks: Record<string, number> | undefined,
): boolean {
  if (!costs || !Object.keys(costs).length) return true;
  const bag = stocks || {};
  for (const [id, amt] of Object.entries(costs)) {
    if (Number(bag[id] ?? 0) < amt) return false;
  }
  return true;
}

function activeChoices(q: WorldQuest): QuestChoice[] {
  let raw = q.choices ?? [];
  if (q.arc?.stages?.length) {
    const stage = q.arc.stages[q.arc.currentStage] ?? q.arc.stages[0];
    if (stage?.choices?.length) raw = stage.choices;
  }
  return raw.map((c) => {
    const isDice = Boolean(c.diceRequired?.length);
    // Flat choices: block if can't pay. Dice: show risk hint only (no hard block).
    const costs = isDice ? {} : stockCostsFromEffects(c.effects);
    const risk = isDice ? stockCostsFromEffects(c.onFail) : {};
    const riskLabel = formatChoiceCostLabel(risk);
    const costLabel = isDice
      ? riskLabel
        ? `риск ${riskLabel}`
        : "проверка"
      : formatChoiceCostLabel(costs);
    const successLabel = formatWorldEffectsLabel(c.onSuccess);
    const failLabel = formatWorldEffectsLabel(c.onFail);
    const resultText = isDice
      ? [
          successLabel && `успех: ${successLabel}`,
          failLabel && `провал: ${failLabel}`,
        ]
          .filter(Boolean)
          .join(" · ") || undefined
      : undefined;
    return {
      id: c.id,
      label: c.label,
      hint: c.description,
      needsDice: isDice,
      costs: Object.keys(costs).length ? costs : undefined,
      costLabel,
      effects: uiEffectsFromWorld(isDice ? c.onSuccess : c.effects),
      resultText: resultText || undefined,
    };
  });
}

function activeDice(q: WorldQuest): DiceCheck | undefined {
  let specs = q.diceRequired ?? [];
  if (q.arc?.stages?.length) {
    const stage = q.arc.stages[q.arc.currentStage] ?? q.arc.stages[0];
    if (stage?.diceRequired?.length) specs = stage.diceRequired;
  }
  const spec = specs[0];
  if (!spec) return undefined;
  return {
    dice: spec.sides || 6,
    dc: spec.threshold,
    specIndex: 0,
    onSuccess: { text: "Успех" },
    onFail: { text: "Провал" },
  };
}

function systemName(world: WorldState, id: string | null | undefined): string | undefined {
  if (!id) return undefined;
  return world.systems.find((s) => s.id === id)?.name;
}

function factionName(world: WorldState, id: string | null | undefined): string | undefined {
  if (!id) return undefined;
  return world.factions.find((f) => f.id === id)?.name;
}

function npcById(
  world: WorldState,
  id: string | null | undefined,
): FactionNpc | undefined {
  if (!id) return undefined;
  for (const f of world.factions) {
    const found = f.npcs?.find((n) => n.id === id);
    if (found) return found;
  }
  return undefined;
}

function npcAssignedToQuest(
  world: WorldState,
  questId: string,
): FactionNpc | undefined {
  for (const f of world.factions) {
    for (const n of f.npcs ?? []) {
      if (n.status === "hidden" || n.status === "dead") continue;
      if (n.currentTask?.linkedQuestId === questId) return n;
    }
  }
  return undefined;
}

/** Adapt a world Quest into the Quests UI model. */
export function adaptQuest(
  q: WorldQuest,
  world: WorldState,
  extraLog: QuestLogEntry[] = [],
): Quest {
  const kind = mapKind(q.type);
  const fromHistory = historyToLog(q.history, q.id);
  const log = mergeLogs(fromHistory, extraLog);
  // Journal is always useful; "narrative" means discussable campaign thread.
  const narrative =
    kind === "main" ||
    Boolean(q.arc?.stages?.length) ||
    Boolean(q.history?.some((h) => h.kind === "message")) ||
    extraLog.some((e) => e.author === "player" || e.author === "gm");

  const sysId = q.systemId ?? q.sourceSystemId ?? null;
  const arcId = q.arc?.stages?.length ? `arc:${q.id}` : undefined;
  const assigned = npcAssignedToQuest(world, q.id);

  return {
    id: q.id,
    title: q.name,
    kind,
    status: mapStatus(q.status),
    giverFactionId: q.sourceFactionId ?? undefined,
    giverFactionName: factionName(world, q.sourceFactionId),
    giverNpcId: q.sourceNpcId ?? undefined,
    giverNpcName: npcById(world, q.sourceNpcId)?.name,
    systemId: sysId ?? undefined,
    systemName: systemName(world, sysId),
    arcId,
    arcLabel: q.arc?.stages?.length ? q.name : undefined,
    stage: q.arc?.currentStage,
    stageCount: q.arc?.stages?.length,
    stageLabels: q.arc?.stages?.map((s) => s.label),
    narrative,
    hook: q.summary,
    description: q.detail?.trim() || q.summary,
    choices: activeChoices(q),
    diceCheck: activeDice(q),
    objectives: mapObjectives(q),
    secret: q.status === "hidden",
    tags: q.type === "yearly" ? ["perturn"] : undefined,
    log,
    artUrl: QUEST_ART_BY_KIND[kind],
    expiresTurn: q.expiresTurn,
    assignedNpcId: assigned?.id,
    assignedNpcName: assigned?.name,
    assignedNpcEtaTurn: assigned?.currentTask?.etaTurn,
  };
}

/** Content key: local optimistic ids (`pl-…`) differ from server (`questId-h-i-at`). */
function logFingerprint(e: QuestLogEntry): string {
  return `${e.turn}\0${e.author}\0${e.text.trim()}`;
}

/**
 * Prefer server history; drop a local extra only when it 1:1-matches an unused
 * server row (same turn/author/text). Optimistic chat uses authorName "Вы",
 * server writes "Игрок" — role is the same. Identical texts in one turn stay
 * distinct as long as the server recorded both.
 */
function mergeLogs(
  server: QuestLogEntry[],
  local: QuestLogEntry[],
): QuestLogEntry[] {
  const seenIds = new Set<string>();
  const out: QuestLogEntry[] = [];
  for (const e of server) {
    if (seenIds.has(e.id)) continue;
    seenIds.add(e.id);
    out.push(e);
  }
  const claimed = new Set<number>();
  const serverCount = out.length;
  for (const e of local) {
    if (seenIds.has(e.id)) continue;
    const fp = logFingerprint(e);
    const idx = out.findIndex(
      (s, i) => i < serverCount && !claimed.has(i) && logFingerprint(s) === fp,
    );
    if (idx >= 0) {
      claimed.add(idx);
      continue;
    }
    seenIds.add(e.id);
    out.push(e);
  }
  out.sort((x, y) => x.timestamp.localeCompare(y.timestamp));
  return out;
}

function mapObjectives(q: WorldQuest): QuestObjective[] | undefined {
  if (q.objectives?.length) {
    return q.objectives.map((o) => ({
      id: o.id,
      text: o.text,
      done: Boolean(o.done),
    }));
  }
  const stages = q.arc?.stages;
  if (!stages?.length) return undefined;
  const current = q.arc?.currentStage ?? 0;
  return stages.map((s, i) => ({
    id: s.id,
    text: s.label + (s.summary ? ` — ${s.summary}` : ""),
    done: i < current,
  }));
}

export function adaptQuests(
  payload: ViewerPayload,
  logsByQuest: Record<string, QuestLogEntry[]>,
): Quest[] {
  return visiblePlayerQuests(payload.world, payload.factionId).map((q) =>
    adaptQuest(q, payload.world, logsByQuest[q.id] ?? []),
  );
}

export function adaptNpcTasks(payload: ViewerPayload): NpcTaskView[] {
  const fac = payload.world.factions.find((f) => f.id === payload.factionId);
  const turn = payload.world.meta?.turn ?? 0;
  const out: NpcTaskView[] = [];
  for (const npc of fac?.npcs ?? []) {
    if (npc.status === "hidden" || npc.status === "dead") continue;
    const task = npc.currentTask;
    const base = {
      npcId: npc.id,
      npcName: npc.name,
      title: npc.title,
      role: npc.role,
      avatarUrl: npc.avatarUrl,
    };
    if (!task) {
      out.push({
        ...base,
        id: `idle-${npc.id}`,
        project: "Свободен",
        progress: 0,
        status: "idle",
      });
      continue;
    }
    const span = Math.max(1, task.etaTurn - task.startedTurn);
    const elapsed = Math.max(0, turn - task.startedTurn);
    const progress =
      task.progress != null
        ? Math.round(Math.min(1, Math.max(0, task.progress)) * 100)
        : Math.round(Math.min(1, elapsed / span) * 100);
    const done = turn >= task.etaTurn || progress >= 100;
    out.push({
      ...base,
      id: task.id,
      project: task.label,
      progress: done ? 100 : progress,
      status: done ? "done" : "working",
      assignedTurn: task.startedTurn,
      etaTurn: task.etaTurn,
    });
  }
  return out;
}

export function hasRolledPerTurn(
  world: WorldState,
  factionId: string | undefined,
): boolean {
  if (!factionId) return true;
  const turn = world.meta?.turn ?? 0;
  return world.meta?.yearlyQuestRolls?.[factionId] === turn;
}
