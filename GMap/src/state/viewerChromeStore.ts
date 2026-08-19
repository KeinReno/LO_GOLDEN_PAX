import { create } from "zustand";

const DOCK_COLLAPSED_KEY = "gmap-viewer-dock-collapsed";

function readDockCollapsed(): boolean {
  try {
    return localStorage.getItem(DOCK_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

type BoolUpdater = boolean | ((prev: boolean) => boolean);

function applyBool(prev: boolean, v: BoolUpdater): boolean {
  return typeof v === "function" ? v(prev) : v;
}

interface ViewerChromeState {
  dockCollapsed: boolean;
  dockMoreOpen: boolean;
  queueOpen: boolean;
  menuOpen: boolean;
  settingsOpen: boolean;
  mapFiltersOpen: boolean;
  sheetOpen: boolean;
  rpFloatOpen: boolean;
  rpUnread: number;

  setDockCollapsed: (v: boolean) => void;
  setDockCollapsedPersisted: (v: boolean) => void;
  setDockMoreOpen: (v: BoolUpdater) => void;
  setQueueOpen: (v: BoolUpdater) => void;
  toggleQueueOpen: () => void;

  setMenuOpen: (v: boolean) => void;
  setSettingsOpen: (v: boolean) => void;
  setMapFiltersOpen: (v: boolean) => void;
  setSheetOpen: (v: boolean) => void;
  setRpFloatOpen: (v: boolean) => void;
  setRpUnread: (n: number) => void;

  /** Close drawers / float / sheet (not queue — callers decide). */
  closeShellOverlays: () => void;
  /** Mutual-exclusive drawer open helpers used by top bar. */
  openMenuOnly: () => void;
  openSettingsOnly: () => void;
  openMapFiltersOnly: () => void;
}

/** Viewer shell chrome: dock, drawers, mobile sheet, RP float unread. */
export const useViewerChromeStore = create<ViewerChromeState>((set) => ({
  dockCollapsed: readDockCollapsed(),
  dockMoreOpen: false,
  queueOpen: false,
  menuOpen: false,
  settingsOpen: false,
  mapFiltersOpen: false,
  sheetOpen: false,
  rpFloatOpen: false,
  rpUnread: 0,

  setDockCollapsed: (v) => set({ dockCollapsed: v }),
  setDockCollapsedPersisted: (v) => {
    set({ dockCollapsed: v });
    try {
      localStorage.setItem(DOCK_COLLAPSED_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  },
  setDockMoreOpen: (v) =>
    set((s) => ({ dockMoreOpen: applyBool(s.dockMoreOpen, v) })),
  setQueueOpen: (v) =>
    set((s) => ({ queueOpen: applyBool(s.queueOpen, v) })),
  toggleQueueOpen: () => set((s) => ({ queueOpen: !s.queueOpen })),

  setMenuOpen: (v) =>
    set(
      v
        ? { menuOpen: true, settingsOpen: false, mapFiltersOpen: false }
        : { menuOpen: false },
    ),
  setSettingsOpen: (v) =>
    set(
      v
        ? { menuOpen: false, settingsOpen: true, mapFiltersOpen: false }
        : { settingsOpen: false },
    ),
  setMapFiltersOpen: (v) =>
    set(
      v
        ? { menuOpen: false, settingsOpen: false, mapFiltersOpen: true }
        : { mapFiltersOpen: false },
    ),
  setSheetOpen: (v) => set({ sheetOpen: v }),
  setRpFloatOpen: (v) => set({ rpFloatOpen: v }),
  setRpUnread: (n) => set({ rpUnread: n }),

  closeShellOverlays: () =>
    set({
      menuOpen: false,
      settingsOpen: false,
      mapFiltersOpen: false,
      rpFloatOpen: false,
      sheetOpen: false,
      dockMoreOpen: false,
    }),
  openMenuOnly: () =>
    set({
      menuOpen: true,
      settingsOpen: false,
      mapFiltersOpen: false,
    }),
  openSettingsOnly: () =>
    set({
      menuOpen: false,
      settingsOpen: true,
      mapFiltersOpen: false,
    }),
  openMapFiltersOnly: () =>
    set({
      menuOpen: false,
      settingsOpen: false,
      mapFiltersOpen: true,
    }),
}));
