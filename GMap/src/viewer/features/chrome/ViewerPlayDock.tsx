import type { ViewerPayload } from "../../../state/types";
import { useViewerBattleSessionStore } from "../../../state/viewerBattleSessionStore";
import { useViewerChromeStore } from "../../../state/viewerChromeStore";
import { useViewerOrderSessionStore } from "../../../state/viewerOrderSessionStore";
import { useViewerSessionStore } from "../../../state/viewerSessionStore";
import { countAffordableResearch } from "../../ResearchPanel";
import type { AlertItem } from "../../ViewerAlertFab";
import { ViewerDock } from "../../ViewerDock";
import { navigateViewerRoom } from "../rooms-router/navigateViewerRoom";
import { isDesktopWorkbenchView } from "../rooms-router/roomViewFlags";
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
    <ViewerDock
      mobile={mobile}
      viewMode={viewMode}
      desktopGlass={false}
      roomCompact={isDesktopWorkbenchView(mobile, viewMode)}
      dockCollapsed={dockCollapsed}
      dockMoreOpen={dockMoreOpen}
      cardBattleId={cardBattleId}
      cardBattleMinimized={cardBattleMinimized}
      reservedAp={reservedAp}
      apMax={apMax}
      reservedForceAp={reservedForceAp}
      forceApMax={forceApMax}
      activeOrders={payload.world.orders}
      currentTurn={payload.world.meta.turn}
      affordableResearch={affordableResearch}
      rpUnread={rpUnread}
      diploIncoming={diploIncoming}
      warCount={warCount}
      tradePartnerCount={tradePartnerCount}
      activeQuestCount={activeQuestCount}
      courtAttentionCount={courtAttentionCount}
      viewerAlertItems={viewerAlertItems}
      onGoView={navigateViewerRoom}
      onToggleDockCollapsed={() => setDockCollapsedPersisted(!dockCollapsed)}
      onToggleDockMore={() => setDockMoreOpen((v) => !v)}
      onRpOpen={() => {
        navigateViewerRoom("rp");
        setRpUnread(0);
      }}
    />
  );
}
