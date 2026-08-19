import type { ViewerPayload } from "../../../state/types";
import { useViewerBattleSessionStore } from "../../../state/viewerBattleSessionStore";
import { useViewerChromeStore } from "../../../state/viewerChromeStore";
import { useViewerOrderSessionStore } from "../../../state/viewerOrderSessionStore";
import { useViewerSessionStore } from "../../../state/viewerSessionStore";
import { countAffordableResearch } from "../../ResearchPanel";
import type { AlertItem } from "../../ViewerAlertFab";
import { ViewerDock } from "../../ViewerDock";
import { OrderTray } from "../../OrderTray";
import { useViewerSystemDiveStore } from "../../../state/viewerSystemDiveStore";
import { useWorldStore } from "../../../state/worldStore";
import { diveCloseWorldPatch } from "../system-dive/diveNav";
import { navigateViewerRoom } from "../rooms-router/navigateViewerRoom";
import { isPlayerDockCompact } from "../rooms-router/roomViewFlags";
import { viewerPlayHudStats } from "./viewerPlayHudStats";

type Props = {
  payload: ViewerPayload;
  mobile: boolean;
  viewerAlertItems: AlertItem[];
};

export function ViewerPlayDock({
  payload,
  mobile,
  viewerAlertItems,
}: Props) {
  const viewMode = useViewerSessionStore((s) => s.viewMode);
  const systemFocusId = useViewerSystemDiveStore((s) => s.systemFocusId);
  const closeDive = useViewerSystemDiveStore((s) => s.closeDive);
  const dockCollapsed = useViewerChromeStore((s) => s.dockCollapsed);
  const dockMoreOpen = useViewerChromeStore((s) => s.dockMoreOpen);
  const rpUnread = useViewerChromeStore((s) => s.rpUnread);
  const setDockCollapsedPersisted = useViewerChromeStore(
    (s) => s.setDockCollapsedPersisted,
  );
  const setDockMoreOpen = useViewerChromeStore((s) => s.setDockMoreOpen);
  const setRpUnread = useViewerChromeStore((s) => s.setRpUnread);

  const cardBattleId = useViewerBattleSessionStore((s) => s.cardBattleId);
  const cardBattleMinimized = useViewerBattleSessionStore(
    (s) => s.cardBattleMinimized,
  );

  const reservedAp = useViewerOrderSessionStore((s) => s.reservedAp);
  const apMax = useViewerOrderSessionStore((s) => s.apMax);
  const reservedForceAp = useViewerOrderSessionStore((s) => s.reservedForceAp);
  const forceApMax = useViewerOrderSessionStore((s) => s.forceApMax);

  const {
    activeQuestCount,
    warCount,
    diploIncoming,
    tradePartnerCount,
    courtAttentionCount,
  } = viewerPlayHudStats(payload);
  const affordableResearch = countAffordableResearch(
    payload.economy,
    payload.world,
    payload.factionId,
  );

  return (
    <>
      {viewMode === "map" &&
      !mobile &&
      !(cardBattleId && !cardBattleMinimized) ? (
        <OrderTray
          apUsed={reservedAp}
          apMax={apMax}
          forceApUsed={reservedForceAp}
          forceApMax={forceApMax}
          activeOrders={payload.world.orders}
          currentTurn={payload.world.meta.turn}
        />
      ) : null}
      <ViewerDock
        mobile={mobile}
        viewMode={viewMode}
        desktopGlass={false}
        roomCompact={isPlayerDockCompact(mobile, viewMode, Boolean(systemFocusId))}
        dockCollapsed={dockCollapsed}
        dockMoreOpen={dockMoreOpen}
        cardBattleId={cardBattleId}
        cardBattleMinimized={cardBattleMinimized}
        affordableResearch={affordableResearch}
        rpUnread={rpUnread}
        diploIncoming={diploIncoming}
        warCount={warCount}
        tradePartnerCount={tradePartnerCount}
        activeQuestCount={activeQuestCount}
        courtAttentionCount={courtAttentionCount}
        viewerAlertItems={viewerAlertItems}
        onGoView={(v) => {
          if (v === "map" && viewMode === "map" && systemFocusId) {
            closeDive();
            useWorldStore.setState(diveCloseWorldPatch());
            return;
          }
          navigateViewerRoom(v);
        }}
        onToggleDockCollapsed={() => setDockCollapsedPersisted(!dockCollapsed)}
        onToggleDockMore={() => setDockMoreOpen((v) => !v)}
        onRpOpen={() => {
          navigateViewerRoom("rp");
          setRpUnread(0);
        }}
      />
    </>
  );
}
