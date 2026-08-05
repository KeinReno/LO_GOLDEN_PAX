/**
 * Shared quest-catalog helpers for GM Atelier editors.
 */
import type { DiceSpec, QuestChoice, QuestType } from "../../../state/types";
import type { EffectInstance } from "../../../state/contentCatalog";

export type YearlyQuestDef = {
  id: string;
  name: string;
  summary?: string;
  detail?: string;
  category?: string;
  neutral?: boolean;
  filterBy?: Record<string, unknown>;
  choices?: QuestChoice[];
  diceRequired?: DiceSpec[];
};

export type StoryQuestDef = {
  id: string;
  name: string;
  summary?: string;
  detail?: string;
  kind?: QuestType;
  tags?: string[];
  hasChoices?: boolean;
  choices?: QuestChoice[];
  objectives?: Array<{ id: string; text: string; optional?: boolean }>;
  placement?: {
    onMap?: boolean;
    systemId?: string | null;
    systemPick?: "random_owned" | "fixed" | "none";
  };
  audience?: {
    factionIds?: string[];
    allFactions?: boolean;
    minEra?: number;
  };
  completion?: {
    mode?: "choice" | "objectives" | "manual" | "dice" | "auto";
    expiresTurns?: number | null;
  };
  filterBy?: Record<string, unknown>;
  sourceNpcId?: string | null;
  diceRequired?: DiceSpec[];
  secret?: boolean;
  narrative?: boolean;
  arc?: {
    stages: Array<{
      id: string;
      label: string;
      summary?: string;
      choices?: QuestChoice[];
    }>;
  };
};

export const YEARLY_CATEGORIES = [
  "hunger",
  "revolt",
  "trade",
  "pirates",
  "anomaly",
  "diplo",
  "epidemic",
  "migration",
  "military",
  "science",
  "neutral",
] as const;

export const FILTER_FIELDS: {
  key: string;
  label: string;
  type: "number" | "bool" | "text";
  placeholder?: string;
}[] = [
  { key: "minEra", label: "Мин. эра", type: "number" },
  { key: "maxWarCount", label: "Макс. войн", type: "number" },
  { key: "hasRefugees", label: "Есть беженцы", type: "bool" },
  { key: "borderWithWar", label: "Граница с войной", type: "bool" },
  { key: "requiresRace", label: "Нужна раса", type: "text", placeholder: "race.human" },
  {
    key: "requiresBuilding",
    label: "Нужно здание",
    type: "text",
    placeholder: "building.barracks",
  },
  {
    key: "lowLoyaltyRace",
    label: "Низкая лояльность расы",
    type: "text",
    placeholder: "race.human",
  },
  {
    key: "excludeIfArcActive",
    label: "Исключить если арка",
    type: "text",
    placeholder: "arc.id",
  },
];

export const CURRENCY_OPTIONS = [
  { id: "currency.metal", label: "Металл" },
  { id: "currency.supply", label: "Снабжение" },
  { id: "currency.cognitio", label: "Когнитио" },
  { id: "currency.bios", label: "Биос" },
  { id: "currency.extracta", label: "Экстракта" },
] as const;

export type EffectPreset = {
  id: string;
  label: string;
  defaults: Record<string, unknown>;
};

export const EFFECT_PRESETS: EffectPreset[] = [
  { id: "loyalty_add", label: "Лояльность ±", defaults: { amount: 3 } },
  {
    id: "upkeep_flat",
    label: "Расход ресурса",
    defaults: { resource: "currency.supply", amount: -3 },
  },
  {
    id: "production_flat",
    label: "Доход ресурса",
    defaults: { resource: "currency.metal", amount: 4 },
  },
  { id: "stability_add", label: "Стабильность ±", defaults: { amount: 1 } },
  { id: "ap_add", label: "ОД ±", defaults: { amount: 1 } },
  { id: "grant_tech", label: "Выдать tech", defaults: { techId: "tech.geology" } },
  {
    id: "grant_recipe",
    label: "Выдать рецепт",
    defaults: { recipeId: "recipe.geo_materials" },
  },
  {
    id: "grant_intel",
    label: "Intel",
    defaults: { entityType: "faction", entityId: "", level: 2 },
  },
];

export function emptyChoice(index = 0): QuestChoice {
  return {
    id: `choice_${index + 1}`,
    label: "Новый выбор",
    description: "",
    effects: [],
  };
}

export function emptyYearlyQuest(id = "yq.new_quest"): YearlyQuestDef {
  return {
    id,
    name: "Новый ежходный квест",
    summary: "Краткий hook для игрока.",
    detail: "Развёрнутое описание ситуации и контекста.",
    category: "neutral",
    neutral: true,
    filterBy: {},
    choices: [emptyChoice(0), emptyChoice(1)],
  };
}

export function emptyStoryQuest(id = "sq.new_quest"): StoryQuestDef {
  return {
    id,
    name: "Новый сюжетный квест",
    summary: "Hook для игрока.",
    detail: "Полное описание, канон, контекст.",
    kind: "side",
    hasChoices: true,
    narrative: true,
    secret: false,
    tags: [],
    choices: [emptyChoice(0)],
    objectives: [],
    placement: { onMap: true, systemPick: "random_owned", systemId: null },
    audience: { factionIds: [], allFactions: false, minEra: 1 },
    completion: { mode: "choice", expiresTurns: null },
    filterBy: {},
    sourceNpcId: null,
  };
}

export function slugId(prefix: string, name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 32);
  return `${prefix}.${slug || "new"}`;
}

export function effectsFromPreset(preset: EffectPreset): EffectInstance {
  return { effect: preset.id, args: { ...preset.defaults } };
}
