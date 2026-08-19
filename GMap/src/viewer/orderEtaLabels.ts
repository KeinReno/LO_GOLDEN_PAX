import type { PlayerOrder } from "../state/types";

const HOURS_PER_TURN = 24;

export const ORDER_TYPE_LABELS: Record<string, string> = {
  move_fleet: "Перелёт",
  move_legion: "Марш",
  attack_system: "Атака",
  blockade: "Блокада",
  fortify: "Укрепление",
  build: "Стройка",
  research: "Исследование",
  scout: "Разведка",
  scout_reveal: "Разведка",
  caravan: "Караван",
  claim_system: "Захват системы",
  transfer: "Перевод ресурсов",
  market_convert: "Обмен на рынке",
  market_offer: "Заявка на рынке",
  market_cancel: "Отмена заявки",
  set_tax: "Смена налога",
  refugee_convoy: "Караван беженцев",
  combat_stance: "Боевая стойка",
  demolish: "Снос",
  colonize: "Колонизация",
  set_colony_type: "Тип колонии",
};

export function orderTypeLabel(type: string): string {
  return ORDER_TYPE_LABELS[type] ?? type;
}

export function gameHourAtTurn(turn: number): number {
  return Math.max(0, Math.floor(turn)) * HOURS_PER_TURN;
}

export function turnsUntilOrder(order: PlayerOrder, currentTurn: number): number {
  if (order.resolvesAt == null) return 0;
  const now = gameHourAtTurn(currentTurn);
  const remaining = Math.max(0, order.resolvesAt - now);
  return Math.ceil(remaining / HOURS_PER_TURN);
}

export function hoursRemainingOrder(order: PlayerOrder, currentTurn: number): number {
  if (order.resolvesAt == null) return 0;
  const now = gameHourAtTurn(currentTurn);
  return Math.max(0, Math.round(order.resolvesAt - now));
}

/** Base → modifiers → total, rounded to whole turns in UI (B4 T4.8). */
export function formatOrderEtaChip(order: PlayerOrder, currentTurn: number): string {
  const base = order.baseDuration ?? 0;
  const modParts = (order.modifiers ?? [])
    .map((m) => `${m.label || m.source} ×${m.mult ?? 1}`)
    .join(" → ");
  const total =
    order.resolvesAt != null && order.startedAt != null
      ? Math.max(0, order.resolvesAt - order.startedAt)
      : base;
  const head =
    modParts && total !== base ? `${base}ч → ${modParts} → ${total}ч` : `${base}ч`;

  if (order.ratePerTurn != null) {
    const pct = Math.round((order.progress ?? 0) * 100);
    return `${head} · ${pct}%`;
  }

  const turns = turnsUntilOrder(order, currentTurn);
  const hours = hoursRemainingOrder(order, currentTurn);
  return `${head} · ${turns} ход${turns === 1 ? "" : turns < 5 ? "а" : "ов"} (≈${hours}ч)`;
}

export function formatOrderEtaShort(
  order: PlayerOrder,
  currentTurn: number,
): string {
  const turns = turnsUntilOrder(order, currentTurn);
  if (turns <= 0) return "этот ход";
  return `${turns} ${turns === 1 ? "ход" : turns < 5 ? "хода" : "ходов"}`;
}

export function isActiveProcessOrder(order: PlayerOrder): boolean {
  return (
    (order.status === "active" || order.status === "pending") &&
    order.category !== "instant" &&
    order.category !== "pending"
  );
}
