import type { ViewerPayload } from "../../../state/types";
import { useViewerOrderSessionStore } from "../../../state/viewerOrderSessionStore";
import { useViewerPanelFocusStore } from "../../../state/viewerPanelFocusStore";
import { MarketPanel, type MarketTab } from "../../MarketPanel";
import { navigateViewerRoom } from "./navigateViewerRoom";

type Props = {
  payload: ViewerPayload;
  password: string;
  reservedAp: number;
  apMax: number;
  selectedSystemId: string | null;
  onConvert: (from: string, to: string, amt: number) => void | Promise<boolean>;
  onPlaceOffer: (
    side: "sell" | "buy",
    giveCur: string,
    giveAmt: number,
    wantCur: string,
    wantAmt: number,
    venue: "common" | "contacts",
  ) => void | Promise<boolean | void>;
  onCancelOffer: (offerId: string) => void | Promise<boolean | void>;
  onEconomyPatch: (eco: ViewerPayload["economy"]) => void;
  onSessionPatch: (data: Partial<ViewerPayload>) => void;
};

export function ViewerMarketRoom({
  payload,
  password,
  reservedAp,
  apMax,
  selectedSystemId,
  onConvert,
  onPlaceOffer,
  onCancelOffer,
  onEconomyPatch,
  onSessionPatch,
}: Props) {
  const orderMsg = useViewerOrderSessionStore((s) => s.orderMsg);
  const flowData = useViewerOrderSessionStore((s) => s.flowData);
  const tab = useViewerPanelFocusStore((s) => s.marketTab);
  const setMarketTab = useViewerPanelFocusStore((s) => s.setMarketTab);
  const prefill = useViewerPanelFocusStore((s) => s.marketPrefillCurrency);

  return (
    <MarketPanel
      interactive
      asRoom={false}
      factionId={payload.factionId}
      password={password}
      economy={payload.economy}
      reservedAp={reservedAp}
      apMax={apMax}
      orderMsg={orderMsg}
      tradePartnerIds={payload.tradePartnerIds}
      worldFactions={payload.world.factions}
      systems={payload.world.systems.map((s) => ({ id: s.id, name: s.name }))}
      mapSelectedSystemId={selectedSystemId}
      tab={tab as MarketTab}
      onTabChange={(next) => setMarketTab(next)}
      prefillSellCurrency={prefill}
      flowData={flowData}
      onOpenDiplomacy={() => navigateViewerRoom("diplomacy")}
      onConvert={onConvert}
      onPlaceOffer={onPlaceOffer}
      onCancelOffer={onCancelOffer}
      onEconomyPatch={(eco) => {
        if (eco) onEconomyPatch(eco);
      }}
      onSessionPatch={onSessionPatch}
    />
  );
}
