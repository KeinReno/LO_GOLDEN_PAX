import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import type {
  Quest,
  QuestChoice,
  QuestHistoryEntry,
  WorldState,
} from "../state/types";
import { CardBoard } from "../ui/cardBoardContext";
import { DragCard } from "../ui/DragCard";
import { DropZone } from "../ui/DropZone";
import { StatefulButton } from "../ui/StatefulButton";
import { DiceRoller } from "../ui/DiceRoller";

const STATUS_LABELS: Record<Quest["status"], string> = {
  active: "активен",
  done: "завершён",
  hidden: "скрыт",
  expired: "истёк",
};

type QuestDossierProps = {
  quest: Quest;
  world: WorldState;
  onClose: () => void;
  onFocusSystem?: (systemId: string) => void;
  onResolveChoice?: (questId: string, choiceId: string) => Promise<boolean>;
  onResolveDice?: (
    questId: string,
    specIndex: number,
    choiceId?: string,
  ) => Promise<{ ok: boolean; rolls?: number[]; success?: boolean | null; message?: string }>;
};

function activeChoices(quest: Quest): QuestChoice[] {
  if (quest.arc?.stages?.length) {
    const stage =
      quest.arc.stages[quest.arc.currentStage] ?? quest.arc.stages[0];
    if (stage?.choices?.length) return stage.choices;
  }
  return quest.choices ?? [];
}

function activeDice(quest: Quest, choice?: QuestChoice | null) {
  if (choice?.diceRequired?.length) return choice.diceRequired;
  if (quest.diceRequired?.length) return quest.diceRequired;
  const stage = quest.arc?.stages?.[quest.arc.currentStage];
  return stage?.diceRequired ?? [];
}

