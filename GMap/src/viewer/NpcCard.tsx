import { useMemo, useState } from "react";
import type {
  FactionNpc,
  Quest,
  ViewerPayload,
} from "../state/types";
import { DragCard } from "../ui/DragCard";

const STATUS_LABEL: Record<string, string> = {
  active: "на месте",
  away: "в отъезде",
  busy: "занят",
  hidden: "скрыт",
  dead: "погиб",
};

function questsForNpc(quests: Quest[] | undefined, npcId: string): Quest[] {
  return (quests ?? []).filter(
    (q) => q.sourceNpcId === npcId && q.status !== "hidden",
  );
}

function arcLabel(q: Quest): string | null {
  if (!q.arc?.stages?.length) return null;
  const cur = (q.arc.currentStage ?? 0) + 1;
  const total = q.arc.stages.length;
  const stage = q.arc.stages[q.arc.currentStage ?? 0];
  return `этап ${cur}/${total}${stage?.label ? ` · ${stage.label}` : ""}`;
}

export type NpcCardProps = {
  npc: FactionNpc;
  payload: ViewerPayload;
  accent?: string;
  /** Submit give_npc_task intent. */
  onGiveTask?: (npcId: string, opts: {
    taskLabel: string;
    etaTurn: number;
    linkedQuestId?: string;
  }) => void | Promise<void>;
  busy?: boolean;
  /** Compact row inside court list (still DragCard). */
  compact?: boolean;
};

/** Court NPC card — portrait, status, task progress, linked quests. */
export function NpcCard({
  npc,
  payload,
  accent,
  onGiveTask,
  busy = false,
  compact = false,
}: NpcCardProps) {
  const [assignOpen, setAssignOpen] = useState(false);
  const [taskLabel, setTaskLabel] = useState("");
  const [etaDelta, setEtaDelta] = useState(3);
  const [linkedQuestId, setLinkedQuestId] = useState("");

  const status = npc.status || "active";
  const linked = useMemo(
    () => questsForNpc(payload.world.quests, npc.id),
    [payload.world.quests, npc.id],
  );
  const turn = payload.world.meta.turn;
  const progress = npc.currentTask?.progress ?? 0;
  const canAssign =
    !!onGiveTask &&
    !npc.currentTask &&
    status !== "dead" &&
    status !== "hidden";

  const submit = async () => {
    if (!onGiveTask || !taskLabel.trim()) return;
    await onGiveTask(npc.id, {
      taskLabel: taskLabel.trim(),
      etaTurn: turn + Math.max(1, etaDelta),
      linkedQuestId: linkedQuestId || undefined,
    });
    setTaskLabel("");
    setLinkedQuestId("");
    setAssignOpen(false);
  };

  return (
    <DragCard
      cardId={npc.id}
      title={npc.name}
      subtitle={[npc.title, STATUS_LABEL[status] || status]
        .filter(Boolean)
        .join(" · ")}
      accent={accent || payload.world.factions.find((f) => f.id === payload.factionId)?.color}
      className={`npc-card npc-card--${status}${compact ? " npc-card--compact" : ""}`}
      icon={
        npc.avatarUrl ? (
          <img src={npc.avatarUrl} alt="" className="npc-card-avatar" />
        ) : (
          <span className="npc-card-avatar npc-card-avatar--ph" aria-hidden>
            {(npc.name || "?").slice(0, 1).toUpperCase()}
          </span>
        )
      }
      pinned={assignOpen}
    >
      <div className={`npc-status-dot npc-status-dot--${status}`} title={STATUS_LABEL[status]} />

      {npc.currentTask ? (
        <div className="npc-task">
          <span className="npc-task-label">{npc.currentTask.label}</span>
          <div
            className="npc-task-bar"
            role="progressbar"
            aria-valuenow={Math.round(progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <span className="hint">
            до хода {npc.currentTask.etaTurn}
            {typeof progress === "number"
              ? ` · ${Math.round(progress * 100)}%`
              : ""}
          </span>
        </div>
      ) : (
        <p className="hint npc-idle">Нет поручения</p>
      )}

      {linked.length > 0 && (
        <ul className="npc-quest-list">
          {linked.map((q) => (
            <li key={q.id}>
              <strong>{q.name}</strong>
              <span className="hint">
                {" "}
                · поручено {npc.name}
                {arcLabel(q) ? `, ${arcLabel(q)}` : ""}
              </span>
              {canAssign && q.status === "active" && (
                <button
                  type="button"
                  className="btn sm block"
                  disabled={busy}
                  onClick={() =>
                    void onGiveTask?.(npc.id, {
                      taskLabel: `Займись квестом: ${q.name}`,
                      etaTurn: turn + 3,
                      linkedQuestId: q.id,
                    })
                  }
                >
                  Займись этим квестом
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canAssign && !assignOpen && (
        <button
          type="button"
          className="btn sm block"
          disabled={busy}
          onClick={() => setAssignOpen(true)}
        >
          Дать поручение
        </button>
      )}

      {assignOpen && (
        <div className="npc-assign">
          <label className="field">
            <span>Задача</span>
            <input
              value={taskLabel}
              onChange={(e) => setTaskLabel(e.target.value)}
              placeholder="Восстановление Тангара"
              maxLength={120}
            />
          </label>
          <label className="field">
            <span>Срок (ходов)</span>
            <input
              type="number"
              min={1}
              max={20}
              value={etaDelta}
              onChange={(e) => setEtaDelta(Number(e.target.value) || 1)}
            />
          </label>
          {linked.length > 0 && (
            <label className="field">
              <span>Связать с квестом</span>
              <select
                value={linkedQuestId}
                onChange={(e) => setLinkedQuestId(e.target.value)}
              >
                <option value="">— без квеста —</option>
                {linked
                  .filter((q) => q.status === "active")
                  .map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <div className="npc-assign-actions">
            <button
              type="button"
              className="btn sm primary"
              disabled={busy || !taskLabel.trim()}
              onClick={() => void submit()}
            >
              Поручить (1 AP)
            </button>
            <button
              type="button"
              className="btn sm ghost"
              onClick={() => setAssignOpen(false)}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </DragCard>
  );
}
