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
      return "Лоты · котировки · валюты · державы. Alt+1–4.";
    case "research":
      return "Колесо наук · 6 категорий. Ветви — Alt+1–6.";
    case "economy":
      return "Казна · производство · бюджет · склад · налоги. Вкладки — в панели.";
    case "forces":
      return "Состав, оснащение, готовность. Приказы — на карте.";
    case "quests":
      return "Сюжет · сайды · фракции · ежеходные. СКМ — перевернуть карту.";
    case "court":
      return "Совет, поле, народы, дома. Вкладки 1–4.";
    case "codex":
      return "Расы · государства · постройки · юниты · технологии — по уровню знания.";
    default:
      return undefined;
  }
}
