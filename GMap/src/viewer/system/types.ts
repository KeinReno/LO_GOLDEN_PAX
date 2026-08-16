export type BuildQueueItem = {
  systemId: string;
  planetId: string;
  buildingId: string;
};

export type BuildPreviewDelta = {
  before: number;
  after: number;
  delta: number;
  rateBefore?: number;
  rateAfter?: number;
};

export type BuildPreviewResult = {
  ok: boolean;
  error?: string;
  building?: {
    id: string;
    name: string;
    kind: string;
    category?: string | null;
    tier?: number | null;
    zone: string;
    ap: number;
    cost: Record<string, number>;
  };
  before?: Record<string, { rate: number; demand: number; net: number }>;
  after?: Record<string, { rate: number; demand: number; net: number }>;
  delta?: Record<string, BuildPreviewDelta>;
  buildTurns?: number;
};

export type SystemFlowRow = {
  letter: string;
  name: string;
  net: number;
  sources: string[];
  warn?: boolean;
};

export type SlotViewMode = "radial" | "list";

export const BUILD_QUEUE_MAX = 5;
export const BUILD_DND_MIME = "application/x-lo-building-id";
export const LABOR_DND_MIME = "application/x-gmap-labor";
