import { useCallback, useRef } from "react";
import type { MapCanvasApi, MapViewModel } from "../../../renderers/MapCanvas";
import { useViewerChromeStore } from "../../../state/viewerChromeStore";
import { useViewerSessionStore } from "../../../state/viewerSessionStore";
import {
  computeMapBackgroundPaused,
  computeShowMapLayer,
} from "./mapLayerVisibility";

export { computeMapBackgroundPaused, computeShowMapLayer } from "./mapLayerVisibility";

export function useMapViewport() {
  const mapApiRef = useRef<MapCanvasApi | null>(null);
  const modelRef = useRef<MapViewModel | null>(null);
  const listeners = useRef(new Set<() => void>());
  const bump = useCallback(() => {
    for (const l of listeners.current) l();
  }, []);
  const subscribe = (cb: () => void) => {
    listeners.current.add(cb);
    return () => {
      listeners.current.delete(cb);
    };
  };
  const viewMode = useViewerSessionStore((s) => s.viewMode);
  const queueOpen = useViewerChromeStore((s) => s.queueOpen);
  const sheetOpen = useViewerChromeStore((s) => s.sheetOpen);

  const zoomBy = (factor: number) => {
    mapApiRef.current?.zoomBy(factor);
  };
  const resetView = () => {
    mapApiRef.current?.resetView();
  };
  const focusSystem = (systemId: string) => {
    mapApiRef.current?.focusSystem(systemId);
  };
  const flashSystem = (
    systemId: string,
    kind: "move" | "attack" | "claim",
  ) => {
    mapApiRef.current?.flashSystem(systemId, kind);
  };

  return {
    mapApiRef,
    modelRef,
    bump,
    subscribe,
    viewMode,
    queueOpen,
    sheetOpen,
    zoomBy,
    resetView,
    focusSystem,
    flashSystem,
    computeShowMapLayer,
    computeMapBackgroundPaused,
  };
}
