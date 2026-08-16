import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { Quest as WorldQuest, WorldState } from "../state/types";
import { StatefulButton } from "../ui/StatefulButton";
import { DiceRoller } from "../ui/DiceRoller";
import { adaptQuest, canAffordCosts } from "./quests/adaptQuest";
import {
  openCourtForNpc,
  QuestAssignedChip,
  QuestChoiceResolveBoard,
  QuestDossierView,
  QuestObjectiveList,
} from "./quests/QuestDossierView";
import type { QuestLogEntry } from "./quests/types";
import { QUEST_KIND_META } from "./quests/types";

const LOG_AUTHOR_LABEL: Record<QuestLogEntry["author"], string> = {
  player: "Игрок",
  gm: "GM",
  npc: "NPC",
  system: "Система",
};

type QuestDossierProps = {
  quest: WorldQuest;
  world: WorldState;
  stocks?: Record<string, number>;
  onClose: () => void;
  onFocusSystem?: (systemId: string) => void;
  onOpenCourt?: () => void;
  onResolveChoice?: (questId: string, choiceId: string) => Promise<boolean>;
  onResolveDice?: (
    questId: string,
    specIndex: number,
    choiceId?: string,
  ) => Promise<{
    ok: boolean;
    rolls?: number[];
    success?: boolean | null;
    message?: string;
  }>;
};

/** Quest detail with history timeline, choice cards, and dice. */
export function QuestDossier({
  quest,
  world,
  stocks,
  onClose,
  onFocusSystem,
  onOpenCourt,
  onResolveChoice,
  onResolveDice,
}: QuestDossierProps) {
  const adapted = useMemo(() => adaptQuest(quest, world), [quest, world]);
  const interactive = adapted.status === "active";
  const choices = interactive ? adapted.choices ?? [] : [];
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
  const log = adapted.log ?? [];

  const dropChoice = async (choiceId: string) => {
    if (!interactive || !onResolveChoice) return;
    const choice = choices.find((c) => c.id === choiceId);
    if (!choice || !canAffordCosts(choice.costs, stocks)) return;
    if (choice.needsDice) {
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
      adapted.diceCheck?.specIndex ?? 0,
      pendingDiceChoice ?? undefined,
    );
    setBusy(false);
    if (!res.ok) return;
    const value = res.rolls?.[0] ?? 1;
    const sides = adapted.diceCheck?.dice ?? (value > 6 ? 20 : 6);
    setDiceResult({ value, rolling: true, message: res.message, sides });
  };

  return (
    <QuestDossierView
      kicker={QUEST_KIND_META[adapted.kind].label}
      title={adapted.title}
      status={adapted.status}
      systemName={adapted.systemName}
      expiresTurn={adapted.expiresTurn}
      onClose={onClose}
      wide
      panelClassName="quest-dossier"
      bodyClassName="quest-dossier-body"
    >
      <p className="quest-summary">{adapted.hook}</p>
      {(adapted.giverFactionName ||
        adapted.giverNpcName ||
        adapted.assignedNpcName) && (
        <div className="quest-card-face__chips">
          {adapted.giverFactionName ? (
            <span className="quest-card-chip">{adapted.giverFactionName}</span>
          ) : null}
          {adapted.giverNpcName ? (
            <span className="quest-card-chip">{adapted.giverNpcName}</span>
          ) : null}
          {adapted.assignedNpcName ? (
            <QuestAssignedChip
              name={adapted.assignedNpcName}
              etaTurn={adapted.assignedNpcEtaTurn}
              onOpenCourt={
                onOpenCourt
                  ? () => openCourtForNpc(adapted.assignedNpcId, onOpenCourt)
                  : undefined
              }
            />
          ) : null}
        </div>
      )}
      {adapted.description && adapted.description !== adapted.hook ? (
        <div className="quest-detail">
          {adapted.description.split("\n").map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      ) : null}

      {adapted.stageLabels?.length ? (
        <ol className="quest-arc-stages" aria-label="Арка">
          {adapted.stageLabels.map((label, i) => (
            <li
              key={`${label}-${i}`}
              className={
                i === (adapted.stage ?? 0)
                  ? "is-current"
                  : i < (adapted.stage ?? 0)
                    ? "is-done"
                    : ""
              }
            >
              <strong>{label}</strong>
            </li>
          ))}
        </ol>
      ) : adapted.objectives?.length ? (
        <QuestObjectiveList objectives={adapted.objectives} />
      ) : null}

      <section className="quest-history-block">
        <h3>История</h3>
        {log.length === 0 ? (
          <p className="hint">Пока нет записей.</p>
        ) : (
          <ol className="quest-timeline" aria-label="История квеста">
            {log.map((h, i) => (
              <li
                key={h.id}
                className={i === log.length - 1 ? "is-current" : "is-done"}
              >
                <span className="quest-timeline-dot" aria-hidden />
                <div>
                  <strong>
                    {h.authorName ?? LOG_AUTHOR_LABEL[h.author]}
                  </strong>
                  <p className="quest-summary">{h.text}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {interactive && choices.length > 0 ? (
        <QuestChoiceResolveBoard
          choices={choices}
          stocks={stocks}
          busy={busy}
          onChoose={(id) => void dropChoice(id)}
        />
      ) : null}

      {(pendingDiceChoice || adapted.diceCheck) && interactive ? (
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
                {diceResult.message && !diceResult.rolling ? (
                  <p className="dice-result-text" data-reveal>
                    {diceResult.message}
                  </p>
                ) : null}
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
      ) : null}

      {adapted.systemId && onFocusSystem ? (
        <div className="btn-col">
          <button
            type="button"
            className="btn primary"
            onClick={() => onFocusSystem(adapted.systemId!)}
          >
            На карте к системе
          </button>
        </div>
      ) : null}
    </QuestDossierView>
  );
}
