/** Player-facing currency names. Ids stay Latin in data. No catalog import. */

const CURRENCY_UI_LABELS: Record<string, string> = {
  "currency.metal": "Металл",
  "currency.supply": "Обеспечение",
  "currency.extracta": "Сырьё",
  "currency.materia": "Материалы",
  "currency.industria": "Промышленность",
  "currency.energia": "Энергия",
  "currency.bios": "Биомасса",
  "currency.cognitio": "Знание",
};

export function staticCurrencyLabel(resourceId: string): string {
  if (!resourceId) return "ресурс";
  const full = resourceId.includes(".")
    ? resourceId
    : `currency.${resourceId}`;
  return (
    CURRENCY_UI_LABELS[full] ??
    resourceId.replace(/^map\./, "").replace(/^currency\./, "")
  );
}
