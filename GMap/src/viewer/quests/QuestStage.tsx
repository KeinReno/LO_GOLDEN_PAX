import {
  type CSSProperties,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { BookOpen, MapPin } from "lucide-react";
import { StatefulButton } from "../../ui/StatefulButton";
import { QuestDiceRoller } from "./DiceRoller";
import { canAffordCosts } from "./adaptQuest";
import type { Quest, QuestChoice } from "./types";
import { QUEST_KIND_META, QUEST_STATUS_LABEL } from "./types";
import {
  openCourtForNpc,
  QuestAssignedChip,
} from "./QuestDossierView";

export type QuestStageProps = {
  quest: Quest | null;
  busy?: boolean;
  chatOpen?: boolean;
  stocks?: Record<string, number>;
  onChoose: (choiceId: string) => void | Promise<void>;
  onRollDice: () => void | Promise<void>;
  onOpenChat: () => void;
  onFocusSystem?: (systemId: string) => void;
  onOpenCourt?: () => void;
  dicePreview?: {
    value: number;
    rolling: boolean;
    message?: string;
  } | null;
  onDiceSettled?: () => void;
  compact?: boolean;
};

function ChoiceFan({
  choices,
  busy,
  stocks,
  onChoose,
}: {
  choices: QuestChoice[];
  busy?: boolean;
  stocks?: Record<string, number>;
  onChoose: (id: string) => void;
}) {
  return (
    <div className="quest-choice-fan">
      <p className="hint quest-choice-fan__hint">
        Выберите вариант (1–{choices.length})
      </p>
      <div className="quest-choice-fan__row" role="list">
        {choices.map((c, i) => {
          const affordable = canAffordCosts(c.costs, stocks);
          const title = [
            c.hint,
            c.costLabel,
            !affordable ? "Недостаточно ресурсов" : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <motion.div
              key={c.id}
              role="listitem"
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: i * 0.04 }}
            >
              <button
                type="button"
                className={`quest-choice-card ${!affordable ? "is-unaffordable" : ""}`}
                disabled={busy || !affordable}
                style={
                  {
                    "--fan-i": i - (choices.length - 1) / 2,
                  } as CSSProperties
                }
                onClick={() => onChoose(c.id)}
                title={title}
              >
                <span className="quest-choice-card__hotkey">{i + 1}</span>
                <strong>{c.label}</strong>
                {c.hint ? <span className="hint">{c.hint}</span> : null}
                {c.costLabel ? (
                  <span
                    className={`quest-choice-card__cost ${!affordable ? "is-short" : ""}`}
                  >
                    {c.costLabel}
                  </span>
                ) : null}
                {c.needsDice ? (
                  <span className="quest-choice-card__dice">🎲</span>
                ) : null}
              </button>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/** Compact briefing strip — no giant icon card. */
function Briefing({
  quest,
  chatOpen,
  compact,
  onOpenChat,
  onFocusSystem,
  onOpenCourt,
}: {
  quest: Quest;
  chatOpen?: boolean;
  compact?: boolean;
  onOpenChat: () => void;
  onFocusSystem?: (systemId: string) => void;
  onOpenCourt?: () => void;
}) {
  const meta = QUEST_KIND_META[quest.kind];
  const stageIdx = quest.stage ?? 0;
  const stageTotal = quest.stageCount ?? 0;
  const stagePct =
    stageTotal > 0 ? Math.round(((stageIdx + 1) / stageTotal) * 100) : 0;
  const logCount = quest.log?.length ?? 0;

  return (
    <article
      className={`quest-brief quest-brief--${quest.kind}`}
    >
      <header className="quest-brief__bar">
        <span className="quest-brief__lane">
          <span aria-hidden>{meta.icon}</span>
          {meta.label}
        </span>
        <span className="quest-brief__status">
          <span
            className={`quest-status-dot quest-status-dot--${quest.status}`}
            aria-hidden
          />
          {QUEST_STATUS_LABEL[quest.status]}
        </span>
        <div className="quest-brief__actions">
          {!compact ? (
            <button
              type="button"
              className={`quest-card-journal ${chatOpen ? "is-open" : ""} ${quest.narrative ? "is-narrative" : ""}`}
              onClick={onOpenChat}
            >
              <BookOpen size={13} aria-hidden />
              {quest.narrative ? "Журнал" : "История"}
              {logCount > 0 ? (
                <span className="quest-group-count">{logCount}</span>
              ) : null}
            </button>
          ) : null}
          {quest.systemId && onFocusSystem ? (
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => onFocusSystem(quest.systemId!)}
            >
              <MapPin size={13} aria-hidden />
              {quest.systemName ?? "Карта"}
            </button>
          ) : null}
        </div>
      </header>

      <div className="quest-brief__body">
        <h2 className="quest-brief__title">{quest.title}</h2>
        <p className="quest-brief__hook">{quest.hook}</p>
        {quest.description && quest.description !== quest.hook ? (
          <div className="quest-card-face__desc">{quest.description}</div>
        ) : null}
          <div className="quest-card-face__chips">
            {quest.giverFactionName ? (
              <span className="quest-card-chip">{quest.giverFactionName}</span>
            ) : null}
            {quest.giverNpcName ? (
              <span className="quest-card-chip">{quest.giverNpcName}</span>
            ) : null}
            {quest.assignedNpcName ? (
              <QuestAssignedChip
                name={quest.assignedNpcName}
                etaTurn={quest.assignedNpcEtaTurn}
                onOpenCourt={
                  onOpenCourt
                    ? () => openCourtForNpc(quest.assignedNpcId, onOpenCourt)
                    : undefined
                }
              />
            ) : null}
            {quest.expiresTurn != null ? (
              <span className="quest-card-chip quest-card-chip--warn">
                до хода {quest.expiresTurn}
              </span>
            ) : null}
            {quest.diceCheck ? (
              <span className="quest-card-chip">
                d{quest.diceCheck.dice}
                {quest.diceCheck.dc != null
                  ? ` · DC ${quest.diceCheck.dc}`
                  : ""}
              </span>
            ) : null}
            {quest.choices?.length ? (
              <span className="quest-card-chip">
                {quest.choices.length} выбор
                {quest.choices.length === 1 ? "" : "а"}
              </span>
            ) : null}
          </div>
          {stageTotal > 0 ? (
            <div className="quest-card-face__arc">
              <div className="quest-card-face__arc-meta">
                <span>
                  Этап {stageIdx + 1} / {stageTotal}
                </span>
                <span className="hint">
                  {quest.stageLabels?.[stageIdx] ?? "—"}
                </span>
              </div>
              <div
                className="quest-card-face__arc-bar"
                role="progressbar"
                aria-valuenow={stagePct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style={{ width: `${stagePct}%` }} />
              </div>
            </div>
          ) : null}
          {quest.objectives?.length ? (
            <ul className="quest-card-face__objs" aria-label="Цели">
              {quest.objectives.map((o) => (
                <li key={o.id} className={o.done ? "is-done" : ""}>
                  {o.done ? "✓" : "○"} {o.text}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
    </article>
  );
}

export function QuestStage({
  quest,
  busy,
  chatOpen,
  compact,
  stocks,
  onChoose,
  onRollDice,
  onOpenChat,
  onFocusSystem,
  onOpenCourt,
  dicePreview,
  onDiceSettled,
}: QuestStageProps) {
  if (!quest) {
    return (
      <div className="quest-stage quest-stage--empty">
        <p className="hint">Выберите квест слева или откройте обзор хода.</p>
      </div>
    );
  }

  const choices = quest.status === "active" ? quest.choices ?? [] : [];
  const showDice =
    quest.status === "active" &&
    quest.diceCheck &&
    !choices.some((c) => c.needsDice);

  return (
    <div className={`quest-stage${compact ? " quest-stage--compact" : ""}`}>
      <Briefing
        quest={quest}
        chatOpen={chatOpen}
        compact={compact}
        onOpenChat={onOpenChat}
        onFocusSystem={onFocusSystem}
        onOpenCourt={onOpenCourt}
      />

      <div className="quest-stage__interact">
        {choices.length > 0 ? (
          <ChoiceFan
            choices={choices}
            busy={busy}
            stocks={stocks}
            onChoose={(id) => void onChoose(id)}
          />
        ) : null}

        {showDice ? (
          <div className="quest-stage__dice">
            {dicePreview ? (
              <QuestDiceRoller
                value={dicePreview.value}
                rolling={dicePreview.rolling}
                sides={quest.diceCheck?.dice ?? 6}
                label={
                  quest.diceCheck?.dc != null
                    ? `Сложность ${quest.diceCheck.dc}`
                    : "Проверка"
                }
                onSettled={() => onDiceSettled?.()}
              />
            ) : (
              <StatefulButton
                className="btn primary"
                busy={busy}
                onClick={() => void onRollDice()}
              >
                🎲 Бросить кубик
              </StatefulButton>
            )}
            {dicePreview && !dicePreview.rolling && dicePreview.message ? (
              <p className="dice-result-text" data-reveal>
                {dicePreview.message}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <AnimatePresence>
        {quest.stageLabels && quest.stageLabels.length > 1 ? (
          <motion.ol
            className="quest-arc-stages"
            aria-label="Этапы арки"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {quest.stageLabels.map((label, i) => (
              <li
                key={`${label}-${i}`}
                className={
                  i === (quest.stage ?? 0)
                    ? "is-current"
                    : i < (quest.stage ?? 0)
                      ? "is-done"
                      : ""
                }
              >
                <strong>{label}</strong>
              </li>
            ))}
          </motion.ol>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
