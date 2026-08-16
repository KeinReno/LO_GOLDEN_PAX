import { create } from "zustand";
import type { ContactBattlePreview } from "./contactBattlePreview";
import type { ViewerEngagement } from "../viewer/PlayerEngagementPanel";

/**
 * Card / contact battle UI session (T3.8 slice).
 * Kept separate from map overlays — survives room navigation by design.
 */
interface ViewerBattleSessionState {
  cardBattleId: string | null;
  cardBattleMinimized: boolean;
  contactBattlePreview: ContactBattlePreview | null;
  contactBattleBusy: boolean;
  contactBattleError: string | null;
  contactBattleResultEng: ViewerEngagement | null;
  stanceBusy: boolean;
  engagements: ViewerEngagement[];

  setCardBattleId: (id: string | null) => void;
  setCardBattleMinimized: (v: boolean) => void;
  setContactBattlePreview: (v: ContactBattlePreview | null) => void;
  setContactBattleBusy: (v: boolean) => void;
  setContactBattleError: (v: string | null) => void;
  setContactBattleResultEng: (v: ViewerEngagement | null) => void;
  setStanceBusy: (v: boolean) => void;
  setEngagements: (
    next:
      | ViewerEngagement[]
      | ((prev: ViewerEngagement[]) => ViewerEngagement[]),
  ) => void;

  openCardBattle: (engagementId: string) => void;
  minimizeCardBattle: () => void;
  clearContactBattle: () => void;
  beginContactChooser: (preview: ContactBattlePreview) => void;
}

export const useViewerBattleSessionStore = create<ViewerBattleSessionState>(
  (set) => ({
    cardBattleId: null,
    cardBattleMinimized: false,
    contactBattlePreview: null,
    contactBattleBusy: false,
    contactBattleError: null,
    contactBattleResultEng: null,
    stanceBusy: false,
    engagements: [],

    setCardBattleId: (id) => set({ cardBattleId: id }),
    setCardBattleMinimized: (v) => set({ cardBattleMinimized: v }),
    setContactBattlePreview: (v) => set({ contactBattlePreview: v }),
    setContactBattleBusy: (v) => set({ contactBattleBusy: v }),
    setContactBattleError: (v) => set({ contactBattleError: v }),
    setContactBattleResultEng: (v) => set({ contactBattleResultEng: v }),
    setStanceBusy: (v) => set({ stanceBusy: v }),
    setEngagements: (next) =>
      set((s) => ({
        engagements: typeof next === "function" ? next(s.engagements) : next,
      })),

    openCardBattle: (engagementId) =>
      set({
        cardBattleId: engagementId,
        cardBattleMinimized: false,
      }),
    minimizeCardBattle: () =>
      set({
        cardBattleId: null,
        cardBattleMinimized: true,
      }),
    clearContactBattle: () =>
      set({
        contactBattlePreview: null,
        contactBattleBusy: false,
        contactBattleError: null,
        contactBattleResultEng: null,
      }),
    beginContactChooser: (preview) =>
      set({
        contactBattlePreview: preview,
        contactBattleError: null,
        contactBattleResultEng: null,
        contactBattleBusy: false,
      }),
  }),
);
