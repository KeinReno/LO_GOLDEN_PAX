import { useEffect, useRef } from "react";
import { useViewerChromeStore } from "../../state/viewerChromeStore";
import { useViewerSessionStore } from "../../state/viewerSessionStore";
import { useViewerSystemDiveStore } from "../../state/viewerSystemDiveStore";
import { useWorldStore } from "../../state/worldStore";
import { navigateViewerRoom } from "../features/rooms-router/navigateViewerRoom";
import { diveCloseWorldPatch } from "../features/system-dive/diveNav";
import { pickPhoneBackLayer, type PhoneBackSnap } from "./phoneBack";

function readSnap(): PhoneBackSnap {
  const chrome = useViewerChromeStore.getState();
  const session = useViewerSessionStore.getState();
  const dive = useViewerSystemDiveStore.getState();
  const focus = useWorldStore.getState().mapFocus;
  return {
    dockMoreOpen: chrome.dockMoreOpen,
    queueOpen: chrome.queueOpen,
    menuOpen: chrome.menuOpen,
    settingsOpen: chrome.settingsOpen,
    mapFiltersOpen: chrome.mapFiltersOpen,
    mapFocusLevel: focus.level,
    systemFocusId: dive.systemFocusId,
    viewMode: session.viewMode,
  };
}

function applyPhoneBackLayer(): boolean {
  const layer = pickPhoneBackLayer(readSnap());
  if (!layer) return false;
  const chrome = useViewerChromeStore.getState();
  if (layer === "more") {
    chrome.setDockMoreOpen(false);
    return true;
  }
  if (layer === "queue") {
    chrome.setQueueOpen(false);
    return true;
  }
  if (layer === "drawer") {
    chrome.closeShellOverlays();
    return true;
  }
  if (layer === "planet") {
    const dive = useViewerSystemDiveStore.getState();
    const id = dive.systemFocusId;
    if (id) {
      useWorldStore.setState({
        mapFocus: { level: "system", systemId: id },
      });
    }
    return true;
  }
  if (layer === "dive") {
    useViewerSystemDiveStore.getState().closeDive();
    useWorldStore.setState(diveCloseWorldPatch());
    return true;
  }
  navigateViewerRoom("map");
  return true;
}

/** Android Back closes the top phone overlay instead of leaving /view. */
export function usePhoneBackStack(enabled: boolean): void {
  const viewMode = useViewerSessionStore((s) => s.viewMode);
  const dockMoreOpen = useViewerChromeStore((s) => s.dockMoreOpen);
  const queueOpen = useViewerChromeStore((s) => s.queueOpen);
  const menuOpen = useViewerChromeStore((s) => s.menuOpen);
  const settingsOpen = useViewerChromeStore((s) => s.settingsOpen);
  const mapFiltersOpen = useViewerChromeStore((s) => s.mapFiltersOpen);
  const systemFocusId = useViewerSystemDiveStore((s) => s.systemFocusId);
  const mapFocusLevel = useWorldStore((s) => s.mapFocus.level);

  const pushedRef = useRef(false);
  const ignorePopRef = useRef(false);
  const layer = enabled
    ? pickPhoneBackLayer({
        dockMoreOpen,
        queueOpen,
        menuOpen,
        settingsOpen,
        mapFiltersOpen,
        mapFocusLevel,
        systemFocusId,
        viewMode,
      })
    : null;

  useEffect(() => {
    if (!enabled) return;
    const onPop = () => {
      if (ignorePopRef.current) {
        ignorePopRef.current = false;
        return;
      }
      const closed = applyPhoneBackLayer();
      if (closed && pickPhoneBackLayer(readSnap())) {
        history.pushState({ gmapPhone: 1 }, "");
        pushedRef.current = true;
      } else {
        pushedRef.current = false;
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (layer && !pushedRef.current) {
      history.pushState({ gmapPhone: 1 }, "");
      pushedRef.current = true;
      return;
    }
    if (!layer && pushedRef.current) {
      ignorePopRef.current = true;
      pushedRef.current = false;
      history.back();
    }
  }, [enabled, layer]);
}
