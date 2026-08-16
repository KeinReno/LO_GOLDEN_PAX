import type { PlayerView } from "./viewerNavTypes";

export function viewerRoomTitle(viewMode: PlayerView): string {
  switch (viewMode) {
    case "hq":
      return "Штаб";
    case "forces":
      return "Силы";
    case "research":
      return "Наука";
    case "economy":
      return "Экономика";
    case "market":
      return "Биржа";
    case "diplomacy":
      return "Дипломатия";
    case "quests":
      return "Квесты";
    case "court":
      return "Двор";
    case "codex":
      return "Справочник";
    case "rp":
      return "RP";
    default:
      return "Штаб";
  }
}

export function viewerWorkbenchSubtitle(
  viewMode: PlayerView,
): string | undefined {
  switch (viewMode) {
    case "hq":
      return "Сводка и внимание. Приказы — на карте (drag / ПКМ / кольцо).";
    case "diplomacy":
      return "Сделки — по согласию. Война и разрыв — сразу, без ответа.";
    case "market":
      return "Стакан · котировки · валюты · державы. Alt+1–4.";
    case "research":
      return "Колесо наук · 6 категорий · ветви 1–6.";
    case "economy":
      return "Казна · производство · бюджет · склад · налоги. Клавиши 1–5.";
    case "forces":
      return "Флоты, легионы и каталог юнитов со статами.";
    case "quests":
      return "Сюжет · сайды · фракции · ежеходные. СКМ — перевернуть карту.";
    case "court":
      return "Кадровый совет · поручения · губернаторы · командующие · флотоводцы.";
    case "codex":
      return "Расы · государства · постройки · юниты · технологии — по уровню знания.";
    default:
      return undefined;
  }
}
