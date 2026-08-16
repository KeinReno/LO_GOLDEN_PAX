import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { fmtInt } from "../../../state/numberFormat";
import type { ExpenseSlice, LedgerRow } from "../chartData";
import { currencyShortLabel, rowsForReason } from "../chartData";

type Props = {
  slices: ExpenseSlice[];
  recent: LedgerRow[];
  title?: string;
  /** When set, sector/legend click also notifies parent (e.g. journal filter). */
  onSelectReason?: (reason: string | null) => void;
};

function Tip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; payload?: ExpenseSlice }[];
}) {
  if (!active || !payload?.[0]) return null;
  const p = payload[0];
  return (
    <div className="eco-chart-tip">
      <strong>{p.name}</strong>
      <div>−{fmtInt(p.value ?? 0)}</div>
    </div>
  );
}

export function ExpenseDonut({
  slices,
  recent,
  title = "Расходы по статьям",
  onSelectReason,
}: Props) {
  const [activeReason, setActiveReason] = useState<string | null>(null);
  const pickReason = (reason: string | null) => {
    setActiveReason(reason);
    onSelectReason?.(reason);
  };
  const sliceTurn = slices[0]?.turn ?? null;
  const detail = useMemo(
    () =>
      activeReason
        ? rowsForReason(recent, activeReason, { turn: sliceTurn })
        : [],
    [activeReason, recent, sliceTurn],
  );

  if (slices.length === 0) {
    return (
      <div className="eco-chart-block">
        <header className="eco-chart-block__head">
          <h4>{title}</h4>
        </header>
        <p className="hint">Нет расходов в журнале.</p>
      </div>
    );
  }

  return (
    <div className="eco-chart-block">
      <header className="eco-chart-block__head">
        <h4>{title}</h4>
        {activeReason && (
          <button
            type="button"
            className="btn sm ghost"
            onClick={() => pickReason(null)}
          >
            Сбросить
          </button>
        )}
      </header>
      <div className="eco-donut-row">
        <div className="eco-donut-chart">
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={slices}
                dataKey="amount"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={42}
                outerRadius={68}
                paddingAngle={2}
                isAnimationActive={false}
                onClick={(_, idx) => {
                  const s = slices[idx as number];
                  if (s) {
                    pickReason(activeReason === s.reason ? null : s.reason);
                  }
                }}
                style={{ cursor: "pointer" }}
              >
                {slices.map((s) => (
                  <Cell
                    key={s.reason}
                    fill={s.fill}
                    opacity={
                      activeReason && activeReason !== s.reason ? 0.35 : 1
                    }
                    stroke="transparent"
                  />
                ))}
              </Pie>
              <Tooltip content={<Tip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="eco-donut-legend">
          {slices.map((s) => (
            <li key={s.reason}>
              <button
                type="button"
                className={`eco-donut-legend__btn ${
                  activeReason === s.reason ? "is-active" : ""
                }`}
                onClick={() =>
                  pickReason(activeReason === s.reason ? null : s.reason)
                }
              >
                <span
                  className="eco-donut-swatch"
                  style={{ background: s.fill }}
                />
                <span className="eco-donut-legend__label">{s.label}</span>
                <span className="tabular-nums">−{fmtInt(s.amount)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {activeReason && (
        <ul className="eco-donut-detail" aria-label="Траты статьи">
          {detail.length === 0 ? (
            <li className="hint">Нет строк.</li>
          ) : (
            detail.slice(0, 12).map((r, i) => (
              <li key={`${r.intentId ?? r.reason}-${i}`}>
                <span className="hint">
                  ход {r.turn ?? "—"} · {currencyShortLabel(r.currencyId)}
                </span>
                <strong className="tabular-nums is-down">
                  {r.delta > 0 ? `+${fmtInt(r.delta)}` : fmtInt(r.delta)}
                </strong>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
