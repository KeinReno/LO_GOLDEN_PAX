import { getCachedContent } from "../../state/contentCatalog";

export type TaxTierDef = {
  id: string;
  label: string;
  rate?: number;
  effects?: Array<{ effect: string; args?: Record<string, unknown> }>;
};

export type TaxSlotDef = {
  id: string;
  name: string;
  resource?: string;
  tiers: TaxTierDef[];
};

export type DoctrinePreset = {
  id: string;
  label: string;
  blurb: string;
  taxes: Record<string, string>;
};

export const DOCTRINE_PRESETS: DoctrinePreset[] = [
  {
    id: "military",
    label: "Военная экономика",
    blurb: "Высокий промышленный налог, умеренный сбор. Больше давления, больше металла.",
    taxes: { "tax.industry": "high", "tax.supply": "low" },
  },
  {
    id: "trade",
    label: "Торговая экспансия",
    blurb: "Низкие налоги — запас для биржи и обменов.",
    taxes: { "tax.industry": "low", "tax.supply": "none" },
  },
  {
    id: "growth",
    label: "Мирный рост",
    blurb: "Без налогов: минимум давления, максимум лояльности и роста.",
    taxes: { "tax.industry": "none", "tax.supply": "none" },
  },
];

export function loadTaxSlots(): TaxSlotDef[] {
  const content = getCachedContent() as
    | (ReturnType<typeof getCachedContent> & {
        taxes?: Record<string, TaxSlotDef>;
      })
    | null;
  const taxes = content?.taxes;
  if (!taxes) {
    return [
      {
        id: "tax.industry",
        name: "Промышленный налог",
        tiers: [
          { id: "none", label: "0%" },
          { id: "low", label: "10%" },
          { id: "mid", label: "20%" },
          { id: "high", label: "35%" },
        ],
      },
      {
        id: "tax.supply",
        name: "Сбор обеспечения",
        tiers: [
          { id: "none", label: "0%" },
          { id: "low", label: "10%" },
          { id: "mid", label: "20%" },
        ],
      },
    ];
  }
  return Object.values(taxes).map((t) => ({
    id: t.id,
    name: t.name,
    resource: t.resource,
    tiers: t.tiers ?? [],
  }));
}

export function describeTaxEffects(tier: TaxTierDef | undefined): string[] {
  if (!tier?.effects?.length) return ["без эффектов"];
  const out: string[] = [];
  for (const e of tier.effects) {
    if (e.effect === "tax_pressure") {
      const a = Number(e.args?.amount ?? 0);
      out.push(a >= 0 ? `давление +${a}` : `давление ${a}`);
    } else if (e.effect === "production_mult") {
      const m = Number(e.args?.mult ?? 1);
      const pct = Math.round((m - 1) * 100);
      out.push(pct === 0 ? "добыча без изменений" : `добыча ${pct > 0 ? "+" : ""}${pct}%`);
    } else if (e.effect === "pop_growth_mult") {
      const m = Number(e.args?.mult ?? 1);
      const pct = Math.round((m - 1) * 100);
      out.push(`рост населения ${pct > 0 ? "+" : ""}${pct}%`);
    } else if (e.effect === "ap_add") {
      const a = Number(e.args?.amount ?? 0);
      out.push(a >= 0 ? `+${a} ОД/ход` : `${a} ОД/ход`);
    } else {
      out.push(e.effect);
    }
  }
  return out;
}

/** Estimate income hint from rate × current stock (rough dry-run). */
export function previewTaxIncome(
  stock: number,
  rate: number | undefined,
): number {
  if (!rate || rate <= 0) return 0;
  return Math.floor(stock * rate * 0.15);
}

export function previewDoctrine(
  doctrine: DoctrinePreset,
  slots: TaxSlotDef[],
  stocks: Record<string, number>,
): { lines: string[]; pressureDelta: number } {
  const lines: string[] = [];
  let pressureDelta = 0;
  for (const [slotId, tierId] of Object.entries(doctrine.taxes)) {
    const slot = slots.find((s) => s.id === slotId);
    const tier = slot?.tiers.find((t) => t.id === tierId);
    if (!slot || !tier) continue;
    const effects = describeTaxEffects(tier);
    const income = previewTaxIncome(
      stocks[slot.resource ?? ""] ?? 0,
      tier.rate,
    );
    lines.push(
      `${slot.name}: ${tier.label}${income > 0 ? ` (~+${income}/ход)` : ""} · ${effects.join(", ")}`,
    );
    for (const e of tier.effects ?? []) {
      if (e.effect === "tax_pressure") {
        pressureDelta += Number(e.args?.amount ?? 0);
      }
    }
  }
  return { lines, pressureDelta };
}
