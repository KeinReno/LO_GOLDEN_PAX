import { useMemo, useState } from "react";
import type { KnowledgeLevel, ViewerPayload } from "../../state/types";
import {
  buildCodexEntries,
  knowledgeLabel,
  type CodexSection,
} from "./codexData";
import { CodexEntry } from "./CodexEntry";

const SECTIONS: { id: CodexSection; label: string }[] = [
  { id: "races", label: "Расы" },
  { id: "factions", label: "Государства" },
  { id: "buildings", label: "Постройки" },
  { id: "units", label: "Юниты" },
  { id: "techs", label: "Технологии" },
  { id: "history", label: "Журнал" },
];

const LEVEL_FILTERS: { id: KnowledgeLevel | "all"; label: string }[] = [
  { id: "all", label: "Все" },
  { id: 1, label: "≥1" },
  { id: 2, label: "≥2" },
  { id: 3, label: "≥3" },
  { id: 4, label: "4" },
];

export function CodexPanel({ payload }: { payload: ViewerPayload }) {
  const [section, setSection] = useState<CodexSection>("factions");
  const [query, setQuery] = useState("");
  const [minLevel, setMinLevel] = useState<KnowledgeLevel | "all">("all");

  const entries = useMemo(() => {
    if (section === "history") return [];
    return buildCodexEntries(
      payload,
      section,
      query,
      minLevel === "all" ? 1 : minLevel,
    );
  }, [payload, section, query, minLevel]);

  const history = useMemo(() => {
    const list = payload.intel?.intelHistory ?? [];
    const q = query.trim().toLowerCase();
    return [...list]
      .reverse()
      .filter((h) => {
        if (!q) return true;
        return (
          h.entityId.toLowerCase().includes(q) ||
          String(h.source).toLowerCase().includes(q)
        );
      })
      .slice(0, 60);
  }, [payload.intel?.intelHistory, query]);

  return (
    <div className="codex-panel">
      <div className="codex-toolbar">
        <div className="codex-tabs" role="tablist" aria-label="Разделы справочника">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={section === s.id}
              className={`codex-tab ${section === s.id ? "is-active" : ""}`}
              onClick={() => setSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="codex-filters">
          <label className="codex-search">
            <span className="sr-only">Поиск</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по имени…"
            />
          </label>
          {section !== "history" && (
            <div className="codex-level-filters" role="group" aria-label="Фильтр уровня">
              {LEVEL_FILTERS.map((f) => (
                <button
                  key={String(f.id)}
                  type="button"
                  className={`codex-chip ${minLevel === f.id ? "is-active" : ""}`}
                  onClick={() => setMinLevel(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {section === "history" ? (
        <div className="codex-history">
          {history.length === 0 ? (
            <p className="codex-empty">Журнал разведки пуст.</p>
          ) : (
            <ol className="codex-timeline">
              {history.map((h, i) => (
                <li key={`${h.entityId}-${h.turn}-${i}`}>
                  <span className="codex-timeline-turn">Ход {h.turn}</span>
                  <span className="codex-timeline-body">
                    {h.entityType} <code>{h.entityId}</code>: L{h.oldLevel}→L
                    {h.newLevel}{" "}
                    <em>({h.source})</em>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : entries.length === 0 ? (
        <p className="codex-empty">
          Нет известных записей
          {minLevel !== "all" ? ` (уровень ≥ ${minLevel})` : ""}.
          Собирайте intel флотом, дипломатией или шпионажем.
        </p>
      ) : (
        <div className="codex-grid">
          {entries.map((e) => (
            <CodexEntry key={`${e.section}-${e.id}`} entry={e} />
          ))}
        </div>
      )}

      <footer className="codex-footer">
        <span>
          Уровни: {knowledgeLabel(1)} · {knowledgeLabel(2)} · {knowledgeLabel(3)}{" "}
          · {knowledgeLabel(4)}
        </span>
      </footer>
    </div>
  );
}
