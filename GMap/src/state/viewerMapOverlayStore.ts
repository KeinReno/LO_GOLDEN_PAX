import { create } from "zustand";
import type { MapContextPick } from "../renderers/MapCanvas";
import type {
  FleetOrderRingState,
  HoldProgressState,
} from "../viewer/FleetOrderRing";

export type StanceRingState = {
  engagementId: string;
  x: number;
  y: number;
};

export type EconomyPopoverState = {
  x: number;
  y: number;
};

/**
 * Transient map UI overlays (T3.8 slice) — cleared on room nav / backdrop.
 * Persistent battle session (cardBattle*) stays on ViewerPage for now.
 */
interface ViewerMapOverlayState {
  viewerCtx: MapContextPick | null;
  orderRing: FleetOrderRingState | null;
  holdProgress: HoldProgressState | null;
  stanceRing: StanceRingState | null;
  economyPopover: EconomyPopoverState | null;

  setViewerCtx: (v: MapContextPick | null) => void;
  setOrderRing: (v: FleetOrderRingState | null) => void;
  setHoldProgress: (v: HoldProgressState | null) => void;
  setStanceRing: (v: StanceRingState | null) => void;
  setEconomyPopover: (v: EconomyPopoverState | null) => void;

  /** Drop all point-anchored overlays. */
  closeAllOverlays: () => void;
}

export const useViewerMapOverlayStore = create<ViewerMapOverlayState>(
  (set) => ({
    viewerCtx: null,
    orderRing: null,
    holdProgress: null,
    stanceRing: null,
    economyPopover: null,

    setViewerCtx: (v) => set({ viewerCtx: v }),
    setOrderRing: (v) => set({ orderRing: v }),
    setHoldProgress: (v) => set({ holdProgress: v }),
    setStanceRing: (v) => set({ stanceRing: v }),
    setEconomyPopover: (v) => set({ economyPopover: v }),

    closeAllOverlays: () =>
      set({
        viewerCtx: null,
        orderRing: null,
        holdProgress: null,
        stanceRing: null,
        economyPopover: null,
      }),
  }),
);
