import type { EconomySchema } from "./contentCatalog";
import { fmtInt } from "./numberFormat";

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
    role: "Энергия, топливо, орудийные компоненты",
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