/** Quest detail with history timeline, choice cards, and dice. */
export function QuestDossier({
  quest,
  world,
  onClose,
  onFocusSystem,
  onResolveChoice,
  onResolveDice,
}: QuestDossierProps) {
  const system = quest.systemId
    ? world.systems.find((s) => s.id === quest.systemId)
    : null;
  const choices = useMemo(() => activeChoices(quest), [quest]);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [pendingDiceChoice, setPendingDiceChoice] = useState<string | null>(
    null,
  );
  const [diceResult, setDiceResult] = useState<{
    value: number;
    rolling: boolean;
    message?: string;
    sides?: number;
  } | null>(null);
  const history: QuestHistoryEntry[] = quest.history ?? [];
  const interactive = quest.status === "active";

  const dropChoice = async (choiceId: string) => {
    if (!interactive || !onResolveChoice) return;
    const choice = choices.find((c) => c.id === choiceId);
    if (choice?.diceRequired?.length) {
      setPendingDiceChoice(choiceId);
      return;
    }
    setBusy(true);
    const ok = await onResolveChoice(quest.id, choiceId);
    setBusy(false);
    if (ok) {
      setSuccess(true);
    }
  };

  const throwDice = async () => {
    if (!onResolveDice) return;
    setBusy(true);
    const res = await onResolveDice(
      quest.id,
      0,
      pendingDiceChoice ?? undefined,
    );
    setBusy(false);
    if (!res.ok) return;
    const value = res.rolls?.[0] ?? 1;
    const choice = choices.find((c) => c.id === pendingDiceChoice);
    const sides =
      choice?.diceRequired?.[0]?.sides ??
      (value > 6 ? 20 : 6);
    setDiceResult({ value, rolling: true, message: res.message, sides });
  };

  return (
    <div
      className="dossier-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="dossier-panel dossier-panel-wide quest-dossier"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dossier-head">
          <div>
            <p className="dossier-kicker">
              {quest.type === "yearly"
                ? "Ежходный квест"
                : quest.type === "main"
                  ? "Основной сюжет"
                  : "Квест"}
            </p>
            <h2>{quest.name}</h2>
            <p className="hint">
              {STATUS_LABELS[quest.status]}
              {system ? ` · ${system.name}` : ""}
              {quest.expiresTurn != null
                ? ` · до хода ${quest.expiresTurn}`
                : ""}
            </p>
          </div>
          <button type="button" className="btn ghost" onClick={onClose}>
            Закрыть
          </button>
        </header>

        <div className="dossier-body quest-dossier-body">
          <p className="quest-summary">{quest.summary}</p>
          {quest.detail && (
            <div className="quest-detail">
              {quest.detail.split("\n").map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          )}

          {quest.arc?.stages?.length ? (
            <ol className="quest-arc-stages" aria-label="Арка">
              {quest.arc.stages.map((s, i) => (
                <li
                  key={s.id}
                  className={
                    i === (quest.arc?.currentStage ?? 0)
                      ? "is-current"
                      : i < (quest.arc?.currentStage ?? 0)
                        ? "is-done"
                        : ""
                  }
                >
                  <strong>{s.label}</strong>
                  {s.summary && <span className="hint">{s.summary}</span>}
                </li>
              ))}
            </ol>
          ) : null}

          <section className="quest-history-block">
            <h3>История</h3>
            {history.length === 0 ? (
              <p className="hint">Пока нет записей.</p>
            ) : (
              <ol className="quest-timeline" aria-label="История квеста">
                {history.map((h, i) => (
                  <li
                    key={`${h.at}-${i}`}
                    className={i === history.length - 1 ? "is-current" : "is-done"}
                  >
                    <span className="quest-timeline-dot" aria-hidden />
                    <div>
                      <strong>
                        {h.kind}
                        {h.authorName ? ` · ${h.authorName}` : ""}
                      </strong>
                      <p className="quest-summary">{h.body}</p>
                      {h.outcome && (
                        <p className="hint">Исход: {h.outcome}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {interactive && choices.length > 0 && (
            <section className="quest-choice-board">
              <h3>Стол решений</h3>
              <p className="hint">
                Перетащите карточку выбора на стол решений (или нажмите
                кнопку).
              </p>
              <CardBoard>
                <div className="quest-choice-layout">
                  <div className="quest-choice-cards">
                    {choices.map((c) => (
                      <DragCard
                        key={c.id}
                        cardId={c.id}
                        title={c.label}
                        subtitle={c.description}
                        onDropZone={(zoneId) => {
                          if (zoneId === "quest-resolve") void dropChoice(c.id);
                        }}
                      >
                        <button
                          type="button"
                          className="btn sm ghost"
                          disabled={busy}
                          onClick={() => void dropChoice(c.id)}
                        >
                          Выбрать
                        </button>
                      </DragCard>
                    ))}
                  </div>
                  <DropZone
                    zoneId="quest-resolve"
                    label="Стол решений"
                    accepts={["*"]}
                    className="quest-drop-resolve"
                  />
                </div>
              </CardBoard>
            </section>
          )}

          {(pendingDiceChoice || activeDice(quest).length > 0) &&
            interactive && (
              <section className="quest-dice-block">
                <h3>Кубик</h3>
                <AnimatePresence mode="wait">
                  {diceResult ? (
                    <motion.div
                      key="dice"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                    >
                      <DiceRoller
                        value={diceResult.value}
                        sides={diceResult.sides ?? 6}
                        rolling={diceResult.rolling}
                        onSettled={() =>
                          setDiceResult((d) =>
                            d ? { ...d, rolling: false } : d,
                          )
                        }
                      />
                      {diceResult.message && !diceResult.rolling && (
                        <p className="dice-result-text" data-reveal>
                          {diceResult.message}
                        </p>
                      )}
                    </motion.div>
                  ) : (
                    <StatefulButton
                      key="btn"
                      className="btn primary"
                      busy={busy}
                      success={success}
                      onClick={() => void throwDice()}
                    >
                      Бросить кубик
                    </StatefulButton>
                  )}
                </AnimatePresence>
              </section>
            )}

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
