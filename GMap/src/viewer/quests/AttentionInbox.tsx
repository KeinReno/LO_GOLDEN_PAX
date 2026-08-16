import { BookOpen, Dices, MapPin, Users } from "lucide-react";
import { StatefulButton } from "../../ui/StatefulButton";
import type { NpcTaskView, Quest } from "./types";
import { QUEST_KIND_META, QUEST_STATUS_LABEL } from "./types";

export type AttentionInboxProps = {
  quests: Quest[];
  npcTasks: NpcTaskView[];
  turn: number;
  perTurnRolled: boolean;
  perTurnBusy?: boolean;
  onRollPerTurn: () => void;
  onSelectQuest: (id: string) => void;
  onOpenCourt: () => void;
  onOpenJournal: (id: string) => void;
  onFocusSystem?: (systemId: string) => void;
};

export type AttentionReason =
  | "choice"
  | "dice"
  | "offered"
  | "expires"
  | "dropped";

export type AttentionItem = {
  quest: Quest;
  reason: AttentionReason;
  label: string;
};

function expiresSoon(q: Quest, turn: number): boolean {
  return q.expiresTurn != null && q.expiresTurn - turn <= 2;
}

/** Quests that need a player decision this turn. */
export function collectAttention(
  quests: Quest[],
  turn: number,
): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const q of quests) {
    if (q.status === "offered") {
      items.push({ quest: q, reason: "offered", label: "Новое предложение" });
      continue;
    }
    if (q.status !== "active") continue;
    const choices = q.choices?.length ?? 0;
    if (choices > 0) {
      items.push({
        quest: q,
        reason: "choice",
        label: `${choices} выбор${choices === 1 ? "" : choices < 5 ? "а" : "ов"}`,
      });
      continue;
    }
    if (q.diceCheck) {
      items.push({ quest: q, reason: "dice", label: "Нужен бросок" });
      continue;
    }
    if (expiresSoon(q, turn)) {
      items.push({
        quest: q,
        reason: "expires",
        label: `До хода ${q.expiresTurn}`,
      });
    }
  }
  const rank: Record<AttentionReason, number> = {
    choice: 0,
    dice: 1,
    offered: 2,
    expires: 3,
    dropped: 4,
  };
  return items.sort((a, b) => rank[a.reason] - rank[b.reason]);
}

type Beat = {
  questId: string;
  questTitle: string;
  text: string;
  turn: number;
  at: string;
};

/** Overview: turn dice slot + needs-attention queue + compact journal. */
export function AttentionInbox({
  quests,
  npcTasks,
  turn,
  perTurnRolled,
  perTurnBusy,
  onRollPerTurn,
  onSelectQuest,
  onOpenCourt,
  onOpenJournal,
  onFocusSystem,
}: AttentionInboxProps) {
  const attention = collectAttention(quests, turn);
  const courtReady = npcTasks.filter((t) => t.status === "done").length;
  const courtWorking = npcTasks.filter((t) => t.status === "working").length;

  const beats: Beat[] = quests
    .flatMap((q) =>
      (q.log ?? []).map((e) => ({
        questId: q.id,
        questTitle: q.title,
        text: e.text,
        turn: e.turn,
        at: e.timestamp,
      })),
    )
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 5);

  return (
    <section className="quest-inbox" aria-label="Требует внимания">
      {!perTurnRolled ? (
        <div className="quest-inbox__turn-slot">
          <div className="quest-inbox__turn-copy">
            <p className="dossier-kicker">Ход {turn} начался</p>
            <h3>Ежеходный кубик</h3>
            <p className="hint">
              1d6 → столько событий упадёт в этот ход. Без броска очередь
              ежеходных пуста.
            </p>
          </div>
          <StatefulButton
            className="btn primary"
            busy={perTurnBusy}
            onClick={onRollPerTurn}
          >
            <Dices size={16} aria-hidden /> Бросить
          </StatefulButton>
        </div>
      ) : null}

      <header className="quest-inbox__head">
        <div>
          <h3>Требует внимания</h3>
          <p className="hint">
            {attention.length
              ? `${attention.length} решени${attention.length === 1 ? "е" : attention.length < 5 ? "я" : "й"} на этом ходу`
              : perTurnRolled
                ? "Нет срочных решений — выберите квест слева"
                : "Сначала бросьте ежеходный кубик"}
          </p>
        </div>
        <button
          type="button"
          className="btn ghost sm quest-inbox__court-link"
          onClick={onOpenCourt}
        >
          <Users size={13} aria-hidden />
          Двор
          {courtReady + courtWorking > 0 ? (
            <span className="quest-group-count">
              {courtReady > 0 ? courtReady : courtWorking}
            </span>
          ) : null}
        </button>
      </header>

      {attention.length > 0 ? (
        <ul className="quest-inbox__list">
          {attention.map(({ quest, reason, label }) => {
            const meta = QUEST_KIND_META[quest.kind];
            return (
              <li key={quest.id} className="quest-inbox__item">
                <button
                  type="button"
                  className={`quest-inbox__row quest-inbox__row--${reason}`}
                  onClick={() => onSelectQuest(quest.id)}
                >
                  <span
                    className={`quest-status-dot quest-status-dot--${quest.status}`}
                    title={QUEST_STATUS_LABEL[quest.status]}
                    aria-hidden
                  />
                  <span className="quest-inbox__row-body">
                    <span className="quest-inbox__row-title">
                      {quest.secret ? "🔒 " : ""}
                      {quest.title}
                    </span>
                    <span className="hint">
                      {meta.label}
                      {quest.giverFactionName
                        ? ` · ${quest.giverFactionName}`
                        : quest.giverNpcName
                          ? ` · ${quest.giverNpcName}`
                          : ""}
                    </span>
                  </span>
                  <span className="quest-inbox__row-action">{label}</span>
                </button>
                {quest.systemId && onFocusSystem ? (
                  <button
                    type="button"
                    className="quest-inbox__map"
                    title="На карте"
                    onClick={() => onFocusSystem(quest.systemId!)}
                  >
                    <MapPin size={13} aria-hidden />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="quest-inbox__empty">
          <p className="hint">
            Очередь пуста. Можно открыть любой квест слева или заглянуть во
            двор.
          </p>
        </div>
      )}

      {beats.length > 0 ? (
        <details className="quest-inbox__journal">
          <summary>
            <BookOpen size={13} aria-hidden />
            Последние события
            <span className="hint">{beats.length}</span>
          </summary>
          <ol className="quest-inbox__beats">
            {beats.map((b, i) => (
              <li key={`${b.questId}-${b.at}-${i}`}>
                <button type="button" onClick={() => onOpenJournal(b.questId)}>
                  <span className="quest-inbox__beat-turn">ход {b.turn}</span>
                  <span className="quest-inbox__beat-text">{b.text}</span>
                  <span className="hint">{b.questTitle}</span>
                </button>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
}
