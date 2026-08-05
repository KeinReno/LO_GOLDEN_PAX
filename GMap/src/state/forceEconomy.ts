import { getCachedContent } from "./contentCatalog";

function bal() {
  return (getCachedContent() as { economy_balance?: any } | null)
    ?.economy_balance;
}

function metalByTier(tier: number): number {
  const t = String(Math.max(1, Math.min(10, Number(tier) || 1)));
  return Number(bal()?.buildings?.metalByTier?.[t] ?? 8 + Number(t) * 5);
}

export function produceForceCostClient(
  kind: "ship" | "unit",
  def: { tier?: number; cost?: Record<string, number> },
  count = 1,
): Record<string, number> {
  const n = Math.max(1, count | 0);
  if (def?.cost && typeof def.cost === "object") {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(def.cost)) {
      out[k] = Math.ceil(Number(v || 0) * n);
    }
    return out;
  }
  const tier = Math.max(1, Number(def?.tier ?? 1) || 1);
  const forces = bal()?.forces || {};
  const mult =
    kind === "unit"
      ? Number(forces.unitCostMult ?? 1.3)
      : Number(forces.shipCostMult ?? 1.6);
  const ratio = Number(
    forces.supplyRatio ?? bal()?.buildings?.supplyRatio ?? 0.42,
  );
  const metal = Math.max(1, Math.round(metalByTier(tier) * mult)) * n;
  const supply = Math.max(1, Math.round(metal * ratio));
  return {
    "currency.metal": metal,
    "currency.supply": supply,
  };
}

export function forgeMetalCostClient(): number {
  return Number(bal()?.forces?.forgeMetal ?? 40);
}

/** Alias: forge metal now pays for HP repair, not veterancy rank. */
export function repairMetalCostClient(): number {
  return forgeMetalCostClient();
}

export function disbandMetalRefundClient(): number {
  return Number(bal()?.forces?.disbandRefund ?? 16);
}
