import {
  useCallback,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type {
  MapCanvasApi,
  MapContextPick,
} from "../../../renderers/MapCanvas";
import type { ViewerPayload } from "../../../state/types";
import { useViewerChromeStore } from "../../../state/viewerChromeStore";
import { useViewerBattleSessionStore } from "../../../state/viewerBattleSessionStore";
import { useViewerMapOverlayStore } from "../../../state/viewerMapOverlayStore";
import { useViewerOrderSessionStore } from "../../../state/viewerOrderSessionStore";
import { useViewerPanelFocusStore } from "../../../state/viewerPanelFocusStore";
import { listProductionHubSystemIds } from "../../../state/forceReadiness";
import { useViewerSessionStore } from "../../../state/viewerSessionStore";
import { useViewerSystemDiveStore } from "../../../state/viewerSystemDiveStore";
import { CodexPanel } from "../../codex";
import type { EconomySystemSignal } from "../../economyFlowTypes";
import { resolveFleetOrderRing } from "../../FleetOrderRing";
import {
  countOpenEngagements,
} from "../../PlayerEngagementPanel";
import { countAffordableResearch } from "../../ResearchPanel";
import type { AlertItem } from "../../ViewerAlertFab";
import { viewerPlayHudStats } from "../chrome/viewerPlayHudStats";
import type { QuestActionResult } from "../../hooks/useViewerQuestActions";
import type { ViewerPlayEngagementActions } from "../combat-flow/viewerPlayEngagementActions";
import {
  patchViewerPayload,
  type ViewerActionSource,
} from "../order-orchestrator/viewerSessionPatch";
import type { RecruitSessionPatch } from "../system-dive/systemActionCopy";
import type { PlanetActionRequest } from "../../PlayerPlanetManage";
import type { BuildPreviewResult, BuildQueueItem } from "../../system/types";
import { planForceUnitOrder, produceDeckNote } from "./forceOrderFocus";
import { recruitPickNote } from "../../forces/recruitMapPick";
import { navigateViewerRoom } from "./navigateViewerRoom";
import { ViewerChronicleRoom } from "./ViewerChronicleRoom";
import { ViewerCourtRoom } from "./ViewerCourtRoom";
import { ViewerDiplomacyRoom } from "./ViewerDiplomacyRoom";
import { ViewerEconomyRoom } from "./ViewerEconomyRoom";
import { ViewerForcesRoom } from "./ViewerForcesRoom";
import { ViewerHqRoom } from "./ViewerHqRoom";
import { ViewerMarketRoom } from "./ViewerMarketRoom";
import { ViewerQuestsRoom } from "./ViewerQuestsRoom";
import { ViewerResearchRoom } from "./ViewerResearchRoom";
import { ViewerPlanetRoom } from "./ViewerPlanetRoom";
import { ViewerRoomHost } from "./ViewerRoomHost";

export type ViewerPlayRoomActions = ViewerPlayEngagementActions & {
  bump: () => void;
  setPayload: Dispatch<SetStateAction<ViewerPayload | null>>;
  applySessionFromAction: (data: ViewerActionSource) => void;
  loadWorld: (world: ViewerPayload["world"]) => void;
  openBuildingFromResearch: (buildingId: string) => void;
  highlightSystemsForTech: (techId: string) => void;
  submitMarketConvert: (
    from: string,
    to: string,
    amt: number,
  ) => Promise<boolean>;
  submitMarketOffer: (
    side: "sell" | "buy",
    giveCur: string,
    giveAmt: number,
    wantCur: string,
    wantAmt: number,
    venue: "common" | "contacts",
  ) => void | Promise<boolean | void>;
  submitMarketCancel: (offerId: string) => void | Promise<boolean | void>;
  submitTransfer: (
    toId: string,
    cur: string,
    amt: number,
  ) => void | Promise<unknown>;
  submitQuestAction: (
    action: string,
    extra?: Record<string, unknown>,
  ) => Promise<QuestActionResult>;
  submitPlayerIntent: (
    defId: string,
    intentPayload: Record<string, unknown>,
    okMsg: string,
    onOk?: (data: {
      intent?: { apCost?: number };
      reservedAp?: number;
    }) => void,
  ) => Promise<boolean>;
  focusSystemOnMap: (systemId: string) => void;
  openPlayerSystem: (systemId: string, planetId?: string) => void;
  applyRecruitSession: (data: RecruitSessionPatch) => void;
  setFlowPriority: (opts: {
    from: string;
    to: string;
    systemId?: string | null;
  }) => void;
  setTax: (slot: string, tier: string) => void;
  setEconomicPolicy: (id: string) => void;
  reserveStock: (id: string, amount: number, label?: string) => void;
  sendCaravan: (
    cardId: string,
    toSystemId: string,
    amount: number,
  ) => void;
  runPlanetAction: (req: PlanetActionRequest) => void | Promise<unknown>;
  setBuildQueue: (next: BuildQueueItem[]) => void | Promise<unknown>;
  previewBuild: (opts: {
    systemId: string;
    planetId: string;
    buildingId: string;
  }) => Promise<BuildPreviewResult | null>;
  openResearchWithTech: (techId: string) => void;
  runFoundHybridLineage: (raceA: string, raceB: string) => void | Promise<unknown>;
};

type Props = {
  payload: ViewerPayload;
  password: string;
  mobile: boolean;
  economySystemSignals: EconomySystemSignal[];
  viewerAlertItems: AlertItem[];
  focusDiploOfferId: string | null;
  setFocusDiploOfferId: (id: string | null) => void;
  mapApiRef: { current: MapCanvasApi | null };
  chronicleRoom?: ReactNode;
  actions: ViewerPlayRoomActions;
};

export function ViewerPlayRooms({
  payload,
  password,
  mobile,
  economySystemSignals,
  viewerAlertItems,
  focusDiploOfferId,
  setFocusDiploOfferId,
  mapApiRef,
  chronicleRoom,
  actions,
}: Props) {
  const engagements = useViewerBattleSessionStore((s) => s.engagements);
  const selectedSystemId = useViewerSessionStore((s) => s.selectedSystemId);
  const selectedFleetId = useViewerSessionStore((s) => s.selectedFleetId);
  const selectedLegionId = useViewerSessionStore((s) => s.selectedLegionId);
  const setSelectedSystemId = useViewerSessionStore(
    (s) => s.setSelectedSystemId,
  );
  const setSelectedFleetId = useViewerSessionStore((s) => s.setSelectedFleetId);
  const setSelectedLegionId = useViewerSessionStore(
    (s) => s.setSelectedLegionId,
  );
  const setTargetSystemId = useViewerSessionStore((s) => s.setTargetSystemId);
  const setTouchMoveArmed = useViewerSessionStore((s) => s.setTouchMoveArmed);

  const reservedAp = useViewerOrderSessionStore((s) => s.reservedAp);
  const apMax = useViewerOrderSessionStore((s) => s.apMax);
  const reservedForceAp = useViewerOrderSessionStore((s) => s.reservedForceAp);
  const forceApMax = useViewerOrderSessionStore((s) => s.forceApMax);
  const orderMsg = useViewerOrderSessionStore((s) => s.orderMsg);
  const setOrderType = useViewerOrderSessionStore((s) => s.setOrderType);
  const setOrderMsg = useViewerOrderSessionStore((s) => s.setOrderMsg);

  const setQueueOpen = useViewerChromeStore((s) => s.setQueueOpen);
  const setSheetOpen = useViewerChromeStore((s) => s.setSheetOpen);
  const economyLinkedSystemId = useViewerPanelFocusStore(
    (s) => s.economyLinkedSystemId,
  );
  const setEconomyFocusCategory = useViewerPanelFocusStore(
    (s) => s.setEconomyFocusCategory,
  );
  const forcesHighlightDefIds = useViewerPanelFocusStore(
    (s) => s.forcesHighlightDefIds,
  );
  const setSystemPreferDeck = useViewerSystemDiveStore(
    (s) => s.setSystemPreferDeck,
  );
  const setSystemProduceTab = useViewerSystemDiveStore(
    (s) => s.setSystemProduceTab,
  );
  const setSystemProduceFleetId = useViewerSystemDiveStore(
    (s) => s.setSystemProduceFleetId,
  );
  const setSystemProduceLegionId = useViewerSystemDiveStore(
    (s) => s.setSystemProduceLegionId,
  );
  const setTechMapHighlightIds = useViewerPanelFocusStore(
    (s) => s.setTechMapHighlightIds,
  );
  const setRecruitMapPick = useViewerPanelFocusStore(
    (s) => s.setRecruitMapPick,
  );
  const setViewerCtx = useViewerMapOverlayStore((s) => s.setViewerCtx);
  const setOrderRing = useViewerMapOverlayStore((s) => s.setOrderRing);

  const faction = payload.world.factions.find((f) => f.id === payload.factionId);
  const {
    activeQuestCount,
    warCount,
    diploIncoming,
  } = viewerPlayHudStats(payload);
  const openEngagementCount = countOpenEngagements(
    engagements,
    payload.factionId,
  );
  const affordableResearch = countAffordableResearch(
    payload.economy,
    payload.world,
    payload.factionId,
  );

  const openFleetOrderRing = useCallback(
    (pick: MapContextPick) => {
      const ring = resolveFleetOrderRing(
        pick,
        payload,
        selectedFleetId,
        selectedLegionId,
      );
      if (!ring) return false;
      setViewerCtx(null);
      setOrderRing(ring);
      setSheetOpen(false);
      setTouchMoveArmed(false);
      if (ring.fleetId) {
        setSelectedFleetId(ring.fleetId);
        setSelectedLegionId(null);
      } else if (ring.legionId) {
        setSelectedLegionId(ring.legionId);
        setSelectedFleetId(null);
      }
      setSelectedSystemId(ring.systemId);
      setTargetSystemId(ring.systemId);
      return true;
    },
    [
      payload,
      selectedFleetId,
      selectedLegionId,
      setOrderRing,
      setSelectedFleetId,
      setSelectedLegionId,
      setSelectedSystemId,
      setSheetOpen,
      setTargetSystemId,
      setTouchMoveArmed,
      setViewerCtx,
    ],
  );

  const orderWithUnit = (kind: "fleet" | "legion", id: string) => {
    const unit =
      kind === "fleet"
        ? payload.world.fleets?.find((f) => f.id === id)
        : payload.world.legions?.find((l) => l.id === id);
    const plan = planForceUnitOrder({ kind, unit });
    if (plan.kind === "queue") {
      setQueueOpen(true);
      navigateViewerRoom("map");
      return;
    }
    setSelectedFleetId(plan.fleetId);
    setSelectedLegionId(plan.legionId);
    setOrderType(plan.orderType);
    setSelectedSystemId(plan.systemId);
    navigateViewerRoom("map");
    window.setTimeout(() => {
      mapApiRef.current?.focusSystem(plan.systemId);
      openFleetOrderRing({
        screenX: window.innerWidth / 2,
        screenY: window.innerHeight / 2,
        worldX: 0,
        worldY: 0,
        systemId: plan.systemId,
        fleetId: plan.fleetId,
        legionId: plan.legionId,
        linkId: null,
        fromFleetHit: kind === "fleet",
        fromLegionHit: kind === "legion",
      });
    }, 100);
  };

  const rp = chronicleRoom ?? (
    <ViewerChronicleRoom
      payload={payload}
      password={password}
      mobile={mobile}
      factionColor={faction?.color}
      avatarUrl={faction?.avatarUrl}
    />
  );

  return (
    <ViewerRoomHost
      mobile={mobile}
      economyLinkedOpen={Boolean(economyLinkedSystemId)}
      diploIncomingBadge={
        diploIncoming.length > 0 ? (
          <span className="workbench-badge">{diploIncoming.length}</span>
        ) : undefined
      }
      panels={{
        hq: (
          <ViewerHqRoom
            payload={payload}
            password={password}
            reservedAp={reservedAp}
            apMax={apMax}
            reservedForceAp={reservedForceAp}
            forceApMax={forceApMax}
            attentionItems={viewerAlertItems}
            orderMsg={orderMsg}
            affordableResearch={affordableResearch}
            activeQuestCount={activeQuestCount}
            warCount={warCount}
            openEngagementCount={openEngagementCount}
            openPlayerSystem={actions.openPlayerSystem}
          />
        ),
        planet: (
          <ViewerPlanetRoom
            payload={payload}
            password={password}
            onPlanetAction={actions.runPlanetAction}
            onChangeBuildQueue={actions.setBuildQueue}
            onPreviewBuild={actions.previewBuild}
            onOpenResearch={actions.openResearchWithTech}
            onOpenSystem={actions.openPlayerSystem}
            onFoundHybrid={actions.runFoundHybridLineage}
            onRecruitSession={actions.applyRecruitSession}
            onShowInEconomy={(letter) => {
              setEconomyFocusCategory(letter);
              navigateViewerRoom("economy");
            }}
          />
        ),
        research: (
          <ViewerResearchRoom
            payload={payload}
            password={password}
            mobile={mobile}
            onEconomyPatch={(economy) => {
              actions.setPayload((prev) =>
                prev ? patchViewerPayload(prev, { economy }) : prev,
              );
            }}
            onOpenBuilding={actions.openBuildingFromResearch}
            onTechMapDrag={actions.highlightSystemsForTech}
          />
        ),
        market: (
          <ViewerMarketRoom
            payload={payload}
            password={password}
            reservedAp={reservedAp}
            apMax={apMax}
            selectedSystemId={selectedSystemId}
            onConvert={(from, to, amt) =>
              actions.submitMarketConvert(from, to, amt)
            }
            onPlaceOffer={(side, giveCur, giveAmt, wantCur, wantAmt, venue) =>
              actions.submitMarketOffer(
                side,
                giveCur,
                giveAmt,
                wantCur,
                wantAmt,
                venue,
              )
            }
            onCancelOffer={(offerId) => actions.submitMarketCancel(offerId)}
            onEconomyPatch={(economy) => {
              actions.setPayload((prev) =>
                prev ? patchViewerPayload(prev, { economy }) : prev,
              );
            }}
            onSessionPatch={(data) => {
              actions.applySessionFromAction(data);
              actions.bump();
            }}
          />
        ),
        diplomacy: (
          <ViewerDiplomacyRoom
            payload={payload}
            password={password}
            reservedAp={reservedAp}
            apMax={apMax}
            focusOfferId={focusDiploOfferId}
            onFocusOfferId={setFocusDiploOfferId}
            onSessionPatch={actions.applySessionFromAction}
            onGift={(toId, cur, amt) =>
              void actions.submitTransfer(toId, cur, amt)
            }
            onPlaceOffer={(side, giveCur, giveAmt, wantCur, wantAmt, venue) =>
              actions.submitMarketOffer(
                side,
                giveCur,
                giveAmt,
                wantCur,
                wantAmt,
                venue,
              )
            }
            onCancelOffer={(offerId) => actions.submitMarketCancel(offerId)}
          />
        ),
        quests: (
          <ViewerQuestsRoom
            payload={payload}
            mobile={mobile}
            onFocusSystem={actions.focusSystemOnMap}
            submitQuest={actions.submitQuestAction}
            submitIntent={(defId, args, note) =>
              actions.submitPlayerIntent(defId, args, note)
            }
          />
        ),
        codex: <CodexPanel payload={payload} />,
        forces: (
          <ViewerForcesRoom
            payload={payload}
            password={password}
            mobile={mobile}
            highlightDefIds={forcesHighlightDefIds}
            onFocusSystem={actions.focusSystemOnMap}
            onOrderWithFleet={(id) => orderWithUnit("fleet", id)}
            onOrderWithLegion={(id) => orderWithUnit("legion", id)}
            onOpenCardBattle={(engId) => actions.openCardBattle(engId)}
            onOpenProduce={({ systemId, tab, fleetId, legionId }) => {
              setRecruitMapPick(null);
              setTechMapHighlightIds([]);
              setSystemPreferDeck("produce");
              setSystemProduceTab(tab);
              setSystemProduceFleetId(fleetId ?? null);
              setSystemProduceLegionId(legionId ?? null);
              navigateViewerRoom("map");
              actions.openPlayerSystem(systemId);
              setOrderMsg(produceDeckNote(tab));
            }}
            onBeginRecruit={(tab) => {
              const hub = tab === "ships" ? "shipyard" : "barracks";
              const ids = listProductionHubSystemIds(
                payload.world,
                payload.factionId,
                hub,
              );
              if (ids.length === 0) {
                setOrderMsg(recruitPickNote(tab, 0));
                return;
              }
              setRecruitMapPick({ tab, hubIds: ids });
              setTechMapHighlightIds(ids);
              navigateViewerRoom("map");
              actions.focusSystemOnMap(ids[0]);
              setOrderMsg(recruitPickNote(tab, ids.length));
            }}
            onRecruitSession={actions.applyRecruitSession}
            onSessionPatch={(data) => {
              actions.applySessionFromAction(data);
              actions.bump();
            }}
          />
        ),
        economy: (
          <ViewerEconomyRoom
            payload={payload}
            mobile={mobile}
            factionName={faction?.name}
            economySystemSignals={economySystemSignals}
            onOpenSystem={actions.openPlayerSystem}
            onFocusSystem={actions.focusSystemOnMap}
            onSetFlowPriority={(opts) => void actions.setFlowPriority(opts)}
            onSetTax={(slot, tier) => void actions.setTax(slot, tier)}
            onSetDoctrine={(id) => void actions.setEconomicPolicy(id)}
            onReserveStock={(id, amount, label) =>
              void actions.reserveStock(id, amount, label)
            }
            onConvert={(from, to, amt) =>
              actions.submitMarketConvert(from, to, amt)
            }
            onSendCaravan={actions.sendCaravan}
          />
        ),
        court: (
          <ViewerCourtRoom
            payload={payload}
            password={password}
            mobile={mobile}
            factionColor={faction?.color}
            onRecruitSession={actions.applyRecruitSession}
            onWorld={(world) => {
              actions.setPayload((prev) =>
                prev ? patchViewerPayload(prev, { world }) : prev,
              );
              actions.loadWorld(world);
              actions.bump();
            }}
            submitIntent={(defId, args, note) =>
              actions.submitPlayerIntent(defId, args, note)
            }
          />
        ),
        rp,
      }}
    />
  );
}
