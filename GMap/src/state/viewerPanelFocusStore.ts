import { create } from "zustand";

/** Keep in sync with MarketPanel — defined here to avoid state↔viewer cycles. */
export type ViewerMarketTab =
  | "quotes"
  | "currencies"
  | "trade"
  | "superpowers";

/**
 * Deep-link / highlight state for viewer workbench rooms (T3.8 slice).
 * Lives in Zustand so ViewerPage does not own every panel focus useState.
 */
interface ViewerPanelFocusState {
  marketTab: ViewerMarketTab;
  marketPrefillCurrency: string | null;
  economyLinkedSystemId: string | null;
  ecoHighlightCategory: string | null;
  economyFocusCategory: string | null;
  /** Open a named Economy section (e.g. stockpile from the metal cell). */
  economyFocusSection: string | null;
  researchHighlightTechId: string | null;
  researchBranch: string | null;
  techMapHighlightIds: string[];
  /** Map pick: new fleet/legion at a highlighted yard/barracks. */
  recruitMapPick: { tab: "ships" | "units"; hubIds: string[] } | null;
  forcesHighlightDefIds: string[] | null;
  courtFocusNpcId: string | null;

  setMarketTab: (tab: ViewerMarketTab) => void;
  setMarketPrefillCurrency: (id: string | null) => void;
  setEconomyLinkedSystemId: (id: string | null) => void;
  setEcoHighlightCategory: (c: string | null) => void;
  setEconomyFocusCategory: (c: string | null) => void;
  setEconomyFocusSection: (id: string | null) => void;
  setResearchHighlightTechId: (id: string | null) => void;
  setResearchBranch: (c: string | null) => void;
  setTechMapHighlightIds: (ids: string[]) => void;
  setRecruitMapPick: (
    pick: { tab: "ships" | "units"; hubIds: string[] } | null,
  ) => void;
  setForcesHighlightDefIds: (ids: string[] | null) => void;
  setCourtFocusNpcId: (id: string | null) => void;

  /** Leave economy room → drop system pin. */
  clearEconomyLinkIfLeaving: (view: string) => void;
  /** Leave court → drop NPC deep-link. */
  clearCourtFocusIfLeaving: (view: string) => void;
  openMarketTradeWithCurrency: (currencyId: string) => void;
  clearTechMapHighlight: () => void;
}

export const useViewerPanelFocusStore = create<ViewerPanelFocusState>(
  (set) => ({
    marketTab: "trade",
    marketPrefillCurrency: null,
    economyLinkedSystemId: null,
    ecoHighlightCategory: null,
    economyFocusCategory: null,
    economyFocusSection: null,
    researchHighlightTechId: null,
    researchBranch: null,
    techMapHighlightIds: [],
    recruitMapPick: null,
    forcesHighlightDefIds: null,
    courtFocusNpcId: null,

    setMarketTab: (tab) => set({ marketTab: tab }),
    setMarketPrefillCurrency: (id) => set({ marketPrefillCurrency: id }),
    setEconomyLinkedSystemId: (id) => set({ economyLinkedSystemId: id }),
    setEcoHighlightCategory: (c) => set({ ecoHighlightCategory: c }),
    setEconomyFocusCategory: (c) => set({ economyFocusCategory: c }),
    setEconomyFocusSection: (id) => set({ economyFocusSection: id }),
    setResearchHighlightTechId: (id) => set({ researchHighlightTechId: id }),
    setResearchBranch: (c) => set({ researchBranch: c }),
    setTechMapHighlightIds: (ids) => set({ techMapHighlightIds: ids }),
    setRecruitMapPick: (pick) => set({ recruitMapPick: pick }),
    setForcesHighlightDefIds: (ids) => set({ forcesHighlightDefIds: ids }),
    setCourtFocusNpcId: (id) => set({ courtFocusNpcId: id }),

    clearEconomyLinkIfLeaving: (view) => {
      if (view !== "economy") set({ economyLinkedSystemId: null });
    },
    clearCourtFocusIfLeaving: (view) => {
      if (view !== "court") set({ courtFocusNpcId: null });
    },
    openMarketTradeWithCurrency: (currencyId) =>
      set({
        marketPrefillCurrency: currencyId,
        marketTab: "trade",
      }),
    clearTechMapHighlight: () =>
      set({ techMapHighlightIds: [], recruitMapPick: null }),
  }),
);
