import type { ViewerPayload } from "../../state/types";
import { BUILD_METAL, CATEGORY_CURRENCIES } from "../../state/economyLabels";
import type { EconomyFlowBreakdown } from "../economyFlowTypes";
import { latestTreasuryTurn } from "./economyMath";

export type LedgerRow = NonNullable<
  NonNullable<ViewerPayload["economy"]>["recent"]
>[number];

export type TreasuryPoint = {
  turn: number;
  value: number | null;
  forecast: number | null;
  isForecast?: boolean;
};

export type ExpenseSlice = {
  reason: string;
  label: string;
  amount: number;
  fill: string;
  /** Turn the slice was aggregated from (for drill-down filter). */
  turn?: number | null;
};

export type FlowBarRow = {
  letter: string;
  name: string;
  color: string;
  production: number;
  consumption: number;
  net: number;
};

export type TurnGroup = {
  turn: number | null;
  rows: LedgerRow[];
  income: number;
  expense: number;
};

const REASON_LABELS: Record<string, string> = {
  flow_income: "Производство",
  flow_upkeep: "Содержание",
  bridge_income: "Перевод в металл",
  bridge_upkeep: "Расход металла",
  treasury_income: "Доход казны",
  treasury_upkeep: "Расход казны",
  market_convert_out: "Обмен (отдача)",
  market_convert_in: "Обмен (получение)",
  transfer_out: "Перевод (исх.)",
  transfer_in: "Перевод (вх.)",
  tax: "Налоги",
  build: "Строительство",
  research: "Исследования",
  upkeep: "Содержание",
  income: "Доход",
  forces_mutate: "Силы",
  forge: "Модернизация",
  disband: "Утиль",
  outfit: "Оснащение",
  caravan: "Караван",
  reserve: "Резерв",
};

const DONUT_PALETTE = [
  "#e85d4c",
  "#e8a54c",
  "#c98a3a",
  "#7a8fa6",
  "#9b6bff",
  "#5cdb95",
  "#3b82f6",
  "#c9a227",
];

export function reasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? reason.replace(/_/g, " ");
}

const PEG_LABELS: Record<string, string> = {
  "map.solari": "Соларит",
  "map.blumatid": "Блюматид",
  "map.glasssteel": "Стеклосталь",
  "map.gold": "Золото",
  "map.crystals": "Кристаллы",
  "map.biomass": "Биомасса",
  "map.iron": "Железо",
  "map.water": "Вода",
  "map.dark_matter": "Тёмная материя",
};

export function currencyShortLabel(currencyId: string): string {
  const cat = CATEGORY_CURRENCIES.find((c) => c.id === currencyId);
  if (cat) return `${cat.name} (${cat.short})`;
  if (currencyId === BUILD_METAL.id) return BUILD_METAL.label;
  if (currencyId === "currency.supply") return "Обеспечение";
  if (PEG_LABELS[currencyId]) return PEG_LABELS[currencyId];
  if (currencyId.startsWith("map.")) {
    return currencyId.replace(/^map\./, "");
  }
  return currencyId.replace(/^currency\./, "");
}

/**
 * Reconstruct per-turn metal balances from current stock + recent deltas,
 * then extrapolate 5 turns with average net.
 */
export function buildTreasurySeries(
  economy: NonNullable<ViewerPayload["economy"]>,
  forecastTurns = 5,
  currentTurn?: number | null,
  treasuryCurrencyId: string = BUILD_METAL.id,
): { points: TreasuryPoint[]; zeroTurn: number | null; avgNet: number } {
  const recent = (economy.recent ?? []).filter(
    (r) => r.currencyId === treasuryCurrencyId && r.turn != null,
  );
  const byTurn = new Map<number, number>();
  for (const r of recent) {
    const t = r.turn as number;
    byTurn.set(t, (byTurn.get(t) ?? 0) + r.delta);
  }

  const turns = [...byTurn.keys()].sort((a, b) => a - b);
  const current = economy.stocks?.[treasuryCurrencyId] ?? 0;
  const nowTurn =
    currentTurn != null && Number.isFinite(currentTurn)
      ? Number(currentTurn)
      : (turns[turns.length - 1] ?? economy.recent?.[0]?.turn ?? 0);

  // Walk backwards from current stock using net deltas.
  const history: { turn: number; value: number }[] = [];
  let cursor = current;
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]!;
    const net = byTurn.get(t) ?? 0;
    // value at end of turn t = cursor; before applying net of turn t was cursor - net
    history.push({ turn: t, value: cursor });
    cursor -= net;
  }
  history.reverse();

  // Anchor "now" to world turn even when this turn has no metal rows yet.
  if (history.length === 0) {
    history.push({ turn: nowTurn, value: current });
  } else {
    const lastHist = history[history.length - 1]!;
    if (lastHist.turn < nowTurn) {
      history.push({ turn: nowTurn, value: current });
    } else if (lastHist.turn === nowTurn) {
      lastHist.value = current;
    }
  }

  const last = history[history.length - 1]!;
  const avgNet =
    turns.length > 0
      ? [...byTurn.values()].reduce((a, b) => a + b, 0) / turns.length
      : 0;

  const points: TreasuryPoint[] = history.map((h) => ({
    turn: h.turn,
    value: h.value,
    forecast: null,
  }));

  // Connect forecast at last historical point.
  points[points.length - 1] = {
    ...last,
    value: last.value,
    forecast: last.value,
  };

  let zeroTurn: number | null = null;
  let forecastVal = last.value;
  for (let i = 1; i <= forecastTurns; i++) {
    forecastVal += avgNet;
    const turn = last.turn + i;
    points.push({
      turn,
      value: null,
      forecast: Math.round(forecastVal * 10) / 10,
      isForecast: true,
    });
    if (zeroTurn == null && forecastVal <= 0 && avgNet < 0) {
      zeroTurn = turn;
    }
  }

  return { points, zeroTurn, avgNet: Math.round(avgNet * 10) / 10 };
}

