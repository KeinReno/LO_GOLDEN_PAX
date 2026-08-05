/**
 * Live GM domain registry — F1–F9 workbench slots.
 * Inbox (F1) focuses the right dock; other domains open one workbench.
 */
import type { GmLiveDomainId } from "../../state/types";

export type { GmLiveDomainId };

export type GmDomainDef = {
  id: GmLiveDomainId;
  label: string;
  hint: string;
  /** Keyboard digit after F, 1–9 */
  hotkey: number;
  /** Opens FloatingPanel workbench (false = dock/overlay only). */
  workbench: boolean;
};

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
    label: "Наука",
    hint: "Технологии, очередь, алхимия",
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
    label: "Дипло · бой",
    hint: "Отношения, офферы, engagements",
    hotkey: 5,
    workbench: true,
  },
  {
    id: "intel",
    label: "Intel",
    hint: "Уровни знания 0–4",
    hotkey: 6,
    workbench: true,
  },
  {
    id: "quests",
    label: "Квесты",
    hint: "Yearly, статусы, Attention",
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
  return GM_LIVE_DOMAINS.find((d) => d.hotkey === n);
}

export function domainById(id: GmLiveDomainId): GmDomainDef | undefined {
  return GM_LIVE_DOMAINS.find((d) => d.id === id);
}
