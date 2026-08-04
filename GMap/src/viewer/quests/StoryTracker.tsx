import { BookOpen, MapPin, Target } from "lucide-react";
import type { Quest } from "./types";
import { QUEST_KIND_META, QUEST_STATUS_LABEL } from "./types";

export type StoryTrackerProps = {
  quests: Quest[];
  activeQuestId: string | null;
  onSelect: (id: string) => void;
  onOpenJournal: (id: string) => void;
  onFocusSystem?: (systemId: string) => void;
};

type StoryBeat = {
  questId: string;
  questTitle: string;
  text: string;
  turn: number;
  at: string;
};

/** Compact campaign tracker derived from main/narrative quests + logs. */
export function StoryTracker({
  quests,
  activeQuestId,
  onSelect,
  onOpenJournal,
  onFocusSystem,
}: StoryTrackerProps) {
  const story = quests.filter(
    (q) => q.kind === "main" || q.narrative || Boolean(q.stageCount),
  );
  const active = story.filter((q) => q.status === "active");
  const focus = active.find((q) => q.id === activeQuestId) ?? active[0] ?? null;

  const doneGoals = story.flatMap((q) =>
    (q.objectives ?? [])
      .filter((o) => o.done)
      .map((o) => ({ questId: q.id, questTitle: q.title, text: o.text })),
  );
  const openGoals = story.flatMap((q) =>
    (q.objectives ?? [])
      .filter((o) => !o.done)
      .map((o) => ({
        questId: q.id,
        questTitle: q.title,
        text: o.text,
        systemId: q.systemId,
        systemName: q.systemName,
      })),
  );

  const beats: StoryBeat[] = story
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
    .slice(0, 6);

  if (story.length === 0) {
    return (
      <section className="story-tracker story-tracker--empty" aria-label="Сюжет">
        <header className="story-tracker__head">
          <BookOpen size={16} aria-hidden />
          <h3>Сюжет</h3>
        </header>
        <p className="hint">
          Пока нет сюжетных арок. Основной сюжет и журналы появятся здесь, когда
          мастер выдаст квест с аркой или записью в истории.
        </p>
      </section>
    );
  }

  return (
    <section className="story-tracker" aria-label="Сюжетный трекер">
      <header className="story-tracker__head">
        <BookOpen size={16} aria-hidden />
        <div>
          <h3>Сюжет</h3>
          <p className="hint">
            {active.length
              ? `${active.length} активн. · ${openGoals.length} целей`
              : "Нет активных сюжетных нитей"}
          </p>
        </div>
      </header>

      {focus ? (
        <div className="story-tracker__now">
          <p className="dossier-kicker">
            {QUEST_KIND_META[focus.kind].icon} Сейчас
          </p>
          <button
            type="button"
            className="story-tracker__now-title"
            onClick={() => onSelect(focus.id)}
          >
            {focus.title}
          </button>
          {focus.stageCount ? (
            <p className="hint">
              Этап {(focus.stage ?? 0) + 1}/{focus.stageCount}
              {focus.stageLabels?.[focus.stage ?? 0]
                ? ` · ${focus.stageLabels[focus.stage ?? 0]}`
                : ""}
            </p>
          ) : (
            <p className="hint">{focus.hook}</p>
          )}
          <div className="story-tracker__now-actions">
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => onOpenJournal(focus.id)}
            >
              Журнал
            </button>
            {focus.systemId && onFocusSystem ? (
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => onFocusSystem(focus.systemId!)}
              >
                <MapPin size={12} aria-hidden /> На карте
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {openGoals.length > 0 ? (
        <div className="story-tracker__block">
          <h4>
            <Target size={13} aria-hidden /> Текущие цели
          </h4>
          <ul>
            {openGoals.slice(0, 5).map((g, i) => (
              <li key={`${g.questId}-${i}`}>
                <button type="button" onClick={() => onSelect(g.questId)}>
                  <strong>{g.text}</strong>
                  <span className="hint">
                    {g.questTitle}
                    {g.systemName ? ` · ${g.systemName}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {doneGoals.length > 0 ? (
        <div className="story-tracker__block story-tracker__block--done">
          <h4>Сделано</h4>
          <ul>
            {doneGoals.slice(-4).map((g, i) => (
              <li key={`done-${g.questId}-${i}`} className="hint">
                ✓ {g.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {beats.length > 0 ? (
        <div className="story-tracker__block">
          <h4>Последние события</h4>
          <ol className="story-tracker__beats">
            {beats.map((b) => (
              <li key={`${b.questId}-${b.at}`}>
                <button type="button" onClick={() => onOpenJournal(b.questId)}>
                  <span className="story-tracker__beat-turn">ход {b.turn}</span>
                  <span className="story-tracker__beat-text">{b.text}</span>
                  <span className="hint">{b.questTitle}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {story.length > 1 ? (
        <div className="story-tracker__lanes">
          {story.map((q) => (
            <button
              key={q.id}
              type="button"
              className={`story-tracker__lane ${q.id === activeQuestId ? "is-active" : ""}`}
              onClick={() => onSelect(q.id)}
            >
              <span
                className={`quest-status-dot quest-status-dot--${q.status}`}
                title={QUEST_STATUS_LABEL[q.status]}
              />
              <span>{q.title}</span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
