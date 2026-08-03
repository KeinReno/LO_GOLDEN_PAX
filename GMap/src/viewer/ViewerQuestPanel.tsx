import { useMemo, useState } from "react";
import type { Quest, ViewerPayload, WorldState } from "../state/types";
import { ExpandableSection } from "../ui/ExpandableSection";

const STATUS_LABELS: Record<Quest["status"], string> = {
  active: "активен",
  done: "завершён",
  hidden: "скрыт",
};

export function visiblePlayerQuests(world: WorldState): Quest[] {
  return (world.quests ?? []).filter((q) => q.status !== "hidden");
}

function systemName(world: WorldState, id: string | null): string | null {
  if (!id) return null;
  return world.systems.find((s) => s.id === id)?.name ?? id;
}

/** Read-only quest list for the player viewer. */
export function ViewerQuestPanel({
  payload,
  onSelectQuest,
}: {
  payload: ViewerPayload;
  onSelectQuest: (questId: string) => void;
}) {
  const quests = useMemo(
    () => visiblePlayerQuests(payload.world),
    [payload.world],
  );
  const active = quests.filter((q) => q.status === "active");
  const done = quests.filter((q) => q.status === "done");

  return (
    <div className="hq-panel">
      <header className="hq-panel-head">
        <h2>Квесты</h2>
        <p className="hint">
          Известные задания · {active.length} активных
          {done.length > 0 ? ` · ${done.length} завершённых` : ""}
        </p>
      </header>

      <section className="hq-card">
        <h3>Активные</h3>
        {active.length === 0 ? (
          <div className="hq-empty quest-empty">
            <span className="hq-empty-reveal" aria-hidden />
            <p className="hint">
              Нет активных квестов в зоне видимости. Исследуйте системы и
              слушайте Сцену с мастером.
            </p>
          </div>
        ) : (
          <ul className="quest-card-list">
            {active.map((q) => (
              <li key={q.id}>
                <ExpandableSection
                  title={q.name}
                  badge={systemName(payload.world, q.systemId) ?? "активен"}
                  className="quest-expand-card"
                >
                  <p className="quest-summary">{q.summary}</p>
                  {q.detail && (
                    <div className="quest-detail quest-detail--clip">
                      {q.detail
                        .split("\n")
                        .slice(0, 4)
                        .map((line, i) => (
                          <p key={i}>{line}</p>
                        ))}
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn sm primary"
                    onClick={() => onSelectQuest(q.id)}
                  >
                    Открыть досье
                  </button>
                </ExpandableSection>
              </li>
            ))}
          </ul>
        )}
      </section>

      {done.length > 0 && (
        <ExpandableSection
          title="Завершённые"
          badge={done.length}
          className="hq-card hq-expandable--flush"
        >
          <ul className="hq-list">
            {done.map((q) => (
              <li key={q.id}>
                <button
                  type="button"
                  className="hq-list-item"
                  onClick={() => onSelectQuest(q.id)}
                >
                  <strong>{q.name}</strong>
                  <span className="hint">
                    {STATUS_LABELS[q.status]}
                    {systemName(payload.world, q.systemId)
                      ? ` · ${systemName(payload.world, q.systemId)}`
                      : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </ExpandableSection>
      )}
    </div>
  );
}

/** Read-only quest dossier (map marker or list). */
export function ViewerQuestDossier({
  quest,
  world,
  onClose,
  onFocusSystem,
}: {
  quest: Quest;
  world: WorldState;
  onClose: () => void;
  onFocusSystem?: (systemId: string) => void;
}) {
  const system = quest.systemId
    ? world.systems.find((s) => s.id === quest.systemId)
    : null;
  const [revealed, setRevealed] = useState(false);

  return (
    <div
      className="dossier-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="dossier-panel" onClick={(e) => e.stopPropagation()}>
        <header className="dossier-head">
          <div>
            <p className="dossier-kicker">Квест</p>
            <h2 className={revealed ? "quest-title-reveal" : ""}>{quest.name}</h2>
          </div>
          <button type="button" className="btn ghost" onClick={onClose}>
            Закрыть
          </button>
        </header>
        <div className="dossier-body">
          <ol className="quest-timeline" aria-label="Ход задания">
            <li className="is-done">
              <span className="quest-timeline-dot" aria-hidden />
              <div>
                <strong>Известно</strong>
                <p className="quest-summary">{quest.summary}</p>
              </div>
            </li>
            {quest.detail && (
              <li className={revealed ? "is-done" : "is-current"}>
                <span className="quest-timeline-dot" aria-hidden />
                <div>
                  <strong>Детали</strong>
                  {!revealed ? (
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => setRevealed(true)}
                    >
                      Раскрыть запись
                    </button>
                  ) : (
                    <div className="quest-detail quest-detail--reveal">
                      {quest.detail.split("\n").map((line, i) => (
                        <p key={i}>{line}</p>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            )}
            <li className={quest.status === "done" ? "is-done" : ""}>
              <span className="quest-timeline-dot" aria-hidden />
              <div>
                <strong>Статус</strong>
                <p className="hint">
                  {STATUS_LABELS[quest.status]}
                  {system ? ` · ${system.name}` : ""}
                </p>
              </div>
            </li>
          </ol>
          {system && onFocusSystem && (
            <div className="btn-col">
              <button
                type="button"
                className="btn primary"
                onClick={() => onFocusSystem(system.id)}
              >
                На карте к системе
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
