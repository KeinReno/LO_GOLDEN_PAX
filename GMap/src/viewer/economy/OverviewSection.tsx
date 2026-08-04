import { useMemo } from "react";
import type { ViewerPayload } from "../../state/types";
import type { EconomyFlowBreakdown } from "../economyFlowTypes";
import {
  buildCategorySnapshots,
  computeMetrics,
  hasAnyProduction,
} from "./economyMath";
import {
  buildExpenseSlices,
  buildFlowBars,
  buildSparkline,
  buildTreasurySeries,
} from "./chartData";
import { CategoryCard } from "./components/CategoryCard";
import { MetricCard } from "./components/MetricCard";
import { TreasuryChart } from "./components/TreasuryChart";
import { ExpenseDonut } from "./components/ExpenseDonut";
import { FlowBars } from "./components/FlowBars";
import { EmptyState } from "./components/EmptyState";

type Props = {
  payload: ViewerPayload;
  flowData?: EconomyFlowBreakdown | null;
  onOpenProduction?: (categoryLetter?: string) => void;
  onOpenPolicies?: () => void;
  onOpenBudget?: () => void;
  onFocusBuild?: () => void;
  onFocusDeficit?: (letter: string, systemId?: string) => void;
  onOpenResearch?: (hint?: string) => void;
};

export function OverviewSection({
  payload,
  flowData,
  onOpenProduction,
  onOpenPolicies,
  onOpenBudget,
  onFocusBuild,
  onFocusDeficit,
  onOpenResearch,
}: Props) {
  const eco = payload.economy;
  const metrics = useMemo(
    () => (eco ? computeMetrics(eco) : null),
    [eco],
  );
  const cats = useMemo(
    () => (eco ? buildCategorySnapshots(eco, flowData) : []),
    [eco, flowData],
  );
  const treasury = useMemo(
    () => (eco ? buildTreasurySeries(eco, 5) : null),
    [eco],
  );
  const expenseSlices = useMemo(
    () => (eco ? buildExpenseSlices(eco) : []),
    [eco],
  );
  const flowBars = useMemo(() => buildFlowBars(flowData), [flowData]);
  const sparks = useMemo(() => {
    if (!eco) return {} as Record<string, number[]>;
    const out: Record<string, number[]> = {};
    for (const c of cats) {
      out[c.id] = buildSparkline(eco, c.id);
    }
    return out;
  }, [eco, cats]);

  if (!eco || !metrics) {
    return (
      <EmptyState
        title="Нет данных экономики"
        body="Войдите заново или дождитесь тика — казна появится здесь."
      />
    );
  }

  const producing = hasAnyProduction(payload, flowData);
  const pressure = eco.pressure ?? 0;
  const warnings: { text: string; action?: () => void; actionLabel?: string }[] =
    [];

  for (const c of cats) {
    if (c.status === "deficit") {
      warnings.push({
        text:
          c.bottleneckDeficit > 0
            ? `Дефицит ${c.name}: узкое место −${c.bottleneckDeficit}`
            : `Дефицит ${c.name}: запас ${c.stock}${
                c.net != null ? `, ${c.net}/ход` : ""
              }`,
        action: () =>
          onFocusDeficit
            ? onFocusDeficit(c.letter)
            : onOpenProduction?.(c.letter),
        actionLabel: onFocusDeficit ? "К системе" : "Решить",
      });
    }
  }
  if (treasury?.zeroTurn != null) {
    warnings.unshift({
      text: `При текущем темпе казна уйдёт в ноль на ходу ${treasury.zeroTurn}.`,
      action: () => onOpenBudget?.(),
      actionLabel: "Бюджет",
    });
  }
  if (pressure >= 3) {
    warnings.push({
      text: `Высокое давление экономики: ${pressure}`,
      action: () => onOpenPolicies?.(),
      actionLabel: "Политики",
    });
  }
  const fCat = cats.find((c) => c.letter === "F");
  if (fCat?.status === "deficit" && onOpenResearch) {
    warnings.push({
      text: "Нехватка Знания (F) — нужна наука или добыча cognitio",
      action: () => onOpenResearch("cognitio"),
      actionLabel: "Наука",
    });
  }

  if (!producing) {
    return (
      <div className="eco-overview">
        <div className="eco-metrics-row">
          <MetricCard
            label="Казна"
            value={metrics.treasury}
            tone="gold"
            tip="Металл в казне фракции"
          />
          <MetricCard
            label="Доход/ход"
            value={metrics.income}
            tone="income"
            tip="Сумма положительных проводок по металлу"
          />
          <MetricCard
            label="Расход/ход"
            value={metrics.expense}
            tone="expense"
            tip="Сумма списаний по металлу"
          />
        </div>
        <EmptyState
          title="Производство ещё не запущено"
          body="Постройте первую шахту, чтобы запустить поток A–F."
          action={
            onFocusBuild ? (
              <button
                type="button"
                className="btn sm primary"
                onClick={onFocusBuild}
              >
                К системе
              </button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="eco-overview">
      <div className="eco-metrics-row" aria-label="Ключевые метрики">
        <MetricCard
          label="Казна"
          value={metrics.treasury}
          tone="gold"
          hint="металл"
          tip="Металл в казне · клик по категориям ниже — к производству"
        />
        <MetricCard
          label="Доход/ход"
          value={metrics.income}
          tone="income"
          tip="Сумма положительных проводок по металлу в журнале"
        />
        <MetricCard
          label="Расход/ход"
          value={metrics.expense}
          tone="expense"
          tip="Сумма списаний по металлу в журнале"
        />
      </div>

      <div className="eco-bento" aria-label="Категории A–F">
        {cats.map((c) => (
          <CategoryCard
            key={c.id}
            cat={c}
            sparkValues={sparks[c.id]}
            onSelect={(letter) => onOpenProduction?.(letter)}
          />
        ))}
      </div>

      {warnings.length > 0 && (
        <ul className="eco-warnings" aria-label="Предупреждения">
          {warnings.map((w, i) => (
            <li key={`${w.text}-${i}`} className="eco-warning-row">
              <span>{w.text}</span>
              {w.action && w.actionLabel && (
                <button
                  type="button"
                  className="btn sm ghost"
                  onClick={w.action}
                >
                  {w.actionLabel}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="eco-charts-grid">
        {treasury && (
          <TreasuryChart
            points={treasury.points}
            zeroTurn={treasury.zeroTurn}
            avgNet={treasury.avgNet}
          />
        )}
        <ExpenseDonut slices={expenseSlices} recent={eco.recent ?? []} />
        <FlowBars rows={flowBars} onSelectCategory={onOpenProduction} />
      </div>
    </div>
  );
}
