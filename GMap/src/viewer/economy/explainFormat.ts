import { fmt1 } from "../../state/numberFormat";

const CHANNEL_LABELS: Record<string, string> = {
  "tax_pressure": "Налоговое давление",
  ap: "Очки действия",
  stability: "Стабильность",
  move_cost: "Стоимость хода",
  "stat:defense": "Оборона",
  "stat:attack": "Атака",
  "loyalty:*": "Лояльность",
  "cost:diplomacy": "Дипломатия",
  "research:*": "Наука",
};

/** Client fallback for older explain payloads from server. */
export function formatExplainLineLabel(raw: string): string {
  if (CHANNEL_LABELS[raw]) return CHANNEL_LABELS[raw];
  if (raw.startsWith("stat:")) {
    const tail = raw.slice(5).replace(/_/g, " ");
    return `Показатель: ${tail}`;
  }
  if (raw.startsWith("loyalty")) return "Лояльность";
  if (raw.startsWith("cost:")) return `Затраты · ${raw.slice(5)}`;
  if (raw.startsWith("research")) return "Наука";
  return raw.replace(/_/g, " ");
}

/** Trim float noise in trait summaries (0.9990000000000001). */
export function formatExplainSummary(text: string): string {
  return text.replace(/-?\d+\.\d+/g, (m) => {
    const n = Number(m);
    if (!Number.isFinite(n)) return m;
    return fmt1(n);
  });
}

export function formatExplainModifier(raw: string | undefined): string {
  if (!raw) return "—";
  return formatExplainSummary(raw);
}
