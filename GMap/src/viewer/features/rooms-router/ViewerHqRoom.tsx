import type { ViewerPayload } from "../../../state/types";
import { useViewerChromeStore } from "../../../state/viewerChromeStore";
import { PlayerHqHome } from "../../PlayerHqPanels";
import type { AlertItem } from "../../ViewerAlertFab";
import { navigateViewerRoom } from "./navigateViewerRoom";

type Props = {
  payload: ViewerPayload;
  password: string;
  reservedAp: number;
  apMax: number;
  reservedForceAp: number;
  forceApMax: number;
  attentionItems: AlertItem[];
  orderMsg: string | null;
  affordableResearch: number;
  activeQuestCount: number;
  warCount: number;
  openEngagementCount: number;
  openPlayerSystem: (systemId: string, planetId?: string) => void;
};

export function ViewerHqRoom({
  payload,
  password,
  reservedAp,
  apMax,
  reservedForceAp,
  forceApMax,
  attentionItems,
  orderMsg,
  affordableResearch,
  activeQuestCount,
  warCount,
  openEngagementCount,
  openPlayerSystem,
}: Props) {
  const setQueueOpen = useViewerChromeStore((s) => s.setQueueOpen);
  const setRpUnread = useViewerChromeStore((s) => s.setRpUnread);

  return (
    <PlayerHqHome
      payload={payload}
      password={password}
      reservedAp={reservedAp}
      apMax={apMax}
      forceApUsed={reservedForceAp}
      forceApMax={forceApMax}
      attentionItems={attentionItems}
      orderMsg={orderMsg}
      onOpenForces={() => navigateViewerRoom("forces")}
      onOpenOrders={() => {
        navigateViewerRoom("map");
        setQueueOpen(true);
      }}
      onOpenDiplomacy={() => navigateViewerRoom("diplomacy")}
      onOpenQuests={() => navigateViewerRoom("quests")}
      onOpenCourt={() => navigateViewerRoom("court")}
      onOpenRp={() => {
        navigateViewerRoom("rp");
        setRpUnread(0);
      }}
      onOpenMap={() => navigateViewerRoom("map")}
      onOpenResearch={() => navigateViewerRoom("research")}
      onOpenMarket={() => navigateViewerRoom("market")}
      onOpenEconomy={() => navigateViewerRoom("economy")}
      onOpenWorld={(systemId, planetId) => openPlayerSystem(systemId, planetId)}
      affordableResearch={affordableResearch}
      activeQuestCount={activeQuestCount}
      warCount={warCount}
      openEngagementCount={openEngagementCount}
    />
  );
}
