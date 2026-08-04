import { useMemo, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { UserRound, X } from "lucide-react";
import type { NpcTaskView } from "./types";

export type NpcPanelProps = {
  open: boolean;
  onClose: () => void;
  tasks: NpcTaskView[];
  turn: number;
  onAssign: (
    npcId: string,
    project: string,
  ) => void | Promise<boolean | void>;
};

const ROLE_LABEL: Record<string, string> = {
  ruler: "правитель",
  priest: "жрец",
  strategist: "стратег",
  architect: "архитектор",
  agent: "агент",
  other: "двор",
};

const STATUS_LABEL = {
  idle: "свободен",
  working: "в работе",
  done: "готово",
} as const;

function Avatar({ task }: { task: NpcTaskView }) {
  if (task.avatarUrl) {
    return (
      <img
        src={task.avatarUrl}
        alt=""
        className="quest-npc-avatar"
      />
    );
  }
  return (
    <span className="quest-npc-avatar quest-npc-avatar--ph" aria-hidden>
      {(task.npcName || "?").slice(0, 1).toUpperCase()}
    </span>
  );
}

export function NpcPanel({
  open,
  onClose,
  tasks,
  turn,
  onAssign,
}: NpcPanelProps) {
  const [npcId, setNpcId] = useState("");
  const [project, setProject] = useState("");
  const [busy, setBusy] = useState(false);
  const [assignFor, setAssignFor] = useState<string | null>(null);

  const idleNpcs = useMemo(
    () => tasks.filter((t) => t.status === "idle"),
    [tasks],
  );
  const working = tasks.filter((t) => t.status === "working").length;
  const done = tasks.filter((t) => t.status === "done").length;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const target = assignFor || npcId;
    if (!target || !project.trim() || busy) return;
    setBusy(true);
    try {
      await onAssign(target, project.trim());
      setProject("");
      setNpcId("");
      setAssignFor(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.aside
          key="npc"
          className="quest-npc-panel"
          initial={{ x: "100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 36 }}
          aria-label="NPC и поручения"
        >
          <header className="quest-npc-panel__head">
            <div>
              <p className="dossier-kicker">Двор</p>
              <h3>Поручения</h3>
              <p className="hint quest-npc-panel__stats">
                {tasks.length} лиц · {working} в работе
                {done ? ` · ${done} готово` : ""}
              </p>
            </div>
            <button
              type="button"
              className="btn ghost sm"
              onClick={onClose}
              aria-label="Закрыть"
            >
              <X size={16} />
            </button>
          </header>

          <ul className="quest-npc-list">
            {tasks.length === 0 ? (
              <li className="quest-npc-empty">
                <UserRound size={28} aria-hidden />
                <p>Нет известных лиц при дворе.</p>
                <p className="hint">Их назначает мастер / появляются в сюжете.</p>
              </li>
            ) : (
              tasks.map((t) => (
                <li key={t.id} className={`quest-npc-row is-${t.status}`}>
                  <Avatar task={t} />
                  <div className="quest-npc-row__body">
                    <div className="quest-npc-row__top">
                      <div>
                        <strong>{t.npcName}</strong>
                        {(t.title || t.role) && (
                          <p className="quest-npc-row__role hint">
                            {[t.title, t.role ? ROLE_LABEL[t.role] || t.role : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                      </div>
                      <span className={`quest-npc-pill is-${t.status}`}>
                        {STATUS_LABEL[t.status]}
                      </span>
                    </div>

                    {t.status === "idle" ? (
                      <button
                        type="button"
                        className="btn ghost sm quest-npc-row__assign-btn"
                        onClick={() => {
                          setAssignFor(t.npcId);
                          setNpcId(t.npcId);
                        }}
                      >
                        Дать поручение
                      </button>
                    ) : (
                      <>
                        <p className="quest-npc-row__project">{t.project}</p>
                        <div
                          className="quest-npc-bar"
                          role="progressbar"
                          aria-valuenow={t.progress}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        >
                          <span style={{ width: `${t.progress}%` }} />
                        </div>
                        <div className="quest-npc-row__meta hint">
                          <span>{t.progress}%</span>
                          {t.etaTurn != null ? (
                            <span>
                              ETA {t.etaTurn}
                              {t.status === "working" ? ` · ход ${turn}` : ""}
                            </span>
                          ) : null}
                        </div>
                      </>
                    )}
                  </div>
                </li>
              ))
            )}
          </ul>

          {(assignFor || idleNpcs.length > 0) && (
            <form className="quest-npc-assign" onSubmit={(e) => void submit(e)}>
              <h4>Новое поручение</h4>
              <label>
                <span className="hint">Кому</span>
                <select
                  value={assignFor || npcId}
                  onChange={(e) => {
                    setNpcId(e.target.value);
                    setAssignFor(e.target.value || null);
                  }}
                  disabled={busy || idleNpcs.length === 0}
                >
                  <option value="">— выбрать —</option>
                  {idleNpcs.map((n) => (
                    <option key={n.npcId} value={n.npcId}>
                      {n.npcName}
                      {n.title ? ` · ${n.title}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="hint">Задача</span>
                <input
                  type="text"
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                  placeholder="Разведка, переговоры, саботаж…"
                  disabled={busy}
                />
              </label>
              <button
                type="submit"
                className="btn primary sm"
                disabled={
                  busy || !(assignFor || npcId) || !project.trim()
                }
              >
                Назначить · ETA +2 хода
              </button>
            </form>
          )}
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
