import { useMemo, useState } from "react";
import { useDrag } from "@use-gesture/react";
import type { ViewerPayload } from "../../state/types";
import { computeMetrics } from "./economyMath";
import {
  buildExpenseSlices,
  currencyShortLabel,
  groupRecentByTurn,
  reasonLabel,
} from "./chartData";
import { MetricCard } from "./components/MetricCard";
import { ExpenseDonut } from "./components/ExpenseDonut";
import { EmptyState } from "./components/EmptyState";

type Filter = "all" | "income" | "expense";

type Props = {
  payload: ViewerPayload;
};

export function BudgetSection({ payload }: Props) {
  const eco = payload.economy;
  const [filter, setFilter] = useState<Filter>("all");
  const [turnIndex, setTurnIndex] = useState(0);

  const metrics = useMemo(
    () => (eco ? computeMetrics(eco) : null),
    [eco],
  );
  const groups = useMemo(
    () => groupRecentByTurn(eco?.recent ?? [], filter),
    [eco?.recent, filter],
  );
  const slices = useMemo(
    () => (eco ? buildExpenseSlices(eco) : []),
    [eco],
  );
  const explain = eco?.explain;

  const safeIndex = Math.min(turnIndex, Math.max(0, groups.length - 1));
  const activeGroup = groups[safeIndex] ?? null;

  const bindSwipe = useDrag(
    ({ last, movement: [mx], direction: [dx] }) => {
      if (!last) return;
      if (Math.abs(mx) < 40) return;
      if (dx < 0) {
        setTurnIndex((i) => Math.min(i + 1, Math.max(0, groups.length - 1)));
      } else {
        setTurnIndex((i) => Math.max(i - 1, 0));
      }
    },
    { axis: "x", filterTaps: true, pointer: { touch: true } },
  );

  if (!eco || !metrics) {
    return (
      <EmptyState
        title="Бюджет ещё пуст"
        body="После экономического тика здесь будет журнал и разбивка расходов."
      />
    );
  }

  return (
    <div className="eco-budget">
      <div className="eco-metrics-row" aria-label="Сводка бюджета">
        <MetricCard label="Доходы" value={metrics.income} tone="income" />
        <MetricCard label="Расходы" value={metrics.expense} tone="expense" />
        <MetricCard
          label="Баланс"
          value={metrics.balance}
          tone={metrics.balance >= 0 ? "income" : "expense"}
        />
      </div>

      <div className="eco-budget-filters" role="tablist" aria-label="Фильтр">
        {(
          [
            ["all", "Все"],
            ["income", "Доходы"],
            ["expense", "Расходы"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filter === id}
            className={`eco-budget-filter ${filter === id ? "is-active" : ""}`}
            onClick={() => {
              setFilter(id);
              setTurnIndex(0);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="eco-budget-grid">
        <div
          className="eco-timeline"
          {...bindSwipe()}
          aria-label="Журнал по ходам"
        >
          <header className="eco-chart-block__head">
            <h4>Журнал</h4>
            <div className="eco-timeline__nav">
              <button
                type="button"
                className="btn sm ghost"
                disabled={safeIndex <= 0}
                onClick={() => setTurnIndex((i) => Math.max(0, i - 1))}
                aria-label="Более новый ход"
              >
                ←
              </button>
              <span className="tabular-nums hint">
                {activeGroup
                  ? `ход ${activeGroup.turn ?? "—"}`
                  : "пусто"}
                {groups.length > 0
                  ? ` · ${safeIndex + 1}/${groups.length}`
                  : ""}
              </span>
              <button
                type="button"
                className="btn sm ghost"
                disabled={safeIndex >= groups.length - 1}
                onClick={() =>
                  setTurnIndex((i) =>
                    Math.min(i + 1, Math.max(0, groups.length - 1)),
                  )
                }
                aria-label="Более старый ход"
              >
                →
              </button>
            </div>
          </header>

          {!activeGroup ? (
            <p className="hint">Нет записей в журнале.</p>
          ) : (
            <>
              <p className="eco-timeline__summary hint">
                +{activeGroup.income} / −{activeGroup.expense}
                <span className="eco-timeline__swipe-hint"> · свайп для листания</span>
              </p>
              <ul className="eco-timeline__list">
                {activeGroup.rows.map((r, i) => (
                  <li
                    key={`${r.currencyId}-${r.reason}-${i}`}
                    className="eco-timeline__row"
                  >
                    <span className="eco-timeline__reason">
                      {reasonLabel(r.reason)}
                    </span>
                    <span className="hint">
                      {currencyShortLabel(r.currencyId)}
                    </span>
                    <strong
                      className={`tabular-nums ${
                        r.delta >= 0 ? "is-up" : "is-down"
                      }`}
                    >
                      {r.delta > 0 ? `+${r.delta}` : r.delta}
                    </strong>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <ExpenseDonut
          slices={slices}
          recent={eco.recent ?? []}
          title="Пончик расходов"
        />
      </div>

      {explain && (explain.lines?.length > 0 || explain.raceTraits?.length) && (
        <div className="eco-explain">
          <header className="eco-chart-block__head">
            <h4>Почему так</h4>
          </header>
          {explain.lines?.length > 0 && (
            <ul className="eco-explain__lines">
              {explain.lines.map((line, i) => (
                <li key={`${line.category}-${line.modifier}-${i}`}>
                  <span className="eco-explain__cat">{line.category}</span>
                  <span>{line.label}</span>
                  <strong className="tabular-nums">{line.modifier}</strong>
                </li>
              ))}
            </ul>
          )}
          {(explain.raceTraits?.length || explain.factionTraits?.length) ? (
            <ul className="eco-explain__traits hint">
              {[...(explain.raceTraits ?? []), ...(explain.factionTraits ?? [])].map(
                (t, i) => (
                  <li key={`${t.label}-${i}`}>
                    <strong>{t.label}</strong> — {t.summary}
                  </li>
                ),
              )}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}
