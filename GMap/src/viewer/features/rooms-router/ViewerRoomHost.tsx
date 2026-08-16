import type { ReactNode } from "react";
import { BottomSheet } from "../../../ui/BottomSheet";
import { WorkbenchShell } from "../../../ui/WorkbenchShell";
import { MobileImmersiveRoom } from "../../MobileImmersiveRoom";
import { useViewerSessionStore } from "../../../state/viewerSessionStore";
import { useViewerPanelFocusStore } from "../../../state/viewerPanelFocusStore";
import { useViewerSystemDiveStore } from "../../../state/viewerSystemDiveStore";
import {
  viewerRoomTitle,
  viewerWorkbenchSubtitle,
} from "../../viewerRoomLabels";
import { isMobileRoomView } from "../../useViewerViewport";
import {
  isDesktopWorkbenchView,
  isMobileImmersiveView,
  navigateViewerRoom,
} from "./navigateViewerRoom";
import {
  resolveImmersivePanel,
  resolveViewerRoomPanel,
  type ViewerRoomPanels,
} from "./viewerRoomRegistry";

type Props = {
  mobile: boolean;
  panels: ViewerRoomPanels;
  economyLinkedOpen?: boolean;
  diploIncomingBadge?: ReactNode;
};

export function ViewerRoomHost({
  mobile,
  panels,
  economyLinkedOpen = false,
  diploIncomingBadge,
}: Props) {
  const viewMode = useViewerSessionStore((s) => s.viewMode);
  const setEconomyLinkedSystemId = useViewerPanelFocusStore(
    (s) => s.setEconomyLinkedSystemId,
  );
  const setSystemFocusId = useViewerSystemDiveStore((s) => s.setSystemFocusId);
  const systemFocusId = useViewerSystemDiveStore((s) => s.systemFocusId);
  const economyLinkedSystemId = useViewerPanelFocusStore(
    (s) => s.economyLinkedSystemId,
  );

  const desktopWorkbench = isDesktopWorkbenchView(mobile, viewMode);
  const mobileImmersive = isMobileImmersiveView(mobile, viewMode);
  const mobileRoom = isMobileRoomView(mobile, viewMode);
  const mobileSheetRoom = mobileRoom && !mobileImmersive;
  const roomPanel = resolveViewerRoomPanel(viewMode, mobileImmersive, panels);
  const immersivePanel = resolveImmersivePanel(
    viewMode,
    mobileImmersive,
    panels,
  );
  const roomTitle = viewerRoomTitle(viewMode);
  const workbenchSubtitle = viewerWorkbenchSubtitle(viewMode);

  return (
    <>
      <WorkbenchShell
        open={Boolean(desktopWorkbench && roomPanel)}
        title={roomTitle}
        subtitle={
          viewMode === "economy" && economyLinkedSystemId
            ? `${workbenchSubtitle ?? ""} · система открыта справа`
            : workbenchSubtitle
        }
        wide={
          viewMode === "hq" ||
          viewMode === "diplomacy" ||
          viewMode === "forces" ||
          viewMode === "market" ||
          viewMode === "research" ||
          viewMode === "economy" ||
          viewMode === "quests" ||
          viewMode === "court" ||
          viewMode === "codex"
        }
        className={
          viewMode === "economy"
            ? "workbench-panel--economy"
            : viewMode === "market"
              ? "workbench-panel--market"
              : viewMode === "hq"
                ? "workbench-panel--hq"
                : undefined
        }
        masterDetail={
          !mobile &&
          viewMode === "economy" &&
          Boolean(economyLinkedOpen && systemFocusId)
        }
        badge={
          viewMode === "diplomacy" && diploIncomingBadge
            ? diploIncomingBadge
            : undefined
        }
        onClose={() => {
          if (viewMode === "economy") {
            setEconomyLinkedSystemId(null);
            setSystemFocusId(null);
          }
          navigateViewerRoom("map");
        }}
      >
        {roomPanel}
      </WorkbenchShell>

      <MobileImmersiveRoom
        open={Boolean(immersivePanel)}
        onClose={() => navigateViewerRoom("map")}
        className={
          viewMode === "rp"
            ? "mobile-room--rp"
            : viewMode === "quests"
              ? "mobile-room--quests"
              : undefined
        }
      >
        {immersivePanel}
      </MobileImmersiveRoom>

      <BottomSheet
        open={Boolean(mobileSheetRoom && roomPanel)}
        onOpenChange={(open) => {
          if (!open) navigateViewerRoom("map");
        }}
        title={roomTitle}
        className="viewer-sheet--room"
        maxHeightVh={
          viewMode === "diplomacy" ||
          viewMode === "forces" ||
          viewMode === "economy" ||
          viewMode === "court" ||
          viewMode === "research" ||
          viewMode === "hq"
            ? 92
            : 88
        }
      >
        {roomPanel}
      </BottomSheet>
    </>
  );
}
