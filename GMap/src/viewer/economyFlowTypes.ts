import { CATEGORY_CURRENCIES } from "../state/economyLabels";

export type FlowBottleneck = { tier: number; deficit: number };

export type FlowCell = {
  rate: number;
  demand: number;
  capacity?: number;
  capped?: number;
  net: number;
  deficit?: number;
  surplus?: number;
};

export type EconomyFlowBreakdown = {
  bottlenecks: Record<string, FlowBottleneck>;
  totals?: Record<string, { rate: number; demand: number; net: number }>;
  /** Category → tier string → cell */
  flows?: Record<string, Record<string, FlowCell>>;
  categories?: string[];
  /** Staffed job-slots by occupation (workers, scientists, military, …). */
  occupations?: Record<string, number>;
};

export type EconomySystemSignal = {
  systemId: string;
  systemName: string;
  category: string;
  reason: string;
  severity: number;
  /** Turns until category stock depleted at current net (0 = already empty). */
  turnsUntil?: number | null;
  /** Player-facing consequence when unresolved. */
  consequence?: string;
};

export const ECO_CATEGORY_NAMES: Record<string, string> = Object.fromEntries(
  CATEGORY_CURRENCIES.map((c) => [c.letter, c.name]),
);

export const ECO_CATEGORY_COLORS: Record<string, string> = Object.fromEntries(
  CATEGORY_CURRENCIES.map((c) => [c.letter, c.cssVar]),
);
