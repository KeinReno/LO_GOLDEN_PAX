/** Universal credit id — player-facing label is УЕ. */
export const UC_ID = "fx.universal_credit";

/**
 * Soft empire warehouse for market UX when flow capacity is unknown.
 * Ledger itself is uncapped. 250 × 8 base goods = 2000.
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

export type TradeGateReason = "ap" | "storage" | "funds";

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

/**
 * 3-factor pre-validation for market trades (AP → warehouse → funds).
 * `payCurrency`/`payAmount` = what the player spends; `receiveCurrency`/`receiveAmount` = incoming goods.
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
  warehouseCap?: number;
  receiveStockCap?: number | null;
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

  const receiveAmount = Math.max(0, Math.floor(Number(opts.receiveAmount) || 0));
  const receiveId = opts.receiveCurrency ?? "";
  if (receiveAmount > 0 && isPhysicalGood(receiveId)) {
    const perGood = opts.receiveStockCap;
    if (perGood != null && Number.isFinite(perGood)) {
      const dest = Math.max(0, Math.floor(Number(opts.stocks?.[receiveId] ?? 0)));
      if (dest + receiveAmount > perGood) {
        return { ok: false, reason: "storage", message: "Склад переполнен" };
      }
    } else {
      const used = physicalStockUsed(opts.stocks);
      const cap = opts.warehouseCap ?? marketWarehouseCap();
      if (used + receiveAmount > cap) {
        return { ok: false, reason: "storage", message: "Склад переполнен" };
      }
    }
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
