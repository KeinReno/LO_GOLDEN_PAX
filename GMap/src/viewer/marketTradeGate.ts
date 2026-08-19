/** Universal credit id — player-facing label is УЕ. */
export const UC_ID = "fx.universal_credit";

/**
 * Soft empire warehouse for *display* when flow capacity is unknown.
 * The ledger is uncapped — do not use this as a hard trade gate.
 */
export const MARKET_WAREHOUSE_PER_SLOT = 250;

const METAL = "currency.metal";
const SUPPLY = "currency.supply";

const KEY_STRIP: { id: string; label: string; short: string }[] = [
  { id: METAL, label: "Металл", short: "M" },
  { id: SUPPLY, label: "Обеспечение", short: "S" },
  { id: "currency.extracta", label: "Сырьё", short: "A" },
  { id: "currency.materia", label: "Материалы", short: "B" },
  { id: "currency.industria", label: "Промышленность", short: "C" },
  { id: "currency.energia", label: "Энергия", short: "D" },
  { id: "currency.bios", label: "Биомасса", short: "E" },
  { id: "currency.cognitio", label: "Знание", short: "F" },
];

const GOODS_IDS = KEY_STRIP.map((row) => row.id);

/** Quote asset for common-market lots — matches the УЕ charts, then metal, then supply. */
const MARKET_QUOTE_PREFERENCE = [UC_ID, METAL, SUPPLY] as const;

export type TradeGateReason = "ap" | "storage" | "funds" | "rate";

export type TradeGateOk = { ok: true };
export type TradeGateFail = {
  ok: false;
  reason: TradeGateReason;
  message: string;
};
export type TradeGate = TradeGateOk | TradeGateFail;

export type StockpileStripItem = {
  id: string;
  label: string;
  short: string;
  amount: number;
};

export type StockpileStripModel = {
  uc: number;
  items: StockpileStripItem[];
  used: number;
  cap: number;
  remaining: number;
  full: boolean;
};

export type MarketRateRow = {
  pair?: string;
  buy?: number;
  sell?: number;
};

export function isPhysicalGood(currencyId: string): boolean {
  if (!currencyId) return false;
  if (GOODS_IDS.includes(currencyId)) return true;
  return currencyId.startsWith("map.");
}

export function marketWarehouseCap(slotCount = GOODS_IDS.length): number {
  return Math.max(GOODS_IDS.length, slotCount) * MARKET_WAREHOUSE_PER_SLOT;
}

export function physicalStockUsed(
  stocks?: Record<string, number> | null,
  goodIds: string[] = GOODS_IDS,
): number {
  let used = 0;
  for (const id of goodIds) {
    used += Math.max(0, Math.floor(Number(stocks?.[id] ?? 0)));
  }
  return used;
}

export function buildStockpileStrip(
  stocks?: Record<string, number> | null,
  warehouseCap?: number,
): StockpileStripModel {
  const used = physicalStockUsed(stocks);
  const cap = warehouseCap ?? marketWarehouseCap();
  const remaining = Math.max(0, cap - used);
  const uc = Math.max(0, Math.floor(Number(stocks?.[UC_ID] ?? 0)));
  return {
    uc,
    items: KEY_STRIP.map((row) => ({
      ...row,
      amount: Math.max(0, Math.floor(Number(stocks?.[row.id] ?? 0))),
    })),
    used,
    cap,
    remaining,
    full: remaining <= 0,
  };
}

function parseRateEnds(pairStr: string): { from: string; to: string } | null {
  const parts = String(pairStr || "")
    .split(/→|->/)
    .map((s) => s.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { from: parts[0], to: parts[1] };
}

function rowCoversPair(
  row: MarketRateRow,
  from: string,
  to: string,
): boolean {
  const pair = parseRateEnds(String(row.pair || ""));
  if (!pair) return false;
  if (pair.from === from && pair.to === to) {
    const sell = Number(row.sell ?? row.buy);
    return Number.isFinite(sell) && sell > 0;
  }
  if (pair.from === to && pair.to === from) {
    const buy = Number(row.buy ?? row.sell);
    return Number.isFinite(buy) && buy > 0;
  }
  return false;
}

/** Counterparty for a quick lot. УЕ first so the book matches the quote charts. */
export function resolveMarketQuoteCurrency(
  rates: MarketRateRow[] | null | undefined,
  resourceId: string,
): string | null {
  if (!resourceId) return null;
  const rows = rates ?? [];
  for (const quote of MARKET_QUOTE_PREFERENCE) {
    if (quote === resourceId) continue;
    if (rows.some((row) => rowCoversPair(row, resourceId, quote))) return quote;
  }
  for (const row of rows) {
    const pair = parseRateEnds(String(row.pair || ""));
    if (!pair) continue;
    if (pair.from === resourceId && pair.to !== resourceId) return pair.to;
    if (pair.to === resourceId && pair.from !== resourceId) return pair.from;
  }
  return null;
}

/**
 * Pre-validation for market trades (AP → funds).
 * Warehouse is display-only: the live ledger has no stock ceiling.
 */
export function validateMarketTrade(opts: {
  reservedAp: number;
  apMax: number;
  apCost: number;
  stocks?: Record<string, number> | null;
  payCurrency?: string | null;
  payAmount?: number;
  receiveCurrency?: string | null;
  receiveAmount?: number;
  /** Ignored — kept so callers do not invent a second gate. */
  warehouseCap?: number;
  receiveStockCap?: number | null;
  quoteOk?: boolean;
}): TradeGate {
  const apCost = Math.max(0, Math.floor(Number(opts.apCost) || 0));
  const reserved = Math.max(0, Math.floor(Number(opts.reservedAp) || 0));
  const apMax = Math.max(0, Math.floor(Number(opts.apMax) || 0));
  if (apCost > 0 && reserved + apCost > apMax) {
    return {
      ok: false,
      reason: "ap",
      message: `Не хватает ОД (нужно ${apCost})`,
    };
  }

  if (opts.quoteOk === false) {
    return { ok: false, reason: "rate", message: "Нет курса" };
  }

  const payAmount = Math.max(0, Math.floor(Number(opts.payAmount) || 0));
  const payId = opts.payCurrency ?? "";
  if (payAmount > 0 && payId) {
    const have = Math.max(0, Math.floor(Number(opts.stocks?.[payId] ?? 0)));
    if (payAmount > have) {
      return {
        ok: false,
        reason: "funds",
        message:
          payId === UC_ID ? "Недостаточно УЕ" : `Недостаточно ${shortPayLabel(payId)}`,
      };
    }
  }

  return { ok: true };
}

function shortPayLabel(currencyId: string): string {
  const row = KEY_STRIP.find((c) => c.id === currencyId);
  if (row) return row.label;
  if (currencyId === UC_ID) return "УЕ";
  return currencyId.replace(/^(currency|map|fx)\./, "") || "средств";
}