/** Per-currency sparkline: reconstruct stock path from recent deltas. */
export function buildSparkline(
  economy: NonNullable<ViewerPayload["economy"]>,
  currencyId: string,
): number[] {
  const recent = (economy.recent ?? [])
    .filter((r) => r.currencyId === currencyId && r.turn != null)
    .slice()
    .reverse(); // oldest first among filtered? recent is newest-first from API

  // API: recent is newest first. Group by turn oldest→newest.
  const byTurn = new Map<number, number>();
  for (const r of recent) {
    const t = r.turn as number;
    byTurn.set(t, (byTurn.get(t) ?? 0) + r.delta);
  }
  const turns = [...byTurn.keys()].sort((a, b) => a - b);
  const current = economy.stocks?.[currencyId] ?? 0;
  if (turns.length === 0) return [current];

  const values: number[] = [];
  let cursor = current;
  for (let i = turns.length - 1; i >= 0; i--) {
    values.push(cursor);
    cursor -= byTurn.get(turns[i]!) ?? 0;
  }
  values.reverse();
  return values;
}

export function buildExpenseSlices(
  economy: NonNullable<ViewerPayload["economy"]>,
  currencyFilter?: string | null,
  currentTurn?: number | null,
): ExpenseSlice[] {
  const recent = economy.recent ?? [];
  // Align with computeMetrics: same "latest treasury turn" for filtered currency.
  const filterId = currencyFilter || BUILD_METAL.id;
  let latestTurn: number | null = latestTreasuryTurn(
    economy,
    filterId,
    currentTurn,
  );
  if (latestTurn == null) {
    for (const r of recent) {
      if (r.delta >= 0) continue;
      if (currencyFilter && r.currencyId !== currencyFilter) continue;
      if (r.turn == null) continue;
      if (latestTurn == null || r.turn > latestTurn) latestTurn = r.turn;
    }
  }
  const byReason = new Map<string, number>();
  for (const r of recent) {
    if (r.delta >= 0) continue;
    if (currencyFilter && r.currencyId !== currencyFilter) continue;
    if (latestTurn != null && r.turn !== latestTurn) continue;
    if (latestTurn == null && r.turn != null) continue;
    byReason.set(r.reason, (byReason.get(r.reason) ?? 0) + Math.abs(r.delta));
  }
  const slices = [...byReason.entries()]
    .map(([reason, amount], i) => ({
      reason,
      label: reasonLabel(reason),
      amount: Math.round(amount * 10) / 10,
      fill: DONUT_PALETTE[i % DONUT_PALETTE.length]!,
      turn: latestTurn,
    }))
    .sort((a, b) => b.amount - a.amount);
  return slices;
}

export function buildFlowBars(
  flowData?: EconomyFlowBreakdown | null,
): FlowBarRow[] {
  return CATEGORY_CURRENCIES.map((c) => {
    const t = flowData?.totals?.[c.letter];
    const production = t?.rate ?? 0;
    const consumption = t?.demand ?? 0;
    const net = t?.net ?? production - consumption;
    return {
      letter: c.letter,
      name: c.name,
      color: c.cssVar,
      production,
      consumption,
      net,
    };
  });
}

export function groupRecentByTurn(
  recent: LedgerRow[],
  filter: "all" | "income" | "expense" = "all",
): TurnGroup[] {
  const filtered = recent.filter((r) => {
    if (filter === "income") return r.delta > 0;
    if (filter === "expense") return r.delta < 0;
    return true;
  });
  const map = new Map<number | null, LedgerRow[]>();
  for (const r of filtered) {
    const key = r.turn;
    const list = map.get(key) ?? [];
    list.push(r);
    map.set(key, list);
  }
  const groups: TurnGroup[] = [...map.entries()].map(([turn, rows]) => {
    let income = 0;
    let expense = 0;
    for (const r of rows) {
      if (r.delta > 0) income += r.delta;
      else expense += Math.abs(r.delta);
    }
    return { turn, rows, income, expense };
  });
  groups.sort((a, b) => {
    if (a.turn == null) return 1;
    if (b.turn == null) return -1;
    return b.turn - a.turn;
  });
  return groups;
}

/** Expenses for a single reason (for donut drill-down). */
export function rowsForReason(
  recent: LedgerRow[],
  reason: string,
  opts?: { turn?: number | null; currencyId?: string | null },
): LedgerRow[] {
  return recent.filter((r) => {
    if (r.reason !== reason || r.delta >= 0) return false;
    if (opts?.turn != null && r.turn !== opts.turn) return false;
    if (opts?.currencyId && r.currencyId !== opts.currencyId) return false;
    return true;
  });
}
