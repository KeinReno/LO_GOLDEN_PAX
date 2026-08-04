import type { CodexEntryModel } from "./codexData";
import { knowledgeLabel } from "./codexData";

export function CodexEntry({ entry }: { entry: CodexEntryModel }) {
  return (
    <article
      className={`codex-entry codex-entry--lv${entry.level}`}
      data-level={entry.level}
    >
      <header className="codex-entry-head">
        <h3 className="codex-entry-title">{entry.name}</h3>
        <span
          className="codex-level-pill"
          title={`Уровень знания ${entry.level}`}
        >
          {knowledgeLabel(entry.level)}
          <kbd>L{entry.level}</kbd>
        </span>
      </header>
      {entry.category && (
        <p className="codex-entry-cat">Тип: {entry.category}</p>
      )}
      <ul className="codex-entry-lines">
        {entry.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {entry.lore && <p className="codex-entry-lore">{entry.lore}</p>}
      {entry.hint && <p className="codex-entry-hint">{entry.hint}</p>}
    </article>
  );
}
