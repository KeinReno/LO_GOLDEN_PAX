import { create } from "zustand";
import type { QuestLogEntry } from "./types";

const LOG_KEY = "gmap.questLogs.v1";

function loadLogs(): Record<string, QuestLogEntry[]> {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, QuestLogEntry[]>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveLogs(logs: Record<string, QuestLogEntry[]>) {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(logs));
  } catch {
    /* quota / private mode */
  }
}

interface QuestsUiState {
  activeQuestId: string | null;
  flipped: boolean;
  chatOpen: boolean;
  npcOpen: boolean;
  sidebarCollapsed: boolean;
  /** Quest ids that just dropped from per-turn dice (stagger anim). */
  droppingIds: string[];
  /** Overlay dice while yearly / GM roll animates. */
  diceOverlay: {
    value: number;
    sides: number;
    rolling: boolean;
    label?: string;
    message?: string;
  } | null;
  /** Persistent chat/system logs keyed by quest id. */
  logsByQuest: Record<string, QuestLogEntry[]>;

  selectQuest: (id: string | null) => void;
  setFlipped: (v: boolean) => void;
  toggleFlip: () => void;
  openChat: () => void;
  closeChat: () => void;
  openNpc: () => void;
  closeNpc: () => void;
  toggleSidebar: () => void;
  setDroppingIds: (ids: string[]) => void;
  clearDropping: () => void;
  showDice: (opts: {
    value: number;
    sides?: number;
    label?: string;
    message?: string;
  }) => void;
  settleDice: () => void;
  clearDice: () => void;
  appendLog: (questId: string, entry: QuestLogEntry) => void;
  hydrateLogs: () => void;
}

export const useQuestsState = create<QuestsUiState>((set, get) => ({
  activeQuestId: null,
  flipped: false,
  chatOpen: false,
  npcOpen: false,
  sidebarCollapsed: false,
  droppingIds: [],
  diceOverlay: null,
  logsByQuest: {},

  selectQuest: (id) =>
    set({
      activeQuestId: id,
      flipped: false,
      chatOpen: false,
      npcOpen: false,
    }),

  setFlipped: (v) => set({ flipped: v }),
  toggleFlip: () => set((s) => ({ flipped: !s.flipped })),

  openChat: () => set({ chatOpen: true, npcOpen: false }),
  closeChat: () => set({ chatOpen: false }),

  openNpc: () => set({ npcOpen: true, chatOpen: false }),
  closeNpc: () => set({ npcOpen: false }),

  toggleSidebar: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  setDroppingIds: (ids) => set({ droppingIds: ids }),
  clearDropping: () => set({ droppingIds: [] }),

  showDice: ({ value, sides = 6, label, message }) =>
    set({
      diceOverlay: { value, sides, rolling: true, label, message },
    }),

  settleDice: () =>
    set((s) =>
      s.diceOverlay
        ? { diceOverlay: { ...s.diceOverlay, rolling: false } }
        : s,
    ),

  clearDice: () => set({ diceOverlay: null }),

  appendLog: (questId, entry) => {
    const next = {
      ...get().logsByQuest,
      [questId]: [...(get().logsByQuest[questId] ?? []), entry],
    };
    saveLogs(next);
    set({ logsByQuest: next });
  },

  hydrateLogs: () => set({ logsByQuest: loadLogs() }),
}));
