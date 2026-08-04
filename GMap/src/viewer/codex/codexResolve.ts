import type { PublicContent } from "../../state/contentCatalog";
import { getCachedContent } from "../../state/contentCatalog";
import {
  buildingKindLabel,
  buildingZoneLabel,
  economyCategoryLabel,
} from "../../state/displayLabels";
import type { IntelEntityType, ViewerPayload } from "../../state/types";
import { COMBAT_ROLE_LABELS } from "../forces/constants";

export const INTEL_ENTITY_TYPE_LABELS: Record<IntelEntityType, string> = {
  race: "Раса",
  faction: "Государство",
  tech: "Технология",
  building: "Постройка",
  unit: "Юнит",
};

const INTEL_SOURCE_LABELS: Record<string, string> = {
  fleet: "Флот",
  legion: "Легион",
  blockade: "Блокада",
  scout: "Разведка",
  diplomacy: "Дипломатия",
  espionage: "Шпионаж",
  trade: "Торговля",
  trade_agreement: "Торговый договор",
  quest: "Квест",
  gm: "Мастер",
  own: "Свои данные",
};

const RACE_KIND_LABELS: Record<string, string> = {
  race: "Раса",
  subrace: "Подраса",
};

/** Last segment of trait.* ids → readable Russian (content has no trait names). */
const TRAIT_SLUG_LABELS: Record<string, string> = {
  adaptable: "Адаптивность",
  cosmopolitan: "Космополитизм",
  restless: "Беспокойство",
  traders: "Торговая жилка",
  discipline: "Дисциплина",
  militarist_loyalty: "Военная лояльность",
  honor_bound: "Кодекс чести",
  attrition: "Истощение",
  efficient: "Эффективность",
  logistics_independent: "Автономная логистика",
  fragile_shell: "Хрупкая оболочка",
  cold_logic: "Холодная логика",
  stoneborn: "Каменнорождённые",
  miners: "Шахтёры",
  slow_to_trust: "Медленное доверие",
  heavy: "Тяжёлые",
  mindlance: "Ментальный луч",
  foresight: "Предвидение",
  empath: "Эмпат",
  overstimulated: "Перевозбуждение",
  prolific: "Плодовитость",
  hive_mind: "Рой",
  expendable: "Расходуемые",
  hungry: "Голод",
  vacuum_native: "Дети вакуума",
  jump_sense: "Чутьё на прыжки",
  isolationist: "Изоляционизм",
  thin_blood: "Тонкая кровь",
  solarit_affinity: "Соларитовая связь",
  blumatit_hunger: "Жажда блюматита",
  incorporeal: "Бестелесность",
  brunnatit_bound: "Связь с бруннатитом",
  stoic: "Стоицизм",
  thick_hide: "Толстая шкура",
  proud: "Гордость",
  scholars: "Учёные",
  courtly: "Придворные",
  contracts: "Контракты",
  ledger_bound: "Учётная книга",
};

export function intelEntityTypeLabel(type: IntelEntityType): string {
  return INTEL_ENTITY_TYPE_LABELS[type] ?? type;
}

export function intelSourceLabel(source: string): string {
  return INTEL_SOURCE_LABELS[source] ?? source;
}

export function raceKindLabel(kind: string | undefined): string {
  if (!kind) return "Раса";
  return RACE_KIND_LABELS[kind] ?? kind;
}

export function traitLabel(traitId: string, content?: PublicContent | null): string {
  const c = content ?? getCachedContent();
  const fromFaction = c?.faction_traits?.traits?.[traitId]?.name;
  if (fromFaction) return fromFaction;
  const tail = traitId.split(".").pop() ?? traitId;
  return TRAIT_SLUG_LABELS[tail] ?? tail.replace(/_/g, " ");
}

export function shipRoleLabel(role: string | undefined): string {
  if (!role) return "—";
  return COMBAT_ROLE_LABELS[role] ?? role;
}

export { buildingKindLabel, buildingZoneLabel, economyCategoryLabel };

export {
  cultureLabel,
  faithLabel,
  ideologyLabel,
} from "../../state/displayLabels";

export function resolveBuildingDef(
  content: PublicContent | null | undefined,
  id: string,
) {
  const buildings = content?.buildings ?? {};
  if (buildings[id]) return buildings[id];
  const withPrefix = id.startsWith("building.") ? id : `building.${id}`;
  if (buildings[withPrefix]) return buildings[withPrefix];
  const kindGuess = id.replace(/^building\./, "");
  return Object.values(buildings).find(
    (b) => b.id === id || b.id === withPrefix || b.kind === kindGuess,
  );
}

export function resolveIntelEntityName(
  payload: ViewerPayload,
  entityType: IntelEntityType,
  entityId: string,
): string {
  const content = getCachedContent();
  if (entityType === "faction") {
    const fac = payload.world.factions.find((f) => f.id === entityId);
    return fac?.name ?? entityId;
  }
  if (entityType === "race") {
    return content?.races?.[entityId]?.name ?? entityId;
  }
  if (entityType === "tech") {
    return content?.technologies?.[entityId]?.name ?? entityId;
  }
  if (entityType === "building") {
    const def = resolveBuildingDef(content, entityId);
    return def?.name ?? buildingKindLabel(def?.kind) ?? entityId.replace(/^building\./, "");
  }
  if (entityType === "unit") {
    const ships = content?.ships ?? {};
    const units = content?.units ?? {};
    const def = ships[entityId] ?? units[entityId];
    if (def?.name) return def.name;
    const withPrefix = entityId.startsWith("ship.") ? entityId : `ship.${entityId}`;
    return ships[withPrefix]?.name ?? units[withPrefix]?.name ?? entityId;
  }
  return entityId;
}
