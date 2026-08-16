import { create } from "zustand";
import {
  layersForPerfChoice,
  readStoredViewerLayers,
  writeStoredViewerLayers,
  type MapLayerFlags,
  type MapLayerKey,
} from "../ui/mapLayers";
import {
  clampPerfForDevice,
  graphicsForPerf,
  readStoredGraphics,
  writeStoredGraphics,
  type GraphicsPrefKey,
  type ViewerGraphicsPrefs,
} from "../ui/viewerGraphics";
import {
  readStoredViewerMapStyle,
  writeStoredViewerMapStyle,
} from "../ui/mapStylePrefs";
import type { MapStyleId } from "../renderers/styles/mapTheme";
import {
  defaultPerfForDevice,
  readStoredPerf,
  type PerfMode,
} from "../viewer/viewerSessionPrefs";
import { isLikelyMobile } from "../viewer/useViewerViewport";

function initialGraphics(): ViewerGraphicsPrefs {
  const mode = readStoredPerf() ?? defaultPerfForDevice();
  try {
    if (!localStorage.getItem("gmap-viewer-graphics")) {
      return graphicsForPerf(mode);
    }
  } catch {
    /* ignore */
  }
  return readStoredGraphics();
}

function initialLayers(): MapLayerFlags {
  try {
    const hasStored = !!localStorage.getItem("gmap-viewer-layers");
    if (!hasStored && isLikelyMobile()) {
      return layersForPerfChoice("ultralight");
    }
  } catch {
    /* ignore */
  }
  return readStoredViewerLayers();
}

/**
 * Viewer map presentation prefs (T3.8 slice) — perf profile, graphics, layers, map style.
 * Login form drafts (`loginPerf` / `loginMapStyle`) stay on ViewerPage until apply-at-login.
 */
interface ViewerMapPrefsState {
  perfMode: PerfMode;
  graphics: ViewerGraphicsPrefs;
  layers: MapLayerFlags;
  mapStyle: MapStyleId;

  setPerfMode: (mode: PerfMode) => void;
  setGraphics: (
    v: ViewerGraphicsPrefs | ((prev: ViewerGraphicsPrefs) => ViewerGraphicsPrefs),
  ) => void;
  setLayers: (
    v: MapLayerFlags | ((prev: MapLayerFlags) => MapLayerFlags),
  ) => void;
  setMapStyle: (style: MapStyleId) => void;

  /** Persist perf; optionally reset layers+graphics from profile. */
  applyPerfMode: (mode: PerfMode, withPresets?: boolean) => void;
  applyMapStyle: (style: MapStyleId) => void;
  setGraphicFlag: (key: GraphicsPrefKey, value: boolean) => void;
  setLayerFlag: (key: MapLayerKey, value: boolean) => void;
  /** Replace full layer flags and persist (hotkey presets). */
  commitLayers: (next: MapLayerFlags) => void;
}

export const useViewerMapPrefsStore = create<ViewerMapPrefsState>((set, get) => ({
  perfMode: readStoredPerf() ?? defaultPerfForDevice(),
  graphics: initialGraphics(),
  layers: initialLayers(),
  mapStyle: readStoredViewerMapStyle(),

  setPerfMode: (mode) => set({ perfMode: mode }),
  setGraphics: (v) =>
    set((s) => ({
      graphics: typeof v === "function" ? v(s.graphics) : v,
    })),
  setLayers: (v) =>
    set((s) => ({
      layers: typeof v === "function" ? v(s.layers) : v,
    })),
  setMapStyle: (style) => set({ mapStyle: style }),

  applyPerfMode: (mode, withPresets = false) => {
    const safe = clampPerfForDevice(mode);
    try {
      localStorage.setItem("gmap-viewer-perf", safe);
    } catch {
      /* ignore */
    }
    if (withPresets) {
      const nextLayers = layersForPerfChoice(safe);
      const nextGfx = graphicsForPerf(safe);
      writeStoredViewerLayers(nextLayers);
      writeStoredGraphics(nextGfx);
      set({ perfMode: safe, layers: nextLayers, graphics: nextGfx });
      return;
    }
    set({ perfMode: safe });
  },

  applyMapStyle: (style) => {
    writeStoredViewerMapStyle(style);
    set({ mapStyle: style });
  },

  setGraphicFlag: (key, value) => {
    const next = { ...get().graphics, [key]: value };
    writeStoredGraphics(next);
    set({ graphics: next });
  },

  setLayerFlag: (key, value) => {
    const next = { ...get().layers, [key]: value };
    writeStoredViewerLayers(next);
    set({ layers: next });
  },

  commitLayers: (next) => {
    writeStoredViewerLayers(next);
    set({ layers: next });
  },
}));
