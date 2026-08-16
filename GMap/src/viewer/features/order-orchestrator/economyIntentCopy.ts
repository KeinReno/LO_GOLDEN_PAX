export const TAX_SLOT_LABELS: Record<string, Record<string, string>> = {
  "tax.materia": { none: "0%", low: "8%", mid: "15%", high: "25%" },
  "tax.energia": { none: "0%", low: "8%", mid: "15%", high: "22%" },
  "tax.bios": { none: "0%", low: "5%", mid: "12%", high: "18%" },
  "tax.industry": { none: "0%", low: "8%", mid: "15%", high: "25%" },
  "tax.supply": { none: "0%", low: "5%", mid: "12%", high: "18%" },
};

export const DOCTRINE_TAX_PRESETS: Record<string, Record<string, string>> = {
  military: {
    "tax.materia": "high",
    "tax.energia": "low",
    "tax.bios": "none",
  },
  trade: {
    "tax.materia": "low",
    "tax.energia": "none",
    "tax.bios": "none",
  },
  growth: {
    "tax.materia": "none",
    "tax.energia": "none",
    "tax.bios": "none",
  },
};

export function taxTierDisplay(taxSlot: string, tierId: string): string {
  return TAX_SLOT_LABELS[taxSlot]?.[tierId] ?? tierId;
}

export function taxQueuedNote(label: string): string {
  return `Налог в очереди: ${label}`;
}

export function taxFailNote(label: string): string {
  return `Не удалось сменить налог (${label})`;
}

export function caravanOriginSystemId(
  systems: { id: string; ownerFactionId?: string | null }[],
  factionId: string,
  capitalIds: string[],
): string | undefined {
  return (
    capitalIds[0] ??
    systems.find((s) => s.ownerFactionId === factionId)?.id
  );
}

export function caravanQueuedNote(amount: number, curLabel: string): string {
  return `Караван: ${amount} ${curLabel} → система (на тике)`;
}

export function flowPriorityNote(from: string, to: string): string {
  return `Приоритет ${from}→${to}`;
}

export function reserveQueuedNote(
  positive: boolean,
  amountLabel: string,
  curLabel: string,
): string {
  return positive
    ? `Резерв ${amountLabel} · ${curLabel}`
    : `Резерв снят · ${curLabel}`;
}

export function marketConvertNote(
  amountFrom: number,
  fromCurrency: string,
): string {
  return `Обмен в очереди: ${amountFrom} ${fromCurrency.replace(/^currency\./, "")}`;
}

export function marketOfferNote(
  venue: "common" | "contacts",
  giveAmount: number,
  wantAmount: number,
): string {
  const where = venue === "common" ? "общий" : "контакты";
  return `Заявка (${where}): ${giveAmount} → ${wantAmount}`;
}

export function transferQueuedNote(
  amount: number,
  toName: string,
): string {
  return `Перевод в очереди: ${amount} → ${toName}`;
}

export function scoutQueuedNote(
  systemName: string,
  odCostLabel?: string,
): string {
  return odCostLabel
    ? `Разведка в очереди: ${systemName} (${odCostLabel})`
    : `Разведка в очереди: ${systemName}`;
}

type PendingEco = {
  pendingPolicy?: { taxes?: Record<string, string> };
};

export function withPendingTax<T>(
  economy: T,
  taxSlot: string,
  tierId: string,
): T {
  const eco = economy as T & PendingEco;
  return {
    ...eco,
    pendingPolicy: {
      ...(eco.pendingPolicy ?? {}),
      taxes: {
        ...(eco.pendingPolicy?.taxes || {}),
        [taxSlot]: tierId,
      },
    },
  };
}

type FlowEco = {
  flowPriorities?: Record<
    string,
    { from: string; to: string; edge: string }
  >;
};

export function withFlowPriority<T>(
  economy: T,
  key: string,
  from: string,
  to: string,
): T {
  const eco = economy as T & FlowEco;
  return {
    ...eco,
    flowPriorities: {
      ...(eco.flowPriorities ?? {}),
      [key]: { from, to, edge: `${from}->${to}` },
    },
  };
}

type ReserveEco = {
  stockReserves?: Record<string, { amount: number; label?: string }>;
};

export function withStockReserve<T>(
  economy: T,
  currencyId: string,
  amount: number,
  label?: string,
): T {
  const eco = economy as T & ReserveEco;
  const next = { ...(eco.stockReserves ?? {}) };
  if (amount <= 0) delete next[currencyId];
  else next[currencyId] = { amount, label: label || "резерв" };
  return { ...eco, stockReserves: next };
}

type DoctrineEco = PendingEco & { economicPolicy?: string };

export function withDoctrinePending<T>(economy: T, policyId: string): T {
  const eco = economy as T & DoctrineEco;
  const taxes = DOCTRINE_TAX_PRESETS[policyId] ?? {};
  return {
    ...eco,
    economicPolicy: policyId,
    pendingPolicy: {
      ...(eco.pendingPolicy ?? {}),
      taxes: {
        ...(eco.pendingPolicy?.taxes || {}),
        ...taxes,
      },
    },
  };
}

export function sameTaxChoice(
  applied: string | undefined,
  pending: string | undefined,
  tierId: string,
): boolean {
  return (pending ?? applied ?? "none") === tierId;
}
