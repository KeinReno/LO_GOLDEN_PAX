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
};

export type EconomySystemSignal = {
  systemId: string;
  systemName: string;
  category: string;
  reason: string;
  severity: number;
};

export const ECO_CATEGORY_NAMES: Record<string, string> = {
  A: "Сырьё",
  B: "Материалы",
  C: "Промышленность",
  D: "Энергия",
  E: "Биомасса",
  F: "Знание",
};

export const ECO_CATEGORY_COLORS: Record<string, string> = {
  A: "var(--eco-cat-a)",
  B: "var(--eco-cat-b)",
  C: "var(--eco-cat-c)",
  D: "var(--eco-cat-d)",
  E: "var(--eco-cat-e)",
  F: "var(--eco-cat-f)",
};
