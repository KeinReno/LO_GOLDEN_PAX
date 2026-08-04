import { create } from "zustand";
import type { DropZoneId, StripMode } from "./constants";
import type { UnitCardModel } from "./UnitCard";

type ForcesMode = "list" | "deck";
type DeckKind = "fleet" | "legion";

interface ForcesState {
  mode: ForcesMode;
  deckKind: DeckKind;
  activeFleetId: string | null;
  activeLegionId: string | null;
  selectedCardIndex: number | null;
  stripMode: StripMode;
  isDragging: boolean;
  draggedCardIndex: number | null;
  hoveredZone: DropZoneId | null;
  toast: string | null;
  /** Session reserve pool (units pulled from decks). */
  reserve: UnitCardModel[];

  openFleetDeck: (fleetId: string) => void;
  openLegionDeck: (legionId: string) => void;
  closeDeck: () => void;
  /** Set selection (null clears). Does not toggle. */
  selectCard: (index: number | null) => void;
  /** Tap toggle: same index clears. */
  toggleCard: (index: number) => void;
  setStripMode: (mode: StripMode) => void;
  openEquip: (index: number) => void;
  openDisbandConfirm: (index: number) => void;
  startDrag: (index: number) => void;
  endDrag: () => void;
  setHoveredZone: (zone: DropZoneId | null) => void;
  setToast: (msg: string | null) => void;
  clearToast: () => void;
  pushReserve: (card: UnitCardModel) => void;
  removeReserveAt: (index: number) => UnitCardModel | null;
}

const resetSelection = {
  selectedCardIndex: null as number | null,
  stripMode: "summary" as StripMode,
  isDragging: false,
  draggedCardIndex: null as number | null,
  hoveredZone: null as DropZoneId | null,
};

export const useForcesState = create<ForcesState>((set, get) => ({
  mode: "list",
  deckKind: "fleet",
  activeFleetId: null,
  activeLegionId: null,
  selectedCardIndex: null,
  stripMode: "summary",
  isDragging: false,
  draggedCardIndex: null,
  hoveredZone: null,
  toast: null,
  reserve: [],

  openFleetDeck: (fleetId) =>
    set({
      mode: "deck",
      deckKind: "fleet",
      activeFleetId: fleetId,
      activeLegionId: null,
      ...resetSelection,
    }),

  openLegionDeck: (legionId) =>
    set({
      mode: "deck",
      deckKind: "legion",
      activeLegionId: legionId,
      activeFleetId: null,
      ...resetSelection,
    }),

  closeDeck: () =>
    set({
      mode: "list",
      activeFleetId: null,
      activeLegionId: null,
      ...resetSelection,
    }),

  selectCard: (index) =>
    set({
      selectedCardIndex: index,
      stripMode: index == null ? "summary" : get().stripMode === "equip" || get().stripMode === "confirm-disband"
        ? get().stripMode
        : "summary",
    }),

  toggleCard: (index) => {
    const cur = get().selectedCardIndex;
    if (cur === index) {
      set({ selectedCardIndex: null, stripMode: "summary" });
    } else {
      set({ selectedCardIndex: index, stripMode: "summary" });
    }
  },

  setStripMode: (mode) => set({ stripMode: mode }),

  openEquip: (index) =>
    set({ selectedCardIndex: index, stripMode: "equip", isDragging: false }),

  openDisbandConfirm: (index) =>
    set({
      selectedCardIndex: index,
      stripMode: "confirm-disband",
      isDragging: false,
    }),

  startDrag: (index) =>
    set({
      isDragging: true,
      draggedCardIndex: index,
      selectedCardIndex: index,
      stripMode: "summary",
    }),

  endDrag: () =>
    set({ isDragging: false, draggedCardIndex: null, hoveredZone: null }),

  setHoveredZone: (zone) => set({ hoveredZone: zone }),

  setToast: (msg) => set({ toast: msg }),

  clearToast: () => set({ toast: null }),

  pushReserve: (card) =>
    set((s) => ({
      reserve: [
        ...s.reserve,
        {
          ...card,
          filledSlots: card.filledSlots ? { ...card.filledSlots } : undefined,
        },
      ],
    })),

  removeReserveAt: (index) => {
    const { reserve } = get();
    if (index < 0 || index >= reserve.length) return null;
    const next = [...reserve];
    const [taken] = next.splice(index, 1);
    set({ reserve: next });
    return taken ?? null;
  },
}));
