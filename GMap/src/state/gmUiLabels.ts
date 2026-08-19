/** GM workshop display names — ids stay Latin in data. */

export const RACE_TAG_LABELS: Record<string, string> = {
  baseline: "Базовая",
  adaptable: "Приспособляемые",
  synthetic: "Синтеты",
  cybernetic: "Кибернетика",
  swarm: "Рой",
  lithoid: "Литоиды",
  aquatic: "Водные",
  psionic: "Псионика",
  nomadic: "Кочевники",
  agrarian: "Земледельцы",
  subterranean: "Подземные",
  exotic: "Экзотика",
};

export function raceTagLabel(tag: string): string {
  return RACE_TAG_LABELS[tag] ?? tag;
}

export const COMBAT_STAT_LABELS: Record<string, string> = {
  damage: "Урон",
  defense: "Броня",
  armor: "Броня",
  hp: "Прочность",
  shields: "Щиты",
  speed: "Скорость",
};

export function combatStatLabel(stat: string): string {
  return COMBAT_STAT_LABELS[stat] ?? stat;
}

export const YEARLY_CATEGORY_LABELS: Record<string, string> = {
  hunger: "Голод",
  revolt: "Бунт",
  trade: "Торговля",
  pirates: "Пираты",
  anomaly: "Аномалия",
  diplo: "Дипломатия",
  epidemic: "Эпидемия",
  migration: "Миграция",
  military: "Война",
  science: "Наука",
  neutral: "Нейтральный",
};

export function yearlyCategoryLabel(id: string): string {
  return YEARLY_CATEGORY_LABELS[id] ?? id;
}

export const COURT_ROLE_LABELS: Record<string, string> = {
  ruler: "Правитель",
  strategist: "Стратег",
  architect: "Зодчий",
  priest: "Жрец",
  agent: "Агент",
  warlord: "Воевода",
  other: "Прочее",
};

export function courtRoleLabel(id: string): string {
  return COURT_ROLE_LABELS[id] ?? id;
}

export const COMBAT_ROLE_LABELS: Record<string, string> = {
  screen: "Заслон / разведка",
  capital: "Линкор",
  carrier: "Авианосец",
  infantry: "Пехота",
  armor: "Бронетехника",
  siege: "Осада",
  titan: "Титан",
  strike: "Удар",
  support: "Поддержка",
};

export function combatRoleLabel(id: string): string {
  return COMBAT_ROLE_LABELS[id] ?? id;
}

export const PATH_LABELS: Record<string, string> = {
  offensive: "Путь удара",
  defensive: "Путь защиты",
  mobility: "Путь мобильности",
  cognitive: "Путь знания",
  biological: "Путь биологии",
  exotic: "Путь экзотики",
  structural: "Путь структуры",
  energy: "Путь энергии",
};

export function pathLabel(id: string): string {
  return PATH_LABELS[id] ?? id;
}
