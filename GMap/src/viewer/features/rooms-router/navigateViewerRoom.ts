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
  useViewerChromeStore.getState().closeShellOverlays();
  useViewerChromeStore.getState().setQueueOpen(false);
  useViewerChromeStore.getState().setRpFloatOpen(v === "rp");
  if (v !== "map") useViewerChromeStore.getState().setSheetOpen(false);
  useViewerSessionStore.getState().setTouchMoveArmed(false);
  useViewerPanelFocusStore.getState().clearEconomyLinkIfLeaving(v);
  useViewerPanelFocusStore.getState().clearCourtFocusIfLeaving(v);
  closeViewerMapOverlays();
  writeStoredStart(v === "map" ? "map" : "hq");
}
