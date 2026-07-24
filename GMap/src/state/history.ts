import type { WorldState } from "./types";

export const MAX_UNDO = 60;
export const HISTORY_COALESCE_MS = 500;

/** Mark a set() patch so world changes do not push undo history. */
export const SKIP_HISTORY = Symbol("gmapSkipHistory");

export type HistoryFields = {
  undoPast: WorldState[];
  undoFuture: WorldState[];
  historyCoalesceKey: string | null;
  historyCoalesceAt: number;
};

export type HistoryPatch = Partial<HistoryFields> & {
  world?: WorldState;
  /** Coalesce rapid edits (typing, drag) into one undo step. */
  _coalesce?: string;
  [SKIP_HISTORY]?: boolean;
};

export function emptyHistory(): HistoryFields {
  return {
    undoPast: [],
    undoFuture: [],
    historyCoalesceKey: null,
    historyCoalesceAt: 0,
  };
}

export function applyHistoryOnWorldChange<T extends HistoryFields & { world: WorldState }>(
  state: T,
  patch: HistoryPatch & Record<string, unknown>,
  now = performance.now(),
): Record<string, unknown> {
  const skip = !!patch[SKIP_HISTORY];
  const coalesceKey =
    typeof patch._coalesce === "string" ? patch._coalesce : undefined;

  const next: Record<string, unknown> = { ...patch };
  if (SKIP_HISTORY in patch) {
    delete (next as HistoryPatch)[SKIP_HISTORY];
  }
  delete next._coalesce;

  if (skip || !patch.world || patch.world === state.world) {
    if (skip) {
      next.historyCoalesceKey = null;
      next.historyCoalesceAt = 0;
    }
    return next;
  }

  const coalesce =
    !!coalesceKey &&
    state.historyCoalesceKey === coalesceKey &&
    now - state.historyCoalesceAt < HISTORY_COALESCE_MS;

  if (!coalesce) {
    next.undoPast = [
      ...state.undoPast.slice(-(MAX_UNDO - 1)),
      structuredClone(state.world),
    ];
    next.undoFuture = [];
  }

  next.historyCoalesceKey = coalesceKey ?? null;
  next.historyCoalesceAt = now;
  return next;
}
