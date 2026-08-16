import { formatHopDistance } from "../../../state/pathfinding.ts";
import type { OrderType } from "../../../state/types";

export function hopsSuffix(hops?: number): string {
  if (hops != null && Number.isFinite(hops)) {
    return ` · ${formatHopDistance(hops)}`;
  }
  return "";
}

export function intentDefIdFromOrderType(orderType: string): string {
  return orderType.startsWith("intent.") ? orderType : `intent.${orderType}`;
}

export function unitOrderNote(p: {
  orderType: OrderType;
  hops?: number;
  isMove: boolean;
  noteOverride?: string;
  contactMode?: "auto" | "card";
}): string {
  if (p.noteOverride) return p.noteOverride;
  const hops = hopsSuffix(p.hops);
  if (p.isMove) {
    return p.hops ? `Перетаскивание${hops}` : "Перетаскивание";
  }
  if (p.orderType === "blockade") return `Блокада${hops}`;
  if (p.orderType === "fortify") return "Оборона";
  if (p.contactMode) {
    return `Контакт · ${p.contactMode === "card" ? "карты" : "авто"}`;
  }
  return `Жест · ${p.orderType}${hops}`;
}

export function unitOrderAcceptedVerb(
  orderType: OrderType,
  isMove: boolean,
): string {
  if (orderType === "attack_system") return "Приказ на атаку принят";
  if (orderType === "claim_system") return "Приказ на захват принят";
  if (orderType === "blockade") return "Блокада установлена";
  if (orderType === "fortify") return "Оборона принята";
  if (isMove) return "Перемещён";
  return "Приказ принят";
}

export function unitOrderAcceptedNote(
  orderType: OrderType,
  isMove: boolean,
  hopsLabel: string,
  meter: string,
): string {
  return `${unitOrderAcceptedVerb(orderType, isMove)}${hopsLabel} · ${meter}`;
}

export function orderPostedNote(meter: string): string {
  return `Приказ принят · ${meter}`;
}

export function cardBattleOpenedNote(): string {
  return "Карточный бой открыт";
}

export function cardBattleChallengeNote(): string {
  return "Вызов на карточный бой отправлен";
}

export function contactResolvedNote(): string {
  return "Контактный бой завершён · карта обновлена";
}

export function boardOutcomeNote(captured: boolean): string {
  return captured
    ? "Флот захвачен абордажем"
    : "Абордаж отбит · флот остался у защитника";
}

export function noSessionNote(): string {
  return "Нет сессии";
}

export function orderCancelledNote(): string {
  return "Приказ отменён";
}

export function routeClearedNote(): string {
  return "Маршрут сброшен";
}

export function fleetStanceClearedNote(): string {
  return "Режим сброшен";
}

export function pickTargetNote(): string {
  return "Кликните систему на карте — цель приказа";
}

export function noPathNote(): string {
  return "Нет пути до этой системы";
}
