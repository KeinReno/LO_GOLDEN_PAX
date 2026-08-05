import { useMemo } from "react";
import type { ViewerPayload } from "../../state/types";
import type { EconomyFlowBreakdown } from "../economyFlowTypes";
import {
  buildCategorySnapshots,
  computeMetrics,
  hasAnyProduction,
  resolveFactionTreasuryCurrency,
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
import { fmtInt } from "../../state/numberFormat";
import { BUILD_METAL, BUILD_SUPPLY } from "../../state/economyLabels";
import { categoryNameOnly } from "./ecoCopy";
import { currencyShortLabel } from "./chartData";
import { readStockAlerts } from "./stockAlerts";

type Props = {
  payload: ViewerPayload;
  flowData?: EconomyFlowBreakdown | null;
  onOpenProduction?: (categoryLetter?: string) => void;
  onOpenPolicies?: () => void;
  onOpenBudget?: () => void;
  onFocusBuild?: () => void;
  onFocusDeficit?: (letter: string, systemId?: string) => void;
  onOpenResearch?: (hint?: string) => void;
  onConvert?: (fromCurrency: string, toCurrency: string, amountFrom: number) => void;
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
  onConvert,
}: Props) {
  const eco = payload.economy;
  const treasuryCurrencyId = useMemo(
    () => resolveFactionTreasuryCurrency(payload),
    [payload],
  );
  const treasuryHint = currencyShortLabel(treasuryCurrencyId);
  const metrics = useMemo(
    () =>
      eco
        ? computeMetrics(
            eco,
            payload.world?.meta?.turn ?? null,
            treasuryCurrencyId,
          )
        : null,
    [eco, payload.world?.meta?.turn, treasuryCurrencyId],
  );
  const cats = useMemo(
    () => (eco ? buildCategorySnapshots(eco, flowData) : []),
    [eco, flowData],
  );
  const treasury = useMemo(
    () =>
      eco
        ? buildTreasurySeries(
            eco,
            5,
            payload.world?.meta?.turn ?? null,
            treasuryCurrencyId,
          )
        : null,
    [eco, payload.world?.meta?.turn, treasuryCurrencyId],
  );
  const expenseSlices = useMemo(
    // Match metric cards: treasury peg spend (not all category currencies).
    () =>
      eco
        ? buildExpenseSlices(
            eco,
            treasuryCurrencyId,
            payload.world?.meta?.turn ?? null,
          )
        : [],
    [eco, payload.world?.meta?.turn, treasuryCurrencyId],
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
  const warnings: { 
    text: string; 
    action?: () => void; 
    actionLabel?: string;
    actionSecondary?: () => void;
    actionSecondaryLabel?: string;
  }[] = [];

  for (const c of cats) {
    if (c.status === "deficit") {
      const metalStock = eco.stocks?.[BUILD_METAL.id] ?? 0;
      const canBuy = metalStock >= 5; // Assumed minimum
      
      warnings.push({
        text:
          c.bottleneckDeficit > 0
            ? `Дефицит ${c.name}: узкое место −${fmtInt(c.bottleneckDeficit)}`
            : `Дефицит ${c.name}: запас ${fmtInt(c.stock)}${
                c.net != null ? `, ${fmtInt(c.net)}/ход` : ""
              }`,
        action: () =>
          onFocusDeficit
            ? onFocusDeficit(c.letter)
            : onOpenProduction?.(c.letter),
        actionLabel: onFocusDeficit ? "К системе" : "Решить",
        actionSecondary: canBuy && onConvert ? () => onConvert(BUILD_METAL.id, c.id, 5) : undefined,
        actionSecondaryLabel: canBuy ? "Купить на бирже (5M)" : undefined,
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
      text: `Высокое давление экономики: ${fmtInt(pressure)}`,
      action: () => onOpenPolicies?.(),
      actionLabel: "Политики",
    });
  }
  const fCat = cats.find((c) => c.letter === "F");
  if (fCat?.status === "deficit" && onOpenResearch) {
    warnings.push({
      text: `Не хватает «${categoryNameOnly("F")}» — усильте науку или добычу знания`,
      action: () => onOpenResearch("F"),
      actionLabel: "Наука",
    });
  }

  for (const currencyId of readStockAlerts()) {
    const stock = eco.stocks?.[currencyId] ?? 0;
    const cat = cats.find((c) => c.id === currencyId);
    const net = cat?.net ?? null;
    const low =
      stock <= 0 ||
      (net != null && net < 0 && stock <= Math.abs(net) * 2) ||
      (currencyId === BUILD_METAL.id && stock < 20) ||
      (currencyId === treasuryCurrencyId && stock < 20) ||
      (currencyId === BUILD_SUPPLY.id && stock < 10);
    if (!low) continue;
    warnings.push({
      text: `Слежение: низкий запас «${currencyShortLabel(currencyId)}» (${fmtInt(stock)})`,
      action: () => onOpenProduction?.(cat?.letter),
      actionLabel: "Производство",
    });
  }

  return (
    <div className="eco-overview">
      <div className="eco-metrics-row" aria-label="Ключевые метрики">
        <MetricCard
          label="Казна"
          value={metrics.treasury}
          tone="gold"
          hint={treasuryHint.toLowerCase()}
          tip={`${treasuryHint} в казне (пег валюты) · клик по категориям ниже — к производству`}
        />
        <MetricCard
          label="Доход/ход"
          value={metrics.income}
          tone="income"
          tip={`Сумма положительных проводок по «${treasuryHint}» за последний ход журнала`}
        />
        <MetricCard
          label="Расход/ход"
          value={metrics.expense}
          tone="expense"
          tip={`Сумма списаний по «${treasuryHint}» за последний ход журнала`}
        />
      </div>

      {!producing ? (
        <EmptyState
          title="Производство ещё не запущено"
          body="Постройте шахту или добывающую станцию — запустятся потоки ресурсов."
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
      ) : null}

      <div className="eco-bento" aria-label="Шесть категорий ресурсов">
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
              {w.actionSecondary && w.actionSecondaryLabel && (
                <button
                  type="button"
                  className="btn sm ghost"
                  onClick={w.actionSecondary}
                >
                  {w.actionSecondaryLabel}
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
        <ExpenseDonut
          slices={expenseSlices}
          recent={(eco.recent ?? []).filter(
            (r) => r.currencyId === "currency.metal",
          )}
          title="Расход металла по статьям"
        />
        <FlowBars rows={flowBars} onSelectCategory={onOpenProduction} />
      </div>
    </div>
  );
}
