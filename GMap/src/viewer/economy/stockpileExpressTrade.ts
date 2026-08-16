import type { EconomyFlowBreakdown } from "../economyFlowTypes";

/** Legacy treasury / quote ids — keep literals so this module stays Node-testable. */
const METAL_ID = "currency.metal";
const SUPPLY_ID = "currency.supply";

/** Universal credit — MarketPanel numeraire (УЕ). */
export const UNIVERSAL_CREDIT = "fx.universal_credit";

export const EXPRESS_SELL_STEP = 10;
export const EXPRESS_BUY_QUOTE_STEP = 5;
export const EXPRESS_LOT_FRACTIONS = [0.25, 0.5] as const;

/** Soft warehouse: ~N turns of pipe throughput for the category. */
export const WAREHOUSE_CAP_TURNS = 25;

export type MarketRateRow = {
  pair: string;
  buy?: number;
  sell?: number;
};

export type ExpressSide = "buy" | "sell";

export type ExpressTradeBlock =
  | "Не хватает ОД"
  | "Склад переполнен"
  | "Недостаточно УЕ"
  | "Недостаточно запаса"
  | "Нет рыночного курса"
  | "Обмен недоступен";

export type ExpressTradeCheck =
  | {
      ok: true;
      fromCurrency: string;
      toCurrency: string;
      amountFrom: number;
      amountTo: number;
      quoteCurrency: string;
    }
  | { ok: false; reason: ExpressTradeBlock };

