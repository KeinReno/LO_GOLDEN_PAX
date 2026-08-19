import { useEffect } from "react";
import {
  applyLayerPreset,
  mapModePresetFromHotkey,
  writeStoredViewerLayers,
  type MapLayerFlags,
} from "../../ui/mapLayers";
import { RESEARCH_BRANCH_BY_DIGIT } from "../ResearchPanel";
import type { MarketTab } from "../MarketPanel";
import {
  dockViewFromDigit,
  MARKET_TAB_BY_DIGIT,
  type PlayerView,
} from "../viewerNavTypes";
import { navigateViewerRoom } from "../features/rooms-router";
import { isInputFocused } from "./isInputFocused";
import { useViewerPanelFocusStore } from "../../state/viewerPanelFocusStore";

export { isInputFocused } from "./isInputFocused";

export interface UseViewerHotkeysOptions {
  payload: unknown;
  mobile: boolean;
  viewMode: PlayerView;
  dockCollapsed: boolean;
  showMapLayer: boolean;
  techMapHighlightIds: string[];
  setLayers: React.Dispatch<React.SetStateAction<MapLayerFlags>>;
  goView?: (v: PlayerView) => void;
  setDockCollapsedPersisted: (v: boolean) => void;
  setQueueOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setMarketTab: (tab: MarketTab) => void;
  setResearchBranch: (branch: string | null) => void;
  setRpUnread: (n: number) => void;
  setTechMapHighlightIds: (ids: string[]) => void;
}

/** Map layer presets (F5–F9) and room dock digits / H / Q / B. */
export function useViewerHotkeys({
  payload,
  mobile,
  viewMode,
  dockCollapsed,
  showMapLayer,
  techMapHighlightIds,
  setLayers,
  goView = navigateViewerRoom,
  setDockCollapsedPersisted,
  setQueueOpen,
  setMarketTab,
  setResearchBranch,
  setRpUnread,
  setTechMapHighlightIds,
}: UseViewerHotkeysOptions): void {
  useEffect(() => {
    if (!techMapHighlightIds.length) return;
    const onKey = (e: KeyboardEvent) => {
      if (isInputFocused(e.target) || e.key !== "Escape") return;
      setTechMapHighlightIds([]);
      useViewerPanelFocusStore.getState().setRecruitMapPick(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [techMapHighlightIds, setTechMapHighlightIds]);

  useEffect(() => {
    if (!showMapLayer) return;
    const onKey = (e: KeyboardEvent) => {
      if (isInputFocused(e.target)) return;
      const id = mapModePresetFromHotkey(e.key);
      if (!id || id === "gm") return;
      e.preventDefault();
      setLayers((prev) => {
        const next = applyLayerPreset(prev, id);
        writeStoredViewerLayers(next);
        return next;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showMapLayer, setLayers]);

  useEffect(() => {
    if (!payload) return;
    const onKey = (e: KeyboardEvent) => {
      if (
        isInputFocused(e.target) ||
        e.ctrlKey ||
        e.metaKey
      ) {
        return;
      }
      if (e.code === "KeyQ") {
        e.preventDefault();
        setQueueOpen((v) => !v);
        return;
      }
      if (e.code === "KeyB") {
        e.preventDefault();
        setDockCollapsedPersisted(!dockCollapsed);
        return;
      }
      if (e.code === "KeyH") {
        e.preventDefault();
        goView("hq");
        return;
      }
      if (e.code === "KeyR") {
        e.preventDefault();
        goView("rp");
        setRpUnread(0);
        return;
      }
      if (viewMode === "market" && e.altKey) {
        const mt = MARKET_TAB_BY_DIGIT[e.key];
        if (mt) {
          e.preventDefault();
          setMarketTab(mt);
          return;
        }
      }
      if (viewMode === "research" && e.altKey) {
        const rb = RESEARCH_BRANCH_BY_DIGIT[e.key];
        if (rb) {
          e.preventDefault();
          setResearchBranch(rb);
          return;
        }
      }
      if (e.altKey) return;
      // Quest choices bind 1–N. Don't steal them for dock rooms.
      if (viewMode === "quests" && /^[1-9]$/.test(e.key)) return;
      if (viewMode === "court" && /^[1-4]$/.test(e.key)) return;
      const view = dockViewFromDigit(e.key, mobile);
      if (!view) return;
      e.preventDefault();
      goView(view);
      if (view === "rp") setRpUnread(0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    payload,
    mobile,
    viewMode,
    dockCollapsed,
    goView,
    setDockCollapsedPersisted,
    setQueueOpen,
    setMarketTab,
    setResearchBranch,
    setRpUnread,
  ]);
}
