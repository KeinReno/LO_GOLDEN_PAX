import { BookOpen, Dices, MapPin, Users } from "lucide-react";
import { StatefulButton } from "../../ui/StatefulButton";
import type { NpcTaskView, Quest } from "./types";
import { QUEST_KIND_META, QUEST_STATUS_LABEL } from "./types";
import {
  collectAttention,
  workingQuests,
  type AttentionItem,
  type AttentionReason,
} from "./questAttention";

export type { AttentionItem, AttentionReason };
export { collectAttention };

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
  /** Desktop already has a Court tab in the room header. */
  showCourtLink?: boolean;
  /** Mobile has no journal rail — keep the working list. Desktop must not. */
  showWorkingList?: boolean;
};

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
  showCourtLink = true,
  showWorkingList = true,
}: AttentionInboxProps) {
  const attention = collectAttention(quests, turn);
  const working = workingQuests(quests, attention);
  const done = quests.filter(
    (q) => q.status === "completed" || q.status === "failed",
  );
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
        <div
          className={`quest-inbox__hero${attention.length ? " is-aside" : ""}`}
        >
          <div
            className={`quest-inbox__turn-slot${attention.length ? " is-aside" : ""}`}
          >
            <div className="quest-inbox__turn-copy">
              <p className="dossier-kicker">Ход {turn} начался</p>
              <h3>Кубик хода</h3>
              <p className="hint">
                Сколько событий в этот ход. Горячие выборы ниже уже можно брать.
              </p>
            </div>
            <StatefulButton
              className={attention.length ? "btn ghost" : "btn primary"}
              busy={perTurnBusy}
              onClick={onRollPerTurn}
            >
              <Dices size={16} aria-hidden /> Бросить
            </StatefulButton>
          </div>
        </div>
      ) : null}

      {attention.length > 0 ? (
        <>
          <header className="quest-inbox__head">
            <div>
              <h3>Требует внимания</h3>
              <p className="hint">
                {attention.length === 1
                  ? "1 решение на этом ходу"
                  : `${attention.length} решени${attention.length < 5 ? "я" : "й"} на этом ходу`}
              </p>
            </div>
            {showCourtLink ? (
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
            ) : null}
          </header>
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
                      aria-label={`На карте: ${quest.title}`}
                      onClick={() => onFocusSystem(quest.systemId!)}
                    >
                      <MapPin size={13} aria-hidden />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : perTurnRolled ? (
        <div className="quest-inbox__empty">
          <p className="hint">
            {showWorkingList
              ? "Срочных решений нет."
              : "В этот ход решать нечего. Открытые квесты — в журнале слева."}
          </p>
        </div>
      ) : null}

      {showWorkingList && working.length > 0 ? (
        <section className="quest-inbox__working" aria-label="В работе">
          <h3>В работе</h3>
          <ul className="quest-inbox__list">
            {working.map((quest) => {
              const meta = QUEST_KIND_META[quest.kind];
              return (
                <li key={quest.id} className="quest-inbox__item">
                  <button
                    type="button"
                    className="quest-inbox__row"
                    onClick={() => onSelectQuest(quest.id)}
                  >
                    <span
                      className={`quest-status-dot quest-status-dot--${quest.status}`}
                      title={QUEST_STATUS_LABEL[quest.status]}
                      aria-hidden
                    />
                    <span className="quest-inbox__row-body">
                      <span className="quest-inbox__row-title">{quest.title}</span>
                      <span className="hint">{meta.label}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {done.length > 0 || beats.length > 0 ? (
        <div className="quest-inbox__shelf">
          {done.length > 0 ? (
            <details className="quest-inbox__journal">
              <summary>
                Завершённые
                <span className="hint">{done.length}</span>
              </summary>
              <ul className="quest-inbox__list">
                {done.map((quest) => (
                  <li key={quest.id} className="quest-inbox__item">
                    <button
                      type="button"
                      className="quest-inbox__row"
                      onClick={() => onSelectQuest(quest.id)}
                    >
                      <span
                        className={`quest-status-dot quest-status-dot--${quest.status}`}
                        aria-hidden
                      />
                      <span className="quest-inbox__row-body">
                        <span className="quest-inbox__row-title">{quest.title}</span>
                        <span className="hint">
                          {QUEST_STATUS_LABEL[quest.status]}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

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
        </div>
      ) : null}
    </section>
  );
}
