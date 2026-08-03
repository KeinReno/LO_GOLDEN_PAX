import type { EconomySchema } from "./contentCatalog";

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

const CATEGORY_CURRENCY: Record<string, { short: string; name: string }> =
  Object.fromEntries(
    CATEGORY_CURRENCIES.map((c) => [c.id, { short: c.short, name: c.name }]),
  );

/** Format build/colonize cost: M/S with Russian labels + optional category-currency lines. */
export function formatBuildCost(cost?: Record<string, number>): string {
  if (!cost) return "—";
  const parts: string[] = [];
  const metal = cost[BUILD_METAL.id];
  const supply = cost[BUILD_SUPPLY.id];
  if (metal) parts.push(`${BUILD_METAL.label} (${BUILD_METAL.short}) ${metal}`);
  if (supply) parts.push(`${BUILD_SUPPLY.label} (${BUILD_SUPPLY.short}) ${supply}`);
  for (const [id, amount] of Object.entries(cost)) {
    if (id === BUILD_METAL.id || id === BUILD_SUPPLY.id || !amount) continue;
    const meta = CATEGORY_CURRENCY[id];
    if (meta) parts.push(`${meta.name} (${meta.short}) ${amount}`);
    else parts.push(`${id.replace(/^currency\./, "")} ${amount}`);
  }
  return parts.join(" · ") || "—";
}

/** Compact treasury line for planet build UI. */
export function formatBuildTreasury(metal: number, supply: number): string {
  return `${BUILD_METAL.label} (${BUILD_METAL.short}) ${metal} · ${BUILD_SUPPLY.label} (${BUILD_SUPPLY.short}) ${supply}`;
}

/** One-line bridge hint from economy_schema legacy_bridge, or a generic fallback. */
export function legacyBridgeHint(schema?: EconomySchema | null): string {
  const mapping = schema?.legacy_bridge?.mapping;
  if (mapping?.["currency.metal"] && mapping?.["currency.supply"]) {
    return (
      `Строительная казна (M/S) — для стройки и флота. ` +
      `M ≈ ${mapping["currency.metal"]}, S ≈ ${mapping["currency.supply"]}. ` +
      `Категории A–F выше — потоки и исследования.`
    );
  }
  return (
    "Строительная казна (M/S) тратится на стройку и флот; " +
    "категории A–F — потоки ресурсов и исследования."
  );
}
