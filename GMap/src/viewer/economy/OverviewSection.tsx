import { useMemo, type CSSProperties } from "react";
import type { ViewerPayload } from "../../state/types";
import type { EconomyFlowBreakdown } from "../economyFlowTypes";
import { buildEconomySystemSignals } from "../buildEconomySignals";
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
import { getCachedContent } from "../../state/contentCatalog";
import { categoryNameOnly } from "./ecoCopy";
import { currencyShortLabel } from "./chartData";
import { readStockAlerts } from "./stockAlerts";

const OCCUPATION_LABELS: Record<string, string> = {
  workers: "Рабочие",
  farmers: "Аграрии",
  scientists: "Учёные",
  industrial: "Промышленники",
  military: "Военные специалисты",
  naval: "Флотские",
  administrators: "Администрация",
  operators: "Операторы",
  biologists: "Биологи",
  archivists: "Архивариусы",
};

const ROLE_SCORE_LABELS: Record<string, string> = {
  structural: "Структурный",
  energy: "Энергетический",
  offensive: "Ударный",
  defensive: "Защитный",
  mobility: "Мобильность",
  cognitive: "Когнитивный",
  biological: "Биологический",
  exotic: "Экзотический",
};

const ROLE_SCORE_IDS = [
  "structural",
  "energy",
  "offensive",
  "defensive",
  "mobility",
  "cognitive",
  "biological",
  "exotic",
] as const;