export function parseRatePair(
  pairStr: string,
): { from: string; to: string } | null {
  const parts = String(pairStr || "")
    .split(/→|->/)
    .map((s) => s.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { from: parts[0], to: parts[1] };
}

/** Client preview matching server `lookupMarketRate` + `computeMarketAmounts`. */
export function previewConvert(
  rates: MarketRateRow[] | null | undefined,
  fromCurrency: string,
  toCurrency: string,
  amountFrom: number,
): number | null {
  if (!rates || amountFrom <= 0 || fromCurrency === toCurrency) return null;
  for (const row of rates) {
    const pair = parseRatePair(row.pair);
    if (!pair) continue;
    if (pair.from === fromCurrency && pair.to === toCurrency) {
      const sell = Number(row.sell ?? row.buy);
      if (!Number.isFinite(sell) || sell <= 0) return null;
      return Math.floor(amountFrom * sell);
    }
    if (pair.from === toCurrency && pair.to === fromCurrency) {
      const buy = Number(row.buy ?? row.sell);
      if (!Number.isFinite(buy) || buy <= 0) return null;
      return Math.floor(amountFrom / buy);
    }
  }
  return null;
}

/** True when a placeholder/live row covers from→to (even if qty 1 floors to 0). */
export function hasConvertRate(
  rates: MarketRateRow[] | null | undefined,
  fromCurrency: string,
  toCurrency: string,
): boolean {
  if (!rates || fromCurrency === toCurrency) return false;
  for (const row of rates) {
    const pair = parseRatePair(row.pair);
    if (!pair) continue;
    if (pair.from === fromCurrency && pair.to === toCurrency) {
      const sell = Number(row.sell ?? row.buy);
      return Number.isFinite(sell) && sell > 0;
    }
    if (pair.from === toCurrency && pair.to === fromCurrency) {
      const buy = Number(row.buy ?? row.sell);
      return Number.isFinite(buy) && buy > 0;
    }
  }
  return false;
}

const QUOTE_PREFERENCE = [METAL_ID, UNIVERSAL_CREDIT, SUPPLY_ID];

/** Counterparty with a live rate, preferring metal → УЕ → supply. */
export function resolveQuoteCurrency(
  rates: MarketRateRow[] | null | undefined,
  resourceId: string,
): string | null {
  if (!resourceId) return null;
  for (const quote of QUOTE_PREFERENCE) {
    if (quote === resourceId) continue;
    if (
      hasConvertRate(rates, resourceId, quote) ||
      hasConvertRate(rates, quote, resourceId)
    ) {
      return quote;
    }
  }
  for (const row of rates ?? []) {
    const pair = parseRatePair(row.pair);
    if (!pair) continue;
    if (pair.from === resourceId && pair.to !== resourceId) return pair.to;
    if (pair.to === resourceId && pair.from !== resourceId) return pair.from;
  }
  return null;
}

export function lotAmount(available: number, fraction: number): number {
  const have = Math.max(0, Math.floor(Number(available) || 0));
  if (have <= 0) return 0;
  return Math.max(1, Math.floor(have * fraction) || 1);
}

export function fixedSellAmount(available: number): number {
  const have = Math.max(0, Math.floor(Number(available) || 0));
  if (have <= 0) return 0;
  return Math.max(1, Math.min(EXPRESS_SELL_STEP, have));
}

export function fixedBuyQuoteAmount(quoteAvailable: number): number {
  const have = Math.max(0, Math.floor(Number(quoteAvailable) || 0));
  if (have <= 0) return 0;
  return Math.max(1, Math.min(EXPRESS_BUY_QUOTE_STEP, have));
}

export function inferWarehouseCap(
  flowData: EconomyFlowBreakdown | null | undefined,
  categoryLetter: string | null | undefined,
): number | null {
  if (!categoryLetter) return null;
  const tiers = flowData?.flows?.[categoryLetter];
  if (!tiers) return null;
  let capacity = 0;
  for (const cell of Object.values(tiers)) {
    const cap = Number(cell?.capacity ?? 0);
    if (Number.isFinite(cap) && cap > 0) capacity += cap;
  }
  if (capacity <= 0) return null;
  return Math.max(1, Math.floor(capacity * WAREHOUSE_CAP_TURNS));
}

export function validateExpressTrade(p: {
  side: ExpressSide;
  resourceId: string;
  amountFrom: number;
  rates: MarketRateRow[] | null | undefined;
  quoteCurrency?: string | null;
  stocks: Record<string, number>;
  /** Spendable resource (stock − reserve). */
  available: number;
  /** Spendable quote/treasury (stock − reserve). Falls back to stocks[quote]. */
  quoteAvailable?: number;
  reservedAp: number;
  apMax: number;
  convertAp: number;
  stockCap?: number | null;
}): ExpressTradeCheck {
  const resourceId = p.resourceId;
  if (!resourceId) {
    return { ok: false, reason: "Обмен недоступен" };
  }

  const quote =
    p.quoteCurrency ?? resolveQuoteCurrency(p.rates, resourceId);
  if (!quote || quote === resourceId) {
    return { ok: false, reason: "Нет рыночного курса" };
  }

  const convertAp = Math.max(0, Math.floor(Number(p.convertAp) || 0));
  const reservedAp = Math.max(0, Math.floor(Number(p.reservedAp) || 0));
  const apMax = Math.max(0, Math.floor(Number(p.apMax) || 0));
  if (convertAp > 0 && reservedAp + convertAp > apMax) {
    return { ok: false, reason: "Не хватает ОД" };
  }

  const amountFrom = Math.floor(Number(p.amountFrom) || 0);
  if (amountFrom <= 0) {
    return {
      ok: false,
      reason: p.side === "buy" ? "Недостаточно УЕ" : "Недостаточно запаса",
    };
  }

  const fromCurrency = p.side === "sell" ? resourceId : quote;
  const toCurrency = p.side === "sell" ? quote : resourceId;
  const amountTo = previewConvert(p.rates, fromCurrency, toCurrency, amountFrom);
  if (amountTo == null || amountTo <= 0) {
    return { ok: false, reason: "Нет рыночного курса" };
  }

  if (p.side === "sell") {
    const available = Math.max(0, Math.floor(Number(p.available) || 0));
    if (amountFrom > available) {
      return { ok: false, reason: "Недостаточно запаса" };
    }
  } else {
    const quoteHave = Math.max(
      0,
      Math.floor(
        Number(
          p.quoteAvailable ?? p.stocks[quote] ?? 0,
        ) || 0,
      ),
    );
    if (amountFrom > quoteHave) {
      return { ok: false, reason: "Недостаточно УЕ" };
    }
    const cap = p.stockCap;
    if (cap != null && Number.isFinite(cap)) {
      const dest = Math.max(0, Math.floor(Number(p.stocks[resourceId] ?? 0)));
      if (dest >= cap || dest + amountTo > cap) {
        return { ok: false, reason: "Склад переполнен" };
      }
    }
  }

  return {
    ok: true,
    fromCurrency,
    toCurrency,
    amountFrom,
    amountTo,
    quoteCurrency: quote,
  };
}
