import type {
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
  QuestStatus,
} from "./types";
import { QUEST_ART_BY_KIND } from "./types";

export function visiblePlayerQuests(world: WorldState): WorldQuest[] {
  return (world.quests ?? []).filter((q) => q.status !== "hidden");
}

function mapKind(type: QuestType | undefined): QuestKind {
  if (type === "yearly") return "perturn";
  if (type === "main" || type === "faction" || type === "foreign") return type;
  return "side";
}

function mapStatus(status: WorldQuest["status"]): QuestStatus {
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

function activeChoices(q: WorldQuest): QuestChoice[] {
  let raw = q.choices ?? [];
  if (q.arc?.stages?.length) {
    const stage = q.arc.stages[q.arc.currentStage] ?? q.arc.stages[0];
    if (stage?.choices?.length) raw = stage.choices;
  }
  return raw.map((c) => ({
    id: c.id,
    label: c.label,
    hint: c.description,
    needsDice: Boolean(c.diceRequired?.length),
    resultText: undefined,
  }));
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

  return {
    id: q.id,
    title: q.name,
    kind,
    status: mapStatus(q.status),
    giverFactionId: q.sourceFactionId ?? undefined,
    giverFactionName: factionName(world, q.sourceFactionId),
    giverSystemId: q.sourceNpcId ?? undefined,
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
    objectives: q.arc?.stages?.map((s, i) => ({
      id: s.id,
      text: s.label + (s.summary ? ` — ${s.summary}` : ""),
      done: i < (q.arc?.currentStage ?? 0),
    })),
    secret: q.status === "hidden",
    tags: q.type === "yearly" ? ["perturn"] : undefined,
    log,
    artUrl: QUEST_ART_BY_KIND[kind],
    expiresTurn: q.expiresTurn,
  };
}

function mergeLogs(a: QuestLogEntry[], b: QuestLogEntry[]): QuestLogEntry[] {
  const seen = new Set<string>();
  const out: QuestLogEntry[] = [];
  for (const e of [...a, ...b].sort((x, y) =>
    x.timestamp.localeCompare(y.timestamp),
  )) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}

export function adaptQuests(
  payload: ViewerPayload,
  logsByQuest: Record<string, QuestLogEntry[]>,
): Quest[] {
  return visiblePlayerQuests(payload.world).map((q) =>
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