type Props = {
  payload: ViewerPayload;
  flowData?: EconomyFlowBreakdown | null;
  onOpenProduction?: (categoryLetter?: string) => void;
  onOpenPolicies?: () => void;
  onOpenBudget?: () => void;
  /** Donut sector → budget journal filter. */
  onSelectBudgetReason?: (reason: string) => void;
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
  onSelectBudgetReason,
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

  const systemSignals = useMemo(
    () => buildEconomySystemSignals(payload, flowData),
    [payload, flowData],
  );

  const roleScoreRows = useMemo(() => {
    const scores = eco?.roleScores ?? {};
    const content = getCachedContent();
    const ms = content?.role_milestones;
    const schemaTh =
      content?.economy_schema?.role_score_pilot?.thresholds ?? {};
    return ROLE_SCORE_IDS.map((id) => ({
      id,
      label: ROLE_SCORE_LABELS[id] ?? id,
      value: Number(scores[id]) || 0,
      threshold:
        Number(ms?.[id]?.threshold) || Number(schemaTh[id]) || 0,
    }));
  }, [eco?.roleScores]);

  const civicPathRows = useMemo(() => {
    const paths = eco?.civicPaths ?? [];
    if (paths.length) {
      return paths.map((p) => ({
        id: p.id,
        label: `${p.icon ?? ""} ${p.name}`.trim(),
        value: Number(p.score) || 0,
        threshold: Number(p.nextThreshold) || 0,
      }));
    }
    const scores = eco?.civicScores ?? {};
    const thresholds = getCachedContent()?.civic_paths?.thresholds ?? {};
    return (["trade", "culture"] as const).map((id) => {
      const unlockTh = Object.values(thresholds[id] ?? {})
        .map((n) => Number(n))
        .filter((n) => n > 0)
        .sort((a, b) => a - b);
      return {
        id,
        label: id === "trade" ? "🪙 Торговля" : "🎭 Культура",
        value: Number(scores[id]) || 0,
        threshold: unlockTh[0] ?? 0,
      };
    });
  }, [eco?.civicPaths, eco?.civicScores]);

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
      const canBuy = metalStock >= 5;
      const buyLabel = `Обменять 5 ${BUILD_METAL.label}`;
      const sig =
        systemSignals.find(
          (s) => s.category === c.letter && s.systemId,
        ) ?? systemSignals.find((s) => s.category === c.letter);
      const turnsEmpty =
        sig?.turnsUntil != null
          ? sig.turnsUntil
          : c.net != null && c.net < 0 && c.stock > 0
            ? Math.max(1, Math.ceil(c.stock / Math.abs(c.net)))
            : c.stock <= 0
              ? 0
              : null;
      const where = sig?.systemName ? `${sig.systemName}: ` : "";
      const detail = sig?.reason ??
        (c.bottleneckDeficit > 0
          ? `узкое место −${fmtInt(c.bottleneckDeficit)}`
          : `запас ${fmtInt(c.stock)}${
              c.net != null ? `, ${fmtInt(c.net)}/ход` : ""
            }`);
      const when =
        turnsEmpty === 0
          ? "уже не хватает"
          : turnsEmpty != null
            ? `через ~${turnsEmpty} ход.`
            : null;
      const consequence = sig?.consequence ?? `производство «${c.name}» под угрозой`;
      warnings.push({
        text: `${where}${detail}${when ? ` · ${when}` : ""} — ${consequence}.`,
        action: () =>
          onFocusDeficit
            ? onFocusDeficit(c.letter, sig?.systemId || undefined)
            : onOpenProduction?.(c.letter),
        actionLabel: onFocusDeficit ? "Решить" : "К производству",
        actionSecondary:
          canBuy && onConvert
            ? () => onConvert(BUILD_METAL.id, c.id, 5)
            : undefined,
            actionSecondaryLabel: canBuy ? buyLabel : undefined,
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

  const topWarnings = warnings.slice(0, 4);

  const occupationRows = Object.entries(flowData?.occupations ?? {})
    .map(([id, n]) => ({ id, n: Number(n) || 0 }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n);

  return (
    <div className="eco-overview eco-command">
      <section className="eco-command__attention" aria-label="Требует внимания">
        <div className="eco-command__section-label">Внимание</div>
        {topWarnings.length === 0 ? (
          <p className="hint eco-command__calm">
            Казна в норме — срочных дефицитов нет. Категории ниже ведут в производство.
          </p>
        ) : (
          <ul className="eco-command-alerts">
            {topWarnings.map((w, i) => (
              <li key={`${w.text}-${i}`} className="eco-command-alert">
                <span className="eco-command-alert__text">{w.text}</span>
                <span className="eco-command-alert__actions">
                  {w.action && w.actionLabel ? (
                    <button
                      type="button"
                      className="btn sm primary"
                      onClick={w.action}
                    >
                      {w.actionLabel}
                    </button>
                  ) : null}
                  {w.actionSecondary && w.actionSecondaryLabel ? (
                    <button
                      type="button"
                      className="btn sm ghost"
                      onClick={w.actionSecondary}
                    >
                      {w.actionSecondaryLabel}
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        {warnings.length > topWarnings.length ? (
          <p className="hint">
            Ещё сигналов: {warnings.length - topWarnings.length}
          </p>
        ) : null}
      </section>

      {occupationRows.length > 0 ? (
        <section className="eco-command__attention" aria-label="Занятость">
          <div className="eco-command__section-label">Занятость</div>
          <p className="hint">
            {occupationRows
              .map(
                (r) =>
                  `${OCCUPATION_LABELS[r.id] ?? r.id} ${fmtInt(Math.round(r.n))}`,
              )
              .join(" · ")}
          </p>
        </section>
      ) : null}

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

      <section aria-label="Шесть категорий ресурсов">
        <div className="eco-command__section-label">Категории · к производству</div>
        <div className="eco-bento eco-bento--command">
          {cats.map((c) => (
            <CategoryCard
              key={c.id}
              cat={c}
              sparkValues={sparks[c.id]}
              onSelect={(letter) => onOpenProduction?.(letter)}
            />
          ))}
        </div>
      </section>

      <div className="eco-command__deep">
        <button
          type="button"
          className="eco-deep-btn"
          onClick={() => onOpenBudget?.()}
        >
          <strong>Бюджет</strong>
          <span className="hint">журнал · ноль казны</span>
        </button>
        <button
          type="button"
          className="eco-deep-btn"
          onClick={() => onOpenPolicies?.()}
        >
          <strong>Политики</strong>
          <span className="hint">налоги · давление {fmtInt(pressure)}</span>
        </button>
        <button
          type="button"
          className="eco-deep-btn"
          onClick={() => onOpenProduction?.()}
        >
          <strong>Производство</strong>
          <span className="hint">потоки · приоритеты</span>
        </button>
      </div>

      <details className="eco-command__analytics">
        <summary>Аналитика · RoleScore · гражданские пути</summary>
        <div className="eco-rolescore" aria-label="RoleScore">
          <header className="eco-chart-block__head">
            <h4>Специализация (RoleScore)</h4>
            <span className="hint">накоплено за игру · не тратится</span>
          </header>
          <ul className="eco-rolescore__list">
            {roleScoreRows.map((row) => {
              const pct =
                row.threshold > 0
                  ? Math.min(100, Math.round((row.value / row.threshold) * 100))
                  : 0;
              return (
                <li key={row.id} className="eco-rolescore__item">
                  <span className="eco-rolescore__label">{row.label}</span>
                  <strong className="tabular-nums eco-rolescore__value">
                    {fmtInt(row.value)}
                  </strong>
                  {row.threshold > 0 ? (
                    <span className="hint eco-rolescore__gate">
                      / {fmtInt(row.threshold)} · {pct}%
                    </span>
                  ) : null}
                  <span
                    className="eco-rolescore__bar"
                    style={{ "--rs-pct": `${pct}%` } as CSSProperties}
                    aria-hidden
                  />
                </li>
              );
            })}
          </ul>
        </div>
        <div className="eco-rolescore" aria-label="Гражданские пути">
          <header className="eco-chart-block__head">
            <h4>Гражданские пути</h4>
            <span className="hint">видны с 1-го хода · накоплено за игру</span>
          </header>
          <ul className="eco-rolescore__list">
            {civicPathRows.map((row) => {
              const pct =
                row.threshold > 0
                  ? Math.min(100, Math.round((row.value / row.threshold) * 100))
                  : 0;
              return (
                <li key={row.id} className="eco-rolescore__item">
                  <span className="eco-rolescore__label">{row.label}</span>
                  <strong className="tabular-nums eco-rolescore__value">
                    {fmtInt(row.value)}
                  </strong>
                  {row.threshold > 0 ? (
                    <span className="hint eco-rolescore__gate">
                      / {fmtInt(row.threshold)} · {pct}%
                    </span>
                  ) : null}
                  <span
                    className="eco-rolescore__bar"
                    style={{ "--rs-pct": `${pct}%` } as CSSProperties}
                    aria-hidden
                  />
                </li>
              );
            })}
          </ul>
        </div>
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
              (r) =>
                r.currencyId === treasuryCurrencyId ||
                r.currencyId === "currency.metal",
            )}
            title={`Расход · ${treasuryHint}`}
            onSelectReason={(reason) => {
              if (reason) onSelectBudgetReason?.(reason);
            }}
          />
          <FlowBars rows={flowBars} onSelectCategory={onOpenProduction} />
        </div>
      </details>
    </div>
  );
}
