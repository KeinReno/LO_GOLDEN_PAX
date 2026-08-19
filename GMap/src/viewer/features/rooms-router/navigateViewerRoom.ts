import { useViewerChromeStore } from "../../../state/viewerChromeStore";
import { useViewerMapOverlayStore } from "../../../state/viewerMapOverlayStore";
import { useViewerPanelFocusStore } from "../../../state/viewerPanelFocusStore";
import { useViewerSessionStore } from "../../../state/viewerSessionStore";
import { writeStoredStart, type PlayerView } from "../../viewerNavTypes";

export {
  isDesktopWorkbenchView,
  isMobileImmersiveView,
  pickRoomKey,
} from "./roomViewFlags";

/** Close point-anchored map overlays. Card/contact battle session is left alone. */
export function closeViewerMapOverlays(): void {
  useViewerMapOverlayStore.getState().closeAllOverlays();
  useViewerSessionStore.getState().clearOrderTargeting();
}

/** Room switch via Zustand — no callback drilling. */
export function navigateViewerRoom(v: PlayerView): void {
  useViewerSessionStore.getState().setViewMode(v);
  useViewerChromeStore.setState({
    menuOpen: false,
    settingsOpen: false,
    mapFiltersOpen: false,
    rpFloatOpen: v === "rp",
    sheetOpen: false,
    dockMoreOpen: false,
    queueOpen: false,
  });
  useViewerSessionStore.getState().setTouchMoveArmed(false);
  useViewerPanelFocusStore.getState().clearEconomyLinkIfLeaving(v);
  useViewerPanelFocusStore.getState().clearCourtFocusIfLeaving(v);
  closeViewerMapOverlays();
  writeStoredStart(v === "map" ? "map" : "hq");
}
