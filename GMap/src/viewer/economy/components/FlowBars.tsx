import type { CSSProperties } from "react";
import type { FlowBarRow } from "../chartData";

type Props = {
  rows: FlowBarRow[];
  onSelectCategory?: (letter: string) => void;
};

export function FlowBars({ rows, onSelectCategory }: Props) {
  const max = Math.max(
    1,
    ...rows.flatMap((r) => [r.production, r.consumption]),
  );

  return (
    <div className="eco-chart-block">
      <header className="eco-chart-block__head">
        <h4>A–F · произв. / потребл.</h4>
      </header>
      <ul className="eco-flow-bars" aria-label="Потоки категорий">
        {rows.map((r) => {
          const prodPct = Math.round((r.production / max) * 100);
          const consPct = Math.round((r.consumption / max) * 100);
          return (
            <li key={r.letter}>
              <button
                type="button"
                className="eco-flow-bars__row"
                style={{ "--eco-bar-color": r.color } as CSSProperties}
                onClick={() => onSelectCategory?.(r.letter)}
                title={`${r.name}: +${r.production} / −${r.consumption}`}
              >
                <span className="eco-flow-bars__letter">{r.letter}</span>
                <span className="eco-flow-bars__tracks">
                  <span
                    className="eco-flow-bars__bar eco-flow-bars__bar--prod"
                    style={{ width: `${prodPct}%` }}
                  />
                  <span
                    className="eco-flow-bars__bar eco-flow-bars__bar--cons"
                    style={{ width: `${consPct}%` }}
                  />
                </span>
                <span
                  className={`eco-flow-bars__net tabular-nums ${
                    r.net > 0 ? "is-up" : r.net < 0 ? "is-down" : ""
                  }`}
                >
                  {r.net > 0 ? `+${r.net}` : r.net}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="eco-flow-bars__legend hint">
        <span className="eco-flow-bars__legend-prod">производство</span>
        <span className="eco-flow-bars__legend-cons">потребление</span>
      </div>
    </div>
  );
}
