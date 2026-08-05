import {
  CATEGORY_CURRENCIES,
  categoryByLetter,
  categoryDisplayName,
} from "../../state/economyLabels";

/** Letter A–F → «Сырьё (A)». */
export function categoryFilterLabel(letter: string): string {
  const cat = categoryByLetter(letter);
  return cat ? `${cat.name} (${letter})` : letter;
}

export function categoryNameOnly(letter: string): string {
  return categoryByLetter(letter)?.name ?? categoryDisplayName(letter);
}

export const TAX_TIER_LABELS: Record<string, string> = {
  none: "0%",
  low: "10%",
  mid: "20%",
  high: "35%",
};

export function taxTierLabel(tierId: string): string {
  return TAX_TIER_LABELS[tierId] ?? tierId;
}

export const DOCTRINE_LABELS: Record<string, string> = {
  military: "Военная экономика",
  trade: "Торговая экспансия",
  growth: "Мирный рост",
};

/** Blocks economy digit hotkeys while interacting with controls. */
export function isEconomyInteractionTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return Boolean(
    el.closest(
      ".eco-tax-strip, .eco-stock-card, .eco-prod-row, .eco-doctrine-modal, .action-ring, .eco-rps, .eco-donut-legend__btn, .eco-timeline, .eco-flow-bars__row, .eco-budget-filters",
    ),
  );
}

export const CATEGORY_LEGEND = CATEGORY_CURRENCIES.map(
  (c) => `${c.letter} ${c.name}`,
).join(" · ");
