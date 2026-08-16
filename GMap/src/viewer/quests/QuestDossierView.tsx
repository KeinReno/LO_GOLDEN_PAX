import type { ReactNode } from "react";
import { useViewerPanelFocusStore } from "../../state/viewerPanelFocusStore";
import { DragCard } from "../../ui/DragCard";
import { DropZone } from "../../ui/DropZone";
import { canAffordCosts } from "./adaptQuest";
import type { QuestChoice, QuestObjective, QuestStatus } from "./types";
import { QUEST_STATUS_LABEL } from "./types";

export type QuestDossierViewProps = {
  kicker: string;
  title: string;
  status: QuestStatus;
  systemName?: string;
  expiresTurn?: number | null;
  onClose: () => void;
  wide?: boolean;
  panelClassName?: string;
  bodyClassName?: string;
  children: ReactNode;
};

/** Shared modal chrome for player + GM quest dossiers. */
export function QuestDossierView({
  kicker,
  title,
  status,
  systemName,
  expiresTurn,
  onClose,
  wide = false,
  panelClassName,
  bodyClassName,
  children,
}: QuestDossierViewProps) {
  return (
    <div
      className="dossier-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className={[
          "dossier-panel",
          wide ? "dossier-panel-wide" : "",
          panelClassName,
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dossier-head">
          <div>
            <p className="dossier-kicker">{kicker}</p>
            <h2>{title}</h2>
            <p className="hint">
              <span className="quest-brief__status">
                <span
                  className={`quest-status-dot quest-status-dot--${status}`}
                  aria-hidden
                />
                {QUEST_STATUS_LABEL[status]}
              </span>
              {systemName ? ` · ${systemName}` : ""}
              {expiresTurn != null ? ` · до хода ${expiresTurn}` : ""}
            </p>
          </div>
          <button type="button" className="btn ghost" onClick={onClose}>
            Закрыть
          </button>
        </header>
        <div
          className={["dossier-body", bodyClassName].filter(Boolean).join(" ")}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function QuestObjectiveList({
  objectives,
}: {
  objectives: QuestObjective[];
}) {
  if (!objectives.length) return null;
  return (
    <ul className="quest-objectives" aria-label="Цели">
      {objectives.map((o) => (
        <li key={o.id} className={o.done ? "is-done" : ""}>
          <span aria-hidden>{o.done ? "☑" : "☐"}</span>
          {o.text}
        </li>
      ))}
    </ul>
  );
}

/** Drag-to-resolve choice board; unaffordable cards are pinned + disabled. */
export function QuestChoiceResolveBoard({
  choices,
  stocks,
  busy,
  onChoose,
}: {
  choices: QuestChoice[];
  stocks?: Record<string, number>;
  busy?: boolean;
  onChoose: (choiceId: string) => void;
}) {
  const affordableIds = choices
    .filter((c) => canAffordCosts(c.costs, stocks))
    .map((c) => c.id);

  return (
    <section className="quest-choice-board">
      <h3>Стол решений</h3>
      <p className="hint">
        Перетащите карточку выбора на стол решений (или нажмите кнопку).
      </p>
      <div className="quest-choice-layout">
        <div className="quest-choice-cards">
          {choices.map((c) => {
            const affordable = canAffordCosts(c.costs, stocks);
            const title = [
              c.hint,
              c.costLabel,
              !affordable ? "Недостаточно ресурсов" : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <DragCard
                key={c.id}
                cardId={c.id}
                title={c.label}
                subtitle={c.hint}
                pinned={!affordable}
                onDropZone={(zoneId) => {
                  if (zoneId === "quest-resolve" && affordable) {
                    onChoose(c.id);
                  }
                }}
              >
                {c.costLabel ? (
                  <span
                    className={`quest-choice-card__cost ${!affordable ? "is-short" : ""}`}
                  >
                    {c.costLabel}
                  </span>
                ) : null}
                {!affordable ? (
                  <span className="quest-choice-card__cost is-short">
                    Недостаточно ресурсов
                  </span>
                ) : null}
                {c.needsDice ? (
                  <span className="quest-choice-card__dice">🎲</span>
                ) : null}
                <button
                  type="button"
                  className="btn sm ghost"
                  disabled={busy || !affordable}
                  title={title}
                  onClick={() => onChoose(c.id)}
                >
                  Выбрать
                </button>
              </DragCard>
            );
          })}
        </div>
        <DropZone
          zoneId="quest-resolve"
          label="Стол решений"
          accepts={affordableIds}
          className="quest-drop-resolve"
        />
      </div>
    </section>
  );
}

/** Pin a court NPC then run the existing room switch. */
export function openCourtForNpc(
  npcId: string | undefined,
  onOpenCourt?: () => void,
): void {
  if (!onOpenCourt) return;
  if (npcId) {
    useViewerPanelFocusStore.getState().setCourtFocusNpcId(npcId);
  }
  onOpenCourt();
}

export function QuestAssignedChip({
  name,
  etaTurn,
  onOpenCourt,
}: {
  name: string;
  etaTurn?: number;
  onOpenCourt?: () => void;
}) {
  const label = `Над этим работает: ${name}${
    etaTurn != null ? ` · до хода ${etaTurn}` : ""
  }`;
  if (onOpenCourt) {
    return (
      <button
        type="button"
        className="quest-card-chip"
        onClick={onOpenCourt}
        title="Открыть двор"
      >
        {label}
      </button>
    );
  }
  return <span className="quest-card-chip">{label}</span>;
}
