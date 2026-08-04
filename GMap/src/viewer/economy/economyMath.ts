import type { ViewerPayload } from "../../state/types";
import { BUILD_METAL, CATEGORY_CURRENCIES } from "../../state/economyLabels";
import type { EconomyFlowBreakdown } from "../economyFlowTypes";
import type { CategoryStatus } from "./types";

export type EconomyMetrics = {
  treasury: number;
  income: number;
  expense: number;
  balance: number;
};

export type CategorySnapshot = {
  letter: string;
  id: string;
  name: string;
  cssVar: string;
  stock: number;
  net: number | null;
  status: CategoryStatus;
  bottleneckDeficit: number;
};

/** Sum recent ledger deltas for income / expense (last known turn window). */
export function computeMetrics(
  economy: NonNullable<ViewerPayload["economy"]>,
): EconomyMetrics {
  const stocks = economy.stocks ?? {};
  const treasury = stocks[BUILD_METAL.id] ?? 0;
  const recent = economy.recent ?? [];
  let income = 0;
  let expense = 0;
  for (const row of recent) {
    if (row.currencyId !== BUILD_METAL.id) continue;
    if (row.delta > 0) income += row.delta;
    else if (row.delta < 0) expense += Math.abs(row.delta);
  }
  return {
    treasury,
    income,
    expense,
    balance: income - expense,
  };
}

function bottleneckDeficit(
  bottlenecks: Record<string, unknown> | undefined | null,
  letter: string,
): number {
  if (!bottlenecks || typeof bottlenecks !== "object") return 0;
  const raw = bottlenecks[letter];
  if (typeof raw === "number") return raw > 0 ? raw : 0;
  if (raw && typeof raw === "object" && "deficit" in raw) {
    const d = Number((raw as { deficit?: number }).deficit ?? 0);
    return d > 0 ? d : 0;
  }
  return 0;
}

export function buildCategorySnapshots(
  economy: NonNullable<ViewerPayload["economy"]>,
  flowData?: EconomyFlowBreakdown | null,
): CategorySnapshot[] {
  const stocks = economy.stocks ?? {};
  const bnSource = (flowData?.bottlenecks ?? economy.bottlenecks) as
    | Record<string, unknown>
    | undefined;

  return CATEGORY_CURRENCIES.map((c) => {
    const stock = stocks[c.id] ?? 0;
    const totals = flowData?.totals?.[c.letter];
    const net =
      totals && typeof totals.net === "number" ? totals.net : null;
    const deficit = bottleneckDeficit(bnSource, c.letter);
    let status: CategoryStatus = "ok";
    if (deficit > 0 || (net != null && net < 0 && stock <= Math.abs(net) * 3)) {
      status = "deficit";
    } else if (net != null && net < 0) {
      status = "warn";
    }
    return {
      letter: c.letter,
      id: c.id,
      name: c.name,
      cssVar: c.cssVar,
      stock,
      net,
      status,
      bottleneckDeficit: deficit,
    };
  });
}

export function hasAnyProduction(
  payload: ViewerPayload,
  flowData?: EconomyFlowBreakdown | null,
): boolean {
  if (flowData?.totals) {
    return Object.values(flowData.totals).some((t) => (t.rate ?? 0) > 0);
  }
  const owned = payload.world.systems.filter(
    (s) => s.ownerFactionId === payload.factionId,
  );
  for (const sys of owned) {
    for (const p of sys.planets ?? []) {
      const buildings = [
        ...(p.surfaceBuildings ?? []),
        ...(p.orbitalBuildings ?? []),
      ];
      if (buildings.some((b) => !b.disabled)) return true;
    }
  }
  return false;
}

export function formatStatusIcon(status: CategoryStatus): string {
  if (status === "deficit") return "❌";
  if (status === "warn") return "⚠";
  return "✅";
}
