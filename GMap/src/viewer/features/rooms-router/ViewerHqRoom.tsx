import type { ViewerPayload } from "../../../state/types";
import { useViewerChromeStore } from "../../../state/viewerChromeStore";
import { useViewerBattleSessionStore } from "../../../state/viewerBattleSessionStore";
import { useViewerPanelFocusStore } from "../../../state/viewerPanelFocusStore";
import { PlayerHqHome } from "../../PlayerHqPanels";
import type { AlertItem } from "../../ViewerAlertFab";
import type { ViewerPlayEngagementActions } from "../combat-flow/viewerPlayEngagementActions";
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
  selectedSystemId: string | null;
  affordableResearch: number;
  tradePartnerCount: number;
  activeQuestCount: number;
  warCount: number;
  openEngagementCount: number;
  actions: ViewerPlayEngagementActions;
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
  selectedSystemId,
  affordableResearch,
  tradePartnerCount,
  activeQuestCount,
  warCount,
  openEngagementCount,
  actions,
}: Props) {
  const setQueueOpen = useViewerChromeStore((s) => s.setQueueOpen);
  const setRpUnread = useViewerChromeStore((s) => s.setRpUnread);
  const stanceBusy = useViewerBattleSessionStore((s) => s.stanceBusy);
  const engagements = useViewerBattleSessionStore((s) => s.engagements);
  const setMarketPrefillCurrency = useViewerPanelFocusStore(
    (s) => s.setMarketPrefillCurrency,
  );

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
      onScoutReveal={(systemId) => void actions.submitScoutReveal(systemId)}
      mapSelectedSystemId={selectedSystemId}
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
      onOpenMarket={() => {
        setMarketPrefillCurrency(null);
        navigateViewerRoom("market");
      }}
      onOpenEconomy={() => navigateViewerRoom("economy")}
      affordableResearch={affordableResearch}
      tradePartnerCount={tradePartnerCount}
      activeQuestCount={activeQuestCount}
      warCount={warCount}
      openEngagementCount={openEngagementCount}
      engagements={engagements}
      stanceBusy={stanceBusy}
      onSubmitCombatStance={(engId, stance) =>
        void actions.submitCombatStance(engId, stance)
      }
      onOpenStanceRing={actions.openStanceRing}
      onRequestCardBattle={(engId) =>
        void actions.submitRequestCardBattle(engId)
      }
      onOpenCardBattle={actions.openCardBattle}
    />
  );
}
