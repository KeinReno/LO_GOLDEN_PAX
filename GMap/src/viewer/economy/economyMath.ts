import type { Faction, ViewerPayload } from "../../state/types";
import { BUILD_METAL, CATEGORY_CURRENCIES } from "../../state/economyLabels";
import type { EconomyFlowBreakdown } from "../economyFlowTypes";
import type { CategoryStatus } from "./types";

export type EconomyMetrics = {
  treasury: number;
  income: number;
  expense: number;
  balance: number;
  /** currency.metal | map.solari | map.blumatid | … */
  treasuryCurrencyId: string;
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

/** Faction treasury commodity (peg) or legacy metal. */
export function resolveTreasuryCurrencyId(
  faction?: Pick<Faction, "treasuryPeg"> | null,
): string {
  const peg = faction?.treasuryPeg;
  if (typeof peg === "string" && peg.trim()) return peg.trim();
  return BUILD_METAL.id;
}

export function resolveFactionTreasuryCurrency(
  payload: ViewerPayload,
): string {
  const fac = payload.world?.factions?.find((f) => f.id === payload.factionId);
  return resolveTreasuryCurrencyId(fac);
}

const TICK_REASONS = new Set([
  "bridge_income",
  "bridge_upkeep",
  "flow_income",
  "flow_upkeep",
  "treasury_income",
  "treasury_upkeep",
]);

/** Latest turn that has an economy tick for the treasury currency. */
export function latestTreasuryTurn(
  economy: NonNullable<ViewerPayload["economy"]>,
  treasuryCurrencyId: string,
  currentTurn?: number | null,
): number | null {
  const recent = economy.recent ?? [];
  const cap =
    currentTurn != null && Number.isFinite(currentTurn)
      ? Number(currentTurn)
      : null;
  let latest: number | null = null;
  for (const row of recent) {
    if (row.turn == null) continue;
    if (cap != null && row.turn > cap) continue;
    if (!TICK_REASONS.has(row.reason)) continue;
    if (latest == null || row.turn > latest) latest = row.turn;
  }
  if (cap != null) {
    const hasCap = recent.some(
      (row) =>
        row.turn === cap &&
        row.currencyId === treasuryCurrencyId &&
        TICK_REASONS.has(row.reason),
    );
    if (hasCap) return cap;
  }
  return latest;
}

/** @deprecated use latestTreasuryTurn */
export function latestMetalTurn(
  economy: NonNullable<ViewerPayload["economy"]>,
  currentTurn?: number | null,
): number | null {
  return latestTreasuryTurn(economy, BUILD_METAL.id, currentTurn);
}

/** Sum treasury income / expense for the latest ledger turn only. */
export function computeMetrics(
  economy: NonNullable<ViewerPayload["economy"]>,
  currentTurn?: number | null,
  treasuryCurrencyId: string = BUILD_METAL.id,
): EconomyMetrics {
  const stocks = economy.stocks ?? {};
  const treasury = stocks[treasuryCurrencyId] ?? 0;
  const recent = economy.recent ?? [];
  const latestTurn = latestTreasuryTurn(
    economy,
    treasuryCurrencyId,
    currentTurn,
  );
  let income = 0;
  let expense = 0;
  for (const row of recent) {
    if (row.currencyId !== treasuryCurrencyId) continue;
    if (latestTurn != null && row.turn !== latestTurn) continue;
    if (latestTurn == null && row.turn != null) continue;
    if (row.delta > 0) income += row.delta;
    else if (row.delta < 0) expense += Math.abs(row.delta);
  }
  return {
    treasury,
    income,
    expense,
    balance: income - expense,
    treasuryCurrencyId,
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
