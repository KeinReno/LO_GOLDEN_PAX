import type { CSSProperties } from "react";
import { categoryLetterCaption } from "../../state/economyLabels";
import {
  ECO_CATEGORY_COLORS,
} from "../economyFlowTypes";
import type { SystemFlowRow } from "./types";

type Props = {
  rows: SystemFlowRow[];
  highlightCategory?: string | null;
  onCategoryClick?: (letter: string) => void;
};

export function SystemFlows({
  rows,
  highlightCategory,
  onCategoryClick,
}: Props) {
  const alerts = rows.filter((r) => r.warn);

  return (
    <section className="sys-flows" aria-label="Вклад системы в экономику">
      <header className="sys-flows__head">
        <strong>Вклад в потоки по категориям</strong>
        <span className="hint">здания в системе</span>
      </header>

      {alerts.length > 0 && (
        <ul className="sys-flows__alerts">
          {alerts.map((a) => (
            <li
              key={a.letter}
              className="sys-flows__alert fx-glow"
              style={
                {
                  ["--fx-glow-color" as string]:
                    ECO_CATEGORY_COLORS[a.letter] ?? "var(--signal-warning)",
                } as CSSProperties
              }
            >
              <strong>
                Дефицит {a.letter} ({a.name})
              </strong>
              <em>
                Постройте производство {a.letter} на планете этой системы
              </em>
              {onCategoryClick ? (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => onCategoryClick(a.letter)}
                >
                  Подсветить
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <ul className="sys-flows__list">
        {rows.map((row) => {
          const hot = highlightCategory === row.letter;
          return (
            <li
              key={row.letter}
              className={`sys-flows__row${hot ? " is-hot" : ""}${row.warn ? " is-warn" : ""}`}
            >
              <button
                type="button"
                className="sys-flows__btn"
                disabled={!onCategoryClick}
                onClick={() => onCategoryClick?.(row.letter)}
                style={{ color: ECO_CATEGORY_COLORS[row.letter] }}
                title={categoryLetterCaption(row.letter)}
              >
                <span className="tabular">{row.letter}</span>
                <span>{row.name}</span>
                <strong className="tabular">
                  {row.net > 0 ? `×${row.net}` : "—"}
                </strong>
              </button>
              {row.sources.length > 0 && (
                <span className="hint sys-flows__src" title={row.sources.join(" · ")}>
                  {row.sources[0]}
                  {row.sources.length > 1
                    ? ` +${row.sources.length - 1}`
                    : ""}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
