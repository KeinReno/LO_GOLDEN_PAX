/**
 * Live GM domain registry — F1–F4 and F6–F9 workbench slots.
 * Bare F5 is left to the browser (refresh). Inbox focuses the right dock.
 */
import type { GmLiveDomainId } from "../../state/types";

export type { GmLiveDomainId };

export type GmDomainDef = {
  id: GmLiveDomainId;
  label: string;
  hint: string;
  /** Keyboard digit after F. Null = no F-key (never steal browser F5). */
  hotkey: number | null;
  /** Opens FloatingPanel workbench (false = dock/overlay only). */
  workbench: boolean;
};

export function domainHotkeyLabel(
  hotkey: number | null | undefined,
): string | null {
  return hotkey == null ? null : `F${hotkey}`;
}

export const GM_LIVE_DOMAINS: GmDomainDef[] = [
  {
    id: "inbox",
    label: "Очередь",
    hint: "Приказы игроков и тик",
    hotkey: 1,
    workbench: false,
  },
  {
    id: "economy",
    label: "Экономика",
    hint: "Казна, налоги, рынок",
    hotkey: 2,
    workbench: true,
  },
  {
    id: "science",
    label: "Выдача техов",
    hint: "Выдать технологии и рецепты активной державе",
    hotkey: 3,
    workbench: true,
  },
  {
    id: "court",
    label: "Двор",
    hint: "NPC, места совета, поручения",
    hotkey: 4,
    workbench: true,
  },
  {
    id: "diplo",
    label: "Бои",
    hint: "Столкновения на столе. Дипломатия — меню «Стол…»",
    hotkey: null,
    workbench: true,
  },
  {
    id: "intel",
    label: "Разведка",
    hint: "Уровни знания 0–4",
    hotkey: 6,
    workbench: true,
  },
  {
    id: "quests",
    label: "Сессия",
    hint: "Квесты, NPC, дипло, кубики",
    hotkey: 7,
    workbench: true,
  },
  {
    id: "ops",
    label: "Ops",
    hint: "Кисти последствий, таймеры, notes",
    hotkey: 8,
    workbench: true,
  },
  {
    id: "health",
    label: "Здоровье",
    hint: "Тик, бэкапы, store",
    hotkey: 9,
    workbench: true,
  },
];

export function domainByHotkey(n: number): GmDomainDef | undefined {
  return GM_LIVE_DOMAINS.find((d) => d.hotkey != null && d.hotkey === n);
}

export function domainById(id: GmLiveDomainId): GmDomainDef | undefined {
  return GM_LIVE_DOMAINS.find((d) => d.id === id);
}
