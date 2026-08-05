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

export type QuestsMode = "quests" | "court";

interface QuestsUiState {
  activeQuestId: string | null;
  mode: QuestsMode;
  flipped: boolean;
  chatOpen: boolean;
  /** Legacy dock flag — court now uses `mode`. Kept for chat dock layout. */
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
  clearQuest: () => void;
  setMode: (mode: QuestsMode) => void;
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
  mode: "quests",
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
      mode: "quests",
      flipped: false,
      chatOpen: false,
      npcOpen: false,
    }),

  clearQuest: () =>
    set({
      activeQuestId: null,
      flipped: false,
      chatOpen: false,
    }),

  setMode: (mode) =>
    set({
      mode,
      chatOpen: false,
      npcOpen: false,
      ...(mode === "court" ? { activeQuestId: null } : {}),
    }),

  setFlipped: (v) => set({ flipped: v }),
  toggleFlip: () => set((s) => ({ flipped: !s.flipped })),

  openChat: () => set({ chatOpen: true, npcOpen: false, mode: "quests" }),
  closeChat: () => set({ chatOpen: false }),

  openNpc: () =>
    set({ mode: "court", npcOpen: false, chatOpen: false, activeQuestId: null }),
  closeNpc: () => set({ mode: "quests", npcOpen: false }),

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
