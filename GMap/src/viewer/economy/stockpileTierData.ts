import { TIERS } from "../../state/resourceIndex";
import type { FlowCell } from "../economyFlowTypes";

export type TierStockRow = {
  tier: number;
  stock: number;
  production: number;
  consumption: number;
  net: number;
  active: boolean;
};

/** Rough tier stock split from category total + flow weights (no per-tier ledger yet). */
function estimateTierStocks(
  totalStock: number,
  tierFlows?: Record<string, FlowCell> | null,
): Map<number, number> {
  const out = new Map<number, number>();
  if (totalStock <= 0) return out;

  if (!tierFlows) {
    out.set(1, totalStock);
    return out;
  }

  const weights = TIERS.map((tier) => {
    const cell = tierFlows[String(tier)];
    const w = Math.max(0, (cell?.rate ?? 0) + (cell?.demand ?? 0));
    return { tier, w };
  });
  const totalW = weights.reduce((s, x) => s + x.w, 0);
  if (totalW <= 0) {
    out.set(1, totalStock);
    return out;
  }

  let assigned = 0;
  for (let i = 0; i < weights.length; i++) {
    const { tier, w } = weights[i]!;
    if (i === weights.length - 1) {
      out.set(tier, Math.max(0, Math.round(totalStock - assigned)));
      continue;
    }
    const share = Math.floor((totalStock * w) / totalW);
    out.set(tier, share);
    assigned += share;
  }
  return out;
}

export function buildTierStockRows(
  totalStock: number,
  tierFlows?: Record<string, FlowCell> | null,
): TierStockRow[] {
  const tierStocks = estimateTierStocks(totalStock, tierFlows);
  return TIERS.map((tier) => {
    const cell = tierFlows?.[String(tier)];
    const production = cell?.rate ?? 0;
    const consumption = cell?.demand ?? 0;
    const net = cell?.net ?? production - consumption;
    const stock = tierStocks.get(tier) ?? 0;
    return {
      tier,
      stock,
      production,
      consumption,
      net,
      active: stock > 0 || production > 0 || consumption > 0,
    };
  });
}
