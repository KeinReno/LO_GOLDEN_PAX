import { create } from "zustand";

export type SystemPreferDeck = "stations" | "produce";
export type SystemProduceTab = "ships" | "units";

/**
 * System dive / master–detail focus (T3.8 slice).
 * World mapFocus / dossier remain in worldStore; this holds viewer-side dive UI pins.
 */
interface ViewerSystemDiveState {
  systemFocusId: string | null;
  systemPreferDeck: SystemPreferDeck | null;
  systemProduceTab: SystemProduceTab;
  systemProduceFleetId: string | null;
  systemProduceLegionId: string | null;
  planetBusy: boolean;
  planetMsg: string | null;
  systemBusy: boolean;
  systemMsg: string | null;

  setSystemFocusId: (id: string | null) => void;
  setSystemPreferDeck: (v: SystemPreferDeck | null) => void;
  setSystemProduceTab: (v: SystemProduceTab) => void;
  setSystemProduceFleetId: (id: string | null) => void;
  setSystemProduceLegionId: (id: string | null) => void;
  setPlanetBusy: (v: boolean) => void;
  setPlanetMsg: (v: string | null) => void;
  setSystemBusy: (v: boolean) => void;
  setSystemMsg: (v: string | null) => void;

  /** Open dive on a system (does not touch worldStore — caller syncs mapFocus). */
  openDive: (systemId: string) => void;
  /** Clear dive UI pins (caller clears worldStore mapFocus / dossier). */
  closeDive: () => void;
}

export const useViewerSystemDiveStore = create<ViewerSystemDiveState>(
  (set) => ({
    systemFocusId: null,
    systemPreferDeck: null,
    systemProduceTab: "ships",
    systemProduceFleetId: null,
    systemProduceLegionId: null,
    planetBusy: false,
    planetMsg: null,
    systemBusy: false,
    systemMsg: null,

    setSystemFocusId: (id) => set({ systemFocusId: id }),
    setSystemPreferDeck: (v) => set({ systemPreferDeck: v }),
    setSystemProduceTab: (v) => set({ systemProduceTab: v }),
    setSystemProduceFleetId: (id) => set({ systemProduceFleetId: id }),
    setSystemProduceLegionId: (id) => set({ systemProduceLegionId: id }),
    setPlanetBusy: (v) => set({ planetBusy: v }),
    setPlanetMsg: (v) => set({ planetMsg: v }),
    setSystemBusy: (v) => set({ systemBusy: v }),
    setSystemMsg: (v) => set({ systemMsg: v }),

    openDive: (systemId) =>
      set({
        systemFocusId: systemId,
        systemPreferDeck: null,
        systemProduceFleetId: null,
        systemProduceLegionId: null,
      }),
    closeDive: () =>
      set({
        systemFocusId: null,
        systemPreferDeck: null,
        systemProduceFleetId: null,
        systemProduceLegionId: null,
      }),
  }),
);
