import type { EconomySchema, MapResourceDef } from "./contentCatalog";
import { getCachedContent } from "./contentCatalog";
import { fmtInt } from "./numberFormat";
import { isMapDeposit, lookupContentResource } from "./resourceIndex";

/** Legacy build currencies — spent on construction, colonization, fleets. */
export const BUILD_METAL = {
  id: "currency.metal",
  short: "M",
  label: "Металл",
} as const;

export const BUILD_SUPPLY = {
  id: "currency.supply",
  short: "S",
  label: "Обеспечение",
} as const;

/** Primary A–F category currencies — Russian UI labels (ids stay Latin). */
export const CATEGORY_CURRENCIES = [
  {
    id: "currency.extracta",
    letter: "A",
    short: "A",
    name: "Сырьё",
    role: "Добыча сырья из недр",
    cssVar: "var(--eco-cat-a)",
  },
  {
    id: "currency.materia",
    letter: "B",
    short: "B",
    name: "Материалы",
    role: "Переработанные материалы и сплавы",
    cssVar: "var(--eco-cat-b)",
  },
  {
    id: "currency.industria",
    letter: "C",
    short: "C",
    name: "Промышленность",
    role: "Производственная мощность",
    cssVar: "var(--eco-cat-c)",
  },
  {
    id: "currency.energia",
    letter: "D",
    short: "D",
    name: "Энергия",
    role: "Энергия и топливо",
    cssVar: "var(--eco-cat-d)",
  },
  {
    id: "currency.bios",
    letter: "E",
    short: "E",
    name: "Биомасса",
    role: "Еда, биомасса, население, мораль",
    cssVar: "var(--eco-cat-e)",
  },
  {
    id: "currency.cognitio",
    letter: "F",
    short: "F",
    name: "Знание",
    role: "Наука, реликты, псионика, аномалии",
    cssVar: "var(--eco-cat-f)",
  },
] as const;

export type CategoryCurrency = (typeof CATEGORY_CURRENCIES)[number];

/** Category + legacy build currencies (static). Strategic map.* added via stockpileCardIds(). */
export const STOCKPILE_CARD_IDS: string[] = [
  BUILD_METAL.id,
  BUILD_SUPPLY.id,
  ...CATEGORY_CURRENCIES.map((c) => c.id),
];

/** Strategic resource ids from economy_schema.resource_ranks (+ rank on defs). Content-driven. */
export function listStrategicResourceIds(
  schema?: EconomySchema | null,
  mapResources?: Record<string, MapResourceDef> | null,
): string[] {
  const c = getCachedContent();
  const schemaIds = schema?.resource_ranks?.strategic
    ?? c?.economy_schema?.resource_ranks?.strategic
    ?? [];
  const ids = new Set<string>(schemaIds.filter(Boolean));
  const resources = mapResources ?? c?.map_resources ?? {};
  for (const def of Object.values(resources)) {
    if (def?.rank === "strategic" && def.id && isMapDeposit(def)) ids.add(def.id);
  }
  return [...ids];
}

/** Display name for map.* / currency id — never hardcode faction resources. */
export function resourceDisplayName(resourceId: string): string {
  if (!resourceId) return "—";
  const cat = BY_ID[resourceId];
  if (cat) return cat.name;
  if (resourceId === BUILD_METAL.id) return BUILD_METAL.label;
  if (resourceId === BUILD_SUPPLY.id) return BUILD_SUPPLY.label;
  const def = lookupContentResource(getCachedContent(), resourceId);
  if (def?.name) return def.name;
  return resourceId.replace(/^map\./, "").replace(/^currency\./, "");
}

/** Full accept list for stockpile drag/drop (categories + strategic). */
export function stockpileCardIds(): string[] {
  return [...new Set([...STOCKPILE_CARD_IDS, ...listStrategicResourceIds()])];
}

const BY_ID: Record<string, CategoryCurrency> = Object.fromEntries(
  CATEGORY_CURRENCIES.map((c) => [c.id, c]),
) as Record<string, CategoryCurrency>;

const BY_LETTER: Record<string, CategoryCurrency> = Object.fromEntries(
  CATEGORY_CURRENCIES.map((c) => [c.letter, c]),
) as Record<string, CategoryCurrency>;

export function categoryById(id: string): CategoryCurrency | undefined {
  return BY_ID[id];
}

export function categoryByLetter(letter: string): CategoryCurrency | undefined {
  return BY_LETTER[letter];
}

/** Russian name for category currency id or letter A–F. */
export function categoryDisplayName(idOrLetter: string): string {
  return (
    BY_ID[idOrLetter]?.name ??
    BY_LETTER[idOrLetter]?.name ??
    idOrLetter
  );
}

/** Compact player-facing cost line (no M24 / S6 jargon). */
export function formatPlayerCost(cost?: Record<string, number>): string {
  if (!cost) return "—";
  const parts: string[] = [];
  const metal = cost[BUILD_METAL.id];
  const supply = cost[BUILD_SUPPLY.id];
  if (metal) parts.push(`мет. ${fmtInt(metal)}`);
  if (supply) parts.push(`снаб. ${fmtInt(supply)}`);
  for (const [id, amount] of Object.entries(cost)) {
    if (id === BUILD_METAL.id || id === BUILD_SUPPLY.id || !amount) continue;
    const cat = BY_ID[id];
    if (cat) parts.push(`${cat.name} ${fmtInt(amount)}`);
    else parts.push(`${id.replace(/^currency\./, "")} ${fmtInt(amount)}`);
  }
  return parts.join(" · ") || "—";
}

/** Metal + supply treasury snippet for HUD / menus. */
export function formatPlayerTreasury(metal: number, supply: number): string {
  return `мет. ${fmtInt(metal)} · снаб. ${fmtInt(supply)}`;
}

/** Letter badge with Russian name (tooltips, hints). */
export function categoryLetterCaption(letter: string): string {
  const c = BY_LETTER[letter];
  return c ? `${letter} — ${c.name}` : letter;
}

/** Format build/colonize cost: M/S with Russian labels + optional category-currency lines. */
export function formatBuildCost(cost?: Record<string, number>): string {
  return formatPlayerCost(cost);
}

/** Compact treasury line for planet build UI. */
export function formatBuildTreasury(metal: number, supply: number): string {
  return formatPlayerTreasury(metal, supply);
}

/** One-line bridge hint from economy_schema legacy_bridge, or a generic fallback. */
export function legacyBridgeHint(schema?: EconomySchema | null): string {
  const mapping = schema?.legacy_bridge?.mapping;
  if (mapping?.["currency.metal"] && mapping?.["currency.supply"]) {
    return (
      `Строительная казна — для стройки и флота. ` +
      `Примерный обмен: металл ≈ ${mapping["currency.metal"]}, ` +
      `снабжение ≈ ${mapping["currency.supply"]}. ` +
      `Шесть категорий ниже — производство и наука.`
    );
  }
  return (
    "Металл и снабжение — на стройку и флот. " +
    "Шесть категорий ниже (от сырья до знания) — на производство и науку."
  );
}
