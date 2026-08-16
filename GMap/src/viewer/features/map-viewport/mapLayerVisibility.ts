import type { PlayerView } from "../../viewerNavTypes";
import { isMobileRoomView } from "../../useViewerViewport.ts";
import {
  isDesktopWorkbenchView,
  isMobileImmersiveView,
} from "../rooms-router/roomViewFlags.ts";

export function computeShowMapLayer(opts: {
  hasPayload: boolean;
  mobile: boolean;
  viewMode: PlayerView;
  queueOpen: boolean;
  sheetOpen: boolean;
}): boolean {
  const mobileImmersive = isMobileImmersiveView(opts.mobile, opts.viewMode);
  const mobileRoom = isMobileRoomView(opts.mobile, opts.viewMode);
  const mobileSheetRoom = mobileRoom && !mobileImmersive;
  const desktopWorkbench = isDesktopWorkbenchView(opts.mobile, opts.viewMode);
  return (
    opts.hasPayload &&
    !mobileImmersive &&
    (opts.viewMode === "map" ||
      opts.viewMode === "economy" ||
      opts.viewMode === "rp" ||
      desktopWorkbench ||
      mobileSheetRoom ||
      opts.queueOpen)
  );
}

export function computeMapBackgroundPaused(opts: {
  mobile: boolean;
  viewMode: PlayerView;
  sheetOpen: boolean;
}): boolean {
  const mobileImmersive = isMobileImmersiveView(opts.mobile, opts.viewMode);
  const mobileRoom = isMobileRoomView(opts.mobile, opts.viewMode);
  const mobileSheetRoom = mobileRoom && !mobileImmersive;
  return (
    opts.mobile &&
    (mobileSheetRoom ||
      mobileImmersive ||
      (opts.viewMode === "map" && opts.sheetOpen))
  );
}
