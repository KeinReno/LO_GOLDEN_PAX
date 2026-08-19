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
    case "planet":
      return "Планета";
    case "rp":
      return "Сцена";
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
      return "Слева и справа — разделы. Карты внизу после выбора. Центр — стол.";
    case "market":
      return "Лоты · котировки · валюты · державы. Alt+1–4.";
    case "research":
      return "Колесо наук · 6 категорий. Ветви — Alt+1–6.";
    case "economy":
      return "Казна · производство · бюджет · склад · налоги. Вкладки — в панели.";
    case "forces":
      return "Конструктор оснащения. Приказы — на карте.";
    case "quests":
      return "Что сделать в этот ход. Сцена с мастером — R.";
    case "court":
      return "Совет, поле, народы, дома. Вкладки 1–4.";
    case "codex":
      return "Расы · государства · постройки · юниты · технологии — по уровню знания.";
    case "planet":
      return "Сейчас этот ход · слот · почему нельзя. Док 1–5 не перекрыт.";
    case "rp":
      return "Слева — сцены. Внизу жесты и кубики после выбора.";
    default:
      return undefined;
  }
}
