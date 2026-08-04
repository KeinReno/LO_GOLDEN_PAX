/** Human-readable UI labels for ids / slugs (viewer + codex). */
import { getCachedContent } from "./contentCatalog";
import { categoryDisplayName } from "./economyLabels";
import { getCulture, getFaith } from "./societyRegistry";
import {
  PLANET_BUILDING_KIND_LABELS,
  STATION_KIND_LABELS,
  SYSTEM_POI_LABELS,
} from "./defaults";

export const PLANET_BUILDING_ZONE_LABELS: Record<string, string> = {
  surface: "Поверхность",
  subsurface: "Недра",
  deep: "Глубина",
  orbital: "Орбита",
};

export const SPACE_OBJECT_KIND_LABELS: Record<string, string> = {
  anomaly: "Аномалия",
  field: "Поле",
  nebula: "Туманность",
  threat: "Угроза",
  structure: "Сооружение",
  leviathan: "Левиафан",
};

export const QUEST_HISTORY_KIND_LABELS: Record<string, string> = {
  message: "Сообщение",
  choice: "Выбор",
  dice: "Бросок",
  stage_change: "Этап",
  reward: "Награда",
};

export const QUEST_EFFECT_KIND_LABELS: Record<string, string> = {
  resource: "Ресурс",
  buff: "Бонус",
  debuff: "Штраф",
  population: "Население",
  army: "Армия",
  fleet: "Флот",
  loyalty: "Лояльность",
};

/** Matches server ledger EXPLAIN_CATEGORY_LABELS. */
export const EXPLAIN_CATEGORY_LABELS: Record<string, string> = {
  income: "Доход",
  upkeep: "Содержание",
  tax: "Налоги",
  race: "Расы",
  deficit: "Дефицит",
  other: "Прочее",
};

export function explainCategoryLabel(category: string): string {
  return EXPLAIN_CATEGORY_LABELS[category] ?? category;
}

/** Faction trait / polity ideology slugs (faction_traits.json). */
export const IDEOLOGY_LABELS: Record<string, string> = {
  militarist: "Милитаризм",
  technocrat: "Технократия",
  trader: "Торговля",
  puritan: "Пуританизм",
  expansionist: "Экспансия",
  isolationist: "Изоляционизм",
  cosmopolitan: "Космополитизм",
  swarm: "Рой",
};

export function ideologyLabel(slug: string | undefined): string {
  if (!slug) return "—";
  return IDEOLOGY_LABELS[slug] ?? slug.replace(/_/g, " ");
}

export function cultureLabel(id: string | undefined): string {
  if (!id) return "—";
  return (
    getCulture(id)?.name ??
    id.replace(/^culture\./, "").replace(/_/g, " ")
  );
}

export function faithLabel(id: string | undefined): string {
  if (!id) return "—";
  return getFaith(id)?.name ?? id.replace(/^faith\./, "").replace(/_/g, " ");
}

export function resourcePropertyLabel(id: string): string {
  const props = getCachedContent()?.economy_schema?.properties;
  const fromSchema = props?.[id]?.label;
  if (fromSchema) return fromSchema;
  return id.replace(/_/g, " ");
}

/** Ship/unit def id → catalog name. */
export function resolveShipOrUnitName(defId: string): string {
  const content = getCachedContent();
  const ships = content?.ships ?? {};
  const units = content?.units ?? {};
  if (ships[defId]?.name) return ships[defId].name!;
  if (units[defId]?.name) return units[defId].name!;
  const shipKey = defId.startsWith("ship.") ? defId : `ship.${defId}`;
  const unitKey = defId.startsWith("unit.") ? defId : `unit.${defId}`;
  return (
    ships[shipKey]?.name ??
    units[unitKey]?.name ??
    defId.replace(/^(ship|unit)\./, "")
  );
}

export function formatSlotRequire(req: {
  category?: string;
  tier?: string;
  properties?: string[];
}): string {
  const parts: string[] = [];
  if (req.category) parts.push(economyCategoryLabel(req.category));
  if (req.tier) parts.push(`T${req.tier.replace(/^>=/, "≥")}`);
  if (req.properties?.length) {
    parts.push(req.properties.map(resourcePropertyLabel).join("/"));
  }
  return parts.join(" · ") || "любой";
}

export const SYSTEM_KIND_LABELS: Record<string, string> = {
  stellar: "Звёздная система",
  corridor: "Коридор / врата",
};

export const NPC_ROLE_LABELS: Record<string, string> = {
  ruler: "Правитель",
  priest: "Жрец",
  strategist: "Стратег",
  architect: "Архитектор",
  agent: "Агент",
  other: "Прочее",
};

export const OPS_TICK_ALERT_KIND_LABELS: Record<string, string> = {
  miss: "Пропуск тика",
  catchup_fail: "Ошибка catch-up",
  catchup_ok: "Catch-up OK",
  cron_fail: "Ошибка cron-тика",
  backup_fail: "Ошибка бэкапа",
};

export const BACKUP_REASON_LABELS: Record<string, string> = {
  manual: "Вручную",
  cron: "По расписанию",
  boot: "При старте",
};

export const ECONOMY_DEFICIT_LABELS: Record<string, string> = {
  ok: "норма",
  empty: "пустая казна",
  low: "низкие запасы",
};

export function systemKindLabel(kind: string | undefined): string {
  if (!kind) return "—";
  return SYSTEM_KIND_LABELS[kind] ?? kind;
}

export function npcRoleLabel(role: string | undefined): string {
  if (!role) return "—";
  return NPC_ROLE_LABELS[role] ?? role;
}

export function opsTickAlertKindLabel(kind: string): string {
  return OPS_TICK_ALERT_KIND_LABELS[kind] ?? kind;
}

export function backupReasonLabel(reason: string | undefined): string {
  if (!reason) return "—";
  return BACKUP_REASON_LABELS[reason] ?? reason.replace(/_/g, " ");
}

export function economyDeficitLabel(deficit: string | undefined): string {
  if (!deficit) return "—";
  return ECONOMY_DEFICIT_LABELS[deficit] ?? deficit;
}

export function buildingKindLabel(kind: string | undefined): string {
  if (!kind) return "Постройка";
  return PLANET_BUILDING_KIND_LABELS[kind] ?? kind;
}

export function buildingZoneLabel(zone: string | undefined): string {
  if (!zone) return "—";
  return PLANET_BUILDING_ZONE_LABELS[zone] ?? zone;
}

export function stationKindLabel(kind: string | undefined): string {
  if (!kind) return "—";
  return STATION_KIND_LABELS[kind] ?? kind;
}

export function spaceObjectKindLabel(kind: string | undefined): string {
  if (!kind) return "—";
  return (
    SPACE_OBJECT_KIND_LABELS[kind] ??
    SYSTEM_POI_LABELS[kind] ??
    kind
  );
}

export function economyCategoryLabel(cat: string | undefined): string {
  if (!cat) return "—";
  return categoryDisplayName(cat);
}

/** Map resource id, currency id, or raw slug → display name. */
export function resolveResourceOrCurrencyLabel(
  id: string,
  localNames?: Record<string, string>,
): string {
  if (!id) return "—";
  const local = localNames?.[id];
  if (local) return local;
  if (id.startsWith("currency.")) {
    return categoryDisplayName(id);
  }
  const fromCatalog = getCachedContent()?.map_resources?.[id]?.name;
  if (fromCatalog) return fromCatalog;
  return id.replace(/^map\./, "");
}
