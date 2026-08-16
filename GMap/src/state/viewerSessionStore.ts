import { create } from "zustand";
import type { PlayerView } from "../viewer/viewerNavTypes";

/**
 * Viewer session navigation + map selection (T3.8 slice).
 * Room chrome lives in viewerChromeStore; panel deep-links in viewerPanelFocusStore.
 */
interface ViewerSessionState {
  viewMode: PlayerView;
  selectedSystemId: string | null;
  selectedFleetId: string | null;
  selectedLegionId: string | null;
  targetSystemId: string | null;
  pickingTarget: boolean;
  touchMoveArmed: boolean;

  setViewMode: (v: PlayerView) => void;
  setSelectedSystemId: (id: string | null) => void;
  setSelectedFleetId: (id: string | null) => void;
  setSelectedLegionId: (id: string | null) => void;
  setTargetSystemId: (id: string | null) => void;
  setPickingTarget: (v: boolean) => void;
  setTouchMoveArmed: (v: boolean) => void;

  /** Clear unit + system selection. */
  clearMapSelection: () => void;
  /** Select a system; clears unit selection. */
  selectSystemOnly: (systemId: string | null) => void;
  /** Select fleet (optional system pin); clears legion. */
  selectFleet: (fleetId: string | null, systemId?: string | null) => void;
  /** Select legion (optional system pin); clears fleet. */
  selectLegion: (legionId: string | null, systemId?: string | null) => void;
  /** Drop order-target pick mode. */
  clearOrderTargeting: () => void;
}

export const useViewerSessionStore = create<ViewerSessionState>((set) => ({
  viewMode: "map",
  selectedSystemId: null,
  selectedFleetId: null,
  selectedLegionId: null,
  targetSystemId: null,
  pickingTarget: false,
  touchMoveArmed: false,

  setViewMode: (v) => set({ viewMode: v }),
  setSelectedSystemId: (id) => set({ selectedSystemId: id }),
  setSelectedFleetId: (id) => set({ selectedFleetId: id }),
  setSelectedLegionId: (id) => set({ selectedLegionId: id }),
  setTargetSystemId: (id) => set({ targetSystemId: id }),
  setPickingTarget: (v) => set({ pickingTarget: v }),
  setTouchMoveArmed: (v) => set({ touchMoveArmed: v }),

  clearMapSelection: () =>
    set({
      selectedSystemId: null,
      selectedFleetId: null,
      selectedLegionId: null,
    }),
  selectSystemOnly: (systemId) =>
    set({
      selectedSystemId: systemId,
      selectedFleetId: null,
      selectedLegionId: null,
    }),
  selectFleet: (fleetId, systemId) =>
    set((s) => ({
      selectedFleetId: fleetId,
      selectedLegionId: null,
      selectedSystemId:
        systemId !== undefined ? systemId : s.selectedSystemId,
    })),
  selectLegion: (legionId, systemId) =>
    set((s) => ({
      selectedLegionId: legionId,
      selectedFleetId: null,
      selectedSystemId:
        systemId !== undefined ? systemId : s.selectedSystemId,
    })),
  clearOrderTargeting: () =>
    set({
      targetSystemId: null,
      pickingTarget: false,
    }),
}));
