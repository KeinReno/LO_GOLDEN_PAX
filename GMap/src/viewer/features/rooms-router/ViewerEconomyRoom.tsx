import type { ViewerPayload } from "../../../state/types";
import { useViewerOrderSessionStore } from "../../../state/viewerOrderSessionStore";
import { useViewerPanelFocusStore } from "../../../state/viewerPanelFocusStore";
import { currencyShortLabel } from "../../economy/chartData";
import { EconomyPanel } from "../../economy";
import { toggleStockAlert } from "../../economy/stockAlerts";
import { pickFocusBuildSystemId } from "../../economy/productionData";
import { navigateViewerRoom } from "./navigateViewerRoom";
import { stockAlertMsg } from "./courtWorldPatch";

type Signal = { category?: string; systemId?: string };

type Props = {
  payload: ViewerPayload;
  mobile: boolean;
  factionName?: string;
  economySystemSignals: Signal[];
  onOpenSystem: (systemId: string) => void;
  onFocusSystem: (systemId: string) => void;
  onSetFlowPriority: (opts: {
    from: string;
    to: string;
    systemId?: string | null;
  }) => void;
  onSetTax: (slot: string, tier: string) => void;
  onSetDoctrine: (id: string) => void;
  onReserveStock: (id: string, amount: number, label?: string) => void;
  onConvert: (
    fromCurrency: string,
    toCurrency: string,
    amountFrom: number,
  ) => Promise<boolean> | boolean;
  onSendCaravan: (
    currencyId: string,
    systemId: string,
    amount: number,
  ) => void | Promise<void | boolean>;
};

export function ViewerEconomyRoom({
  payload,
  mobile,
  factionName,
  economySystemSignals,
  onOpenSystem,
  onFocusSystem,
  onSetFlowPriority,
  onSetTax,
  onSetDoctrine,
  onReserveStock,
  onConvert,
  onSendCaravan,
}: Props) {
  const orderMsg = useViewerOrderSessionStore((s) => s.orderMsg);
  const setOrderMsg = useViewerOrderSessionStore((s) => s.setOrderMsg);
  const flowData = useViewerOrderSessionStore((s) => s.flowData);
  const priorityBusy = useViewerOrderSessionStore((s) => s.flowPriorityBusy);
  const stockBusy = useViewerOrderSessionStore((s) => s.stockBusy);
  const policyBusy = useViewerOrderSessionStore((s) => s.policyBusy);
  const linkedSystemId = useViewerPanelFocusStore(
    (s) => s.economyLinkedSystemId,
  );
  const setEconomyLinkedSystemId = useViewerPanelFocusStore(
    (s) => s.setEconomyLinkedSystemId,
  );
  const setEcoHighlightCategory = useViewerPanelFocusStore(
    (s) => s.setEcoHighlightCategory,
  );
  const economyFocusCategory = useViewerPanelFocusStore(
    (s) => s.economyFocusCategory,
  );
  const setEconomyFocusCategory = useViewerPanelFocusStore(
    (s) => s.setEconomyFocusCategory,
  );
  const economyFocusSection = useViewerPanelFocusStore(
    (s) => s.economyFocusSection,
  );
  const setEconomyFocusSection = useViewerPanelFocusStore(
    (s) => s.setEconomyFocusSection,
  );
  const openMarketTradeWithCurrency = useViewerPanelFocusStore(
    (s) => s.openMarketTradeWithCurrency,
  );

  return (
    <EconomyPanel
      open
      embedded
      compactNav={mobile}
      payload={payload}
      flowData={flowData}
      factionName={factionName}
      linkedSystemId={linkedSystemId}
      priorityBusy={priorityBusy}
      onClose={() => {
        setEconomyLinkedSystemId(null);
        navigateViewerRoom("map");
      }}
      onOpenSystem={(systemId) => {
        setEconomyLinkedSystemId(systemId);
        onOpenSystem(systemId);
      }}
      onFocusDeficit={(letter, systemId) => {
        setEcoHighlightCategory(letter);
        if (systemId) {
          setEconomyLinkedSystemId(systemId);
          onOpenSystem(systemId);
          return;
        }
        const sig = economySystemSignals.find(
          (s) => s.category === letter && s.systemId,
        );
        if (sig?.systemId) {
          setEconomyLinkedSystemId(sig.systemId);
          onOpenSystem(sig.systemId);
        } else {
          navigateViewerRoom("map");
        }
      }}
      onFocusSystemOnMap={(systemId) => {
        setEconomyLinkedSystemId(null);
        onFocusSystem(systemId);
      }}
      onSetFlowPriority={onSetFlowPriority}
      onSetTax={onSetTax}
      onSetDoctrine={onSetDoctrine}
      statusMsg={orderMsg}
      onReserveStock={onReserveStock}
      onConvert={onConvert}
      onSellToMarket={(currencyId) => {
        openMarketTradeWithCurrency(currencyId);
        navigateViewerRoom("market");
      }}
      onSendCaravan={onSendCaravan}
      onStockAlert={(currencyId) => {
        const { on } = toggleStockAlert(currencyId);
        setOrderMsg(stockAlertMsg(on, currencyShortLabel(currencyId)));
      }}
      stockBusy={stockBusy}
      policyBusy={policyBusy}
      focusProductionCategory={economyFocusCategory}
      onFocusProductionConsumed={() => setEconomyFocusCategory(null)}
      focusSection={economyFocusSection}
      onFocusSectionConsumed={() => setEconomyFocusSection(null)}
      onOpenResearch={() => {
        navigateViewerRoom("research");
        setOrderMsg("Наука — нарастите cognitio / изучите добычу F");
      }}
      onFocusBuild={() => {
        const owned = pickFocusBuildSystemId(
          payload.factionId,
          payload.world.systems,
          economySystemSignals,
        );
        if (owned) onFocusSystem(owned);
        else navigateViewerRoom("map");
      }}
    />
  );
}
