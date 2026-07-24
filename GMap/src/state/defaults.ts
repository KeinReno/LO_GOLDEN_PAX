import type { Faction, Race, WorldState } from "./types";

export const SCHEMA_VERSION = 9;

/** Master token for publish API (change in production). */
export const DEFAULT_MASTER_TOKEN = "master2142";

export const SHIP_TYPES = [
  "корвет",
  "фрегат",
  "крейсер",
  "линкор",
  "носитель",
  "транспорт",
];

export const FLEET_KIND_LABELS: Record<string, string> = {
  combat: "Боевой",
  trade: "Торговый",
  patrol: "Патруль",
  transport: "Транспорт",
  carrier: "Носитель",
  support: "Поддержка",
};

export const FLEET_STANCE_LABELS: Record<string, string> = {
  idle: "Ожидание",
  attack: "Атака",
  defend: "Оборона",
  move: "Перемещение",
  repair: "Ремонт",
  blockade: "Блокада",
  fortify: "Укрепление",
};

/** Animated order-arrow colours by intent / stance. */
export const ORDER_ARROW_COLORS: Record<string, number> = {
  attack: 0xe85d4c,
  assault: 0xe85d4c,
  move: 0x4cc9f0,
  defend: 0x5cdb95,
  fortify: 0x3dcea8,
  garrison: 0x5cdb95,
  blockade: 0xe8a54c,
  repair: 0x9b6bff,
  idle: 0xc9a227,
  recovering: 0x7a9bb8,
};

export const SYSTEM_ACTIVITY_LABELS: Record<string, string> = {
  none: "Спокойствие",
  battle: "Бой",
  trade: "Торговля",
  repair: "Ремонт / док",
  garrison: "Гарнизон",
  transit: "Транзит",
};

export const SYSTEM_POI_LABELS: Record<string, string> = {
  none: "Обычная",
  anomaly: "Аномалия",
  asteroid: "Астероидное поле",
  nebula: "Туманность",
  debris: "Обломки / поле мусора",
  pirate: "Пиратское логово",
  hub: "Хаб / вольный порт",
  ruin: "Руины / мёртвый мир",
  dead_zone: "Мёртвая зона сканеров",
  quest: "Квест / задание",
  minefield: "Минное поле",
  relay: "Релей / маяк",
  storm: "Ионный шторм",
  wormhole: "Червоточина",
  black_hole: "Чёрная дыра",
  comet: "Комета / рой комет",
  pulsar: "Пульсар",
  shipyard: "Верфь",
  outpost: "Форпост",
  fortress: "Крепость",
  beacon: "Маяк / навигатор",
  sanctuary: "Убежище / святилище",
  refugees: "Лагерь беженцев",
  quarantine: "Карантин / пси-карантин",
  depot: "Депо снабжения",
  propaganda: "Пропаганда-вышка",
  frontline: "Линия фронта",
  forge: "Кузница",
};

export const LINK_TYPE_LABELS: Record<string, string> = {
  corridor: "Коридор",
  gate: "Врата",
  unstable: "Нестабильный",
  damyl_space: "Дамильские космические (флот)",
  damyl_planet: "Дамильские межпланетные (пехота)",
};

export const DIPLOMACY_LABELS: Record<string, string> = {
  neutral: "Нейтралитет",
  alliance: "Союз",
  trade: "Торговый договор",
  war: "Война",
  vassal: "Вассалитет",
  truce: "Перемирие",
};

export const LEGION_STATUS_LABELS: Record<string, string> = {
  idle: "Ожидание",
  garrison: "Гарнизон",
  assault: "Штурм",
  recovering: "Восстановление",
  move: "Марш",
  blockade: "Блокада",
  fortify: "Укрепление",
};

export const DEFAULT_RACES: Race[] = [
  { id: "race_human", name: "Люди" },
  { id: "race_belator", name: "Белаторцы" },
  { id: "race_synth", name: "Синты" },
];

export const DEFAULT_FACTIONS: Faction[] = [
  {
    id: "faction_a",
    name: "Государство А",
    color: "#3d8bfd",
    password: "2142",
    kind: "state",
  },
  {
    id: "faction_b",
    name: "Государство Б",
    color: "#e85d4c",
    password: "5831",
    kind: "state",
  },
  {
    id: "faction_c",
    name: "Государство В",
    color: "#5cdb95",
    password: "9074",
    kind: "state",
  },
];

export function createEmptyWorld(name = "Новая кампания"): WorldState {
  const now = new Date().toISOString();
  return {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      name,
      turn: 0,
      createdAt: now,
      updatedAt: now,
      width: 4000,
      height: 3000,
    },
    systems: [],
    links: [],
    sectors: [],
    factions: structuredClone(DEFAULT_FACTIONS),
    races: structuredClone(DEFAULT_RACES),
    fleets: [],
    legions: [],
    diplomacy: [],
    orders: [],
    turnHistory: [],
    caravans: [],
    quests: [],
  };
}

export const STAR_CLASS_LABELS: Record<string, string> = {
  O: "O — голубой гигант",
  B: "B — бело-голубая",
  A: "A — белая",
  F: "F — жёлто-белая",
  G: "G — жёлтая (солнцеподобная)",
  K: "K — оранжевая",
  M: "M — красный карлик",
};

export const PLANET_TYPE_LABELS: Record<string, string> = {
  rocky: "Скалистая",
  gas: "Газовый гигант",
  ice: "Ледяная",
  desert: "Пустынная",
  ocean: "Океаническая",
  toxic: "Токсичная",
  artifact: "Артефактная",
};

export const CLIMATE_LABELS: Record<string, string> = {
  frozen: "Ледяной",
  cold: "Холодный",
  temperate: "Умеренный",
  hot: "Жаркий",
  infernal: "Пекло",
  tidal_locked: "Приливно захваченная",
};

export const COLONY_TYPE_LABELS: Record<string, string> = {
  none: "Нет колонии",
  outpost: "Форпост",
  colony: "Колония",
  core: "Мир-ядро",
  fortress: "Крепость",
  mining: "Добыча",
  research: "Исследовательский",
};

export const PLANET_BUILDING_KIND_LABELS: Record<string, string> = {
  residential: "Жилой район",
  farm: "Агрокомплекс",
  mine: "Шахта",
  factory: "Завод",
  lab: "Лаборатория",
  barracks: "Казарма",
  capitol: "Администрация",
  defense: "Оборона",
  spaceport: "Космопорт",
  shipyard: "Верфь",
  habitat: "Орбитальный хабитат",
  custom: "Особое",
};

export const RESOURCE_POOL = [
  "железо",
  "титан",
  "кристаллы",
  "газ",
  "вода",
  "редкоземы",
  "антиматерия",
  "реликты",
];

export const STATION_KIND_LABELS: Record<string, string> = {
  science: "Научная станция",
  mining: "Добывающая",
  military: "Военная база",
  trade: "Торговый хаб",
  relay: "Релей / маяк",
};
