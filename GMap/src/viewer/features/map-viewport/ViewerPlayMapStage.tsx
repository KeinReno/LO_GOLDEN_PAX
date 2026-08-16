import { lazy, Suspense, type Dispatch, type SetStateAction } from "react";
import { Home, ZoomIn, ZoomOut } from "lucide-react";
import type { MapCanvasApi, MapViewModel } from "../../../renderers/MapCanvas";
import {
  intentApCost,
  intentForceApCost,
} from "../../../state/contentCatalog";
import { stockpileCardIds } from "../../../state/economyLabels";
import type { OrderType, ViewerPayload } from "../../../state/types";
import { useViewerChromeStore } from "../../../state/viewerChromeStore";
import { useViewerMapOverlayStore } from "../../../state/viewerMapOverlayStore";
import { useViewerMapPrefsStore } from "../../../state/viewerMapPrefsStore";
import { useViewerOrderSessionStore } from "../../../state/viewerOrderSessionStore";
import { useViewerPanelFocusStore } from "../../../state/viewerPanelFocusStore";
import { useViewerSessionStore } from "../../../state/viewerSessionStore";
import { useViewerSystemDiveStore } from "../../../state/viewerSystemDiveStore";
import { DropZone } from "../../../ui/DropZone";
import { StatusStrip } from "../../../ui/StatusStrip";
import { TurnStampHud } from "../../../ui/TurnStampHud";
import { ViewerAlertFab, type AlertItem } from "../../ViewerAlertFab";
import { EconomySignalPopover } from "../../EconomySignalPopover";
import { FleetOrderRing } from "../../FleetOrderRing";
import { ViewerContextMenu } from "../../ViewerContextMenu";
import type { EconomySystemSignal } from "../../economyFlowTypes";
import { navigateViewerRoom } from "../rooms-router/navigateViewerRoom";
import { diploIncomingOffers } from "../chrome/viewerPlayHudStats";
import { OrderTargetBanner } from "../order-orchestrator/OrderTargetBanner";
import { MapOverlays } from "./MapOverlays";
import type { ViewerMapPlayActions } from "./useViewerMapCanvasEvents";
import { useViewerMapCanvasEvents } from "./useViewerMapCanvasEvents";

const MapCanvas = lazy(() =>
  import("../../../renderers/MapCanvas").then((m) => ({ default: m.MapCanvas })),
);

export type ViewerMapStageActions = ViewerMapPlayActions & {
  submitUnitOrder: (
    kind: "fleet" | "legion",
    unitId: string,
    toSystemId: string,
    hops: number | undefined,
    orderType: OrderType,
  ) => void;
  submitDirectAttack: (fleetId: string, toSystemId: string) => void;
  submitDirectLegionAttack: (legionId: string, toSystemId: string) => void;
  submitDirectClaim: (toSystemId: string, fleetId?: string | null) => void;
  submitDirectBlockade: (
    fleetId: string,
    toSystemId: string,
    hops?: number,
  ) => void;
  submitBoard: (legionId: string, targetFleetId: string) => void;
  submitScoutReveal: (systemId: string) => void;
  cancelFleetRoute: (fleetId: string) => void;
  clearFleetStance: (fleetId: string) => void;
};

type Props = {
  payload: ViewerPayload;
  mobile: boolean;
  showMapLayer: boolean;
  mapBackgroundPaused: boolean;
  desktopWorkbench: boolean;
  mobileRoom: boolean;
  readModel: () => MapViewModel;
  subscribe: (cb: () => void) => () => void;
  mapApiRef: { current: MapCanvasApi | null };
  bump: () => void;
  economySystemSignals: EconomySystemSignal[];
  viewerAlertItems: AlertItem[];
  boardRefreshToast: string | null;
  setBoardRefreshToast: Dispatch<SetStateAction<string | null>>;
  setFocusDiploOfferId: (id: string | null) => void;
  actions: ViewerMapStageActions;
};

export function ViewerPlayMapStage({
  payload,
  mobile,
  showMapLayer,
  mapBackgroundPaused,
  desktopWorkbench,
  mobileRoom,
  readModel,
  subscribe,
  mapApiRef,
  bump,
  economySystemSignals,
  viewerAlertItems,
  boardRefreshToast,
  setBoardRefreshToast,
  setFocusDiploOfferId,
  actions,
}: Props) {
  const diploIncoming = diploIncomingOffers(payload);
  const viewMode = useViewerSessionStore((s) => s.viewMode);
  const selectedSystemId = useViewerSessionStore((s) => s.selectedSystemId);
  const selectedFleetId = useViewerSessionStore((s) => s.selectedFleetId);
  const selectedLegionId = useViewerSessionStore((s) => s.selectedLegionId);
  const touchMoveArmed = useViewerSessionStore((s) => s.touchMoveArmed);
  const setSelectedSystemId = useViewerSessionStore((s) => s.setSelectedSystemId);
  const setSelectedFleetId = useViewerSessionStore((s) => s.setSelectedFleetId);
  const setSelectedLegionId = useViewerSessionStore((s) => s.setSelectedLegionId);
  const setTargetSystemId = useViewerSessionStore((s) => s.setTargetSystemId);
  const setTouchMoveArmed = useViewerSessionStore((s) => s.setTouchMoveArmed);
  const setOrderType = useViewerOrderSessionStore((s) => s.setOrderType);
  const orderMsg = useViewerOrderSessionStore((s) => s.orderMsg);
  const reservedAp = useViewerOrderSessionStore((s) => s.reservedAp);
  const apMax = useViewerOrderSessionStore((s) => s.apMax);
  const reservedForceAp = useViewerOrderSessionStore((s) => s.reservedForceAp);
  const forceApMax = useViewerOrderSessionStore((s) => s.forceApMax);
  const setSheetOpen = useViewerChromeStore((s) => s.setSheetOpen);
  const setQueueOpen = useViewerChromeStore((s) => s.setQueueOpen);
  const rpUnread = useViewerChromeStore((s) => s.rpUnread);
  const viewerCtx = useViewerMapOverlayStore((s) => s.viewerCtx);
  const orderRing = useViewerMapOverlayStore((s) => s.orderRing);
  const economyPopover = useViewerMapOverlayStore((s) => s.economyPopover);
  const setViewerCtx = useViewerMapOverlayStore((s) => s.setViewerCtx);
  const setOrderRing = useViewerMapOverlayStore((s) => s.setOrderRing);
  const setEconomyPopover = useViewerMapOverlayStore((s) => s.setEconomyPopover);
  const setEcoHighlightCategory = useViewerPanelFocusStore(
    (s) => s.setEcoHighlightCategory,
  );
  const setEconomyLinkedSystemId = useViewerPanelFocusStore(
    (s) => s.setEconomyLinkedSystemId,
  );
  const perfMode = useViewerMapPrefsStore((s) => s.perfMode);
  const graphics = useViewerMapPrefsStore((s) => s.graphics);
  const systemFocusId = useViewerSystemDiveStore((s) => s.systemFocusId);

  const selectedFleet =
    payload.world.fleets.find((f) => f.id === selectedFleetId) ?? null;
  const selectedLegion =
    payload.world.legions.find((l) => l.id === selectedLegionId) ?? null;

  const events = useViewerMapCanvasEvents({
    payload,
    mobile,
    bump,
    mapApiRef,
    actions,
  });

  return (
    <main className={showMapLayer ? "viewer-map" : "viewer-hq"}>
      {showMapLayer ? (
        <Suspense
          fallback={
            <div className="viewer-map-loading">
              <div className="viewer-map-loading-pulse" aria-hidden />
              <p>Загрузка карты…</p>
              <p className="hint">Подключаем галактику…</p>
              <button
                type="button"
                className="btn ghost"
                onClick={() => navigateViewerRoom("hq")}
              >
                В штаб
              </button>
            </div>
          }
        >
          <MapCanvas
            key={`viewer-map-${perfMode}`}
            mode="viewer"
            apiRef={mapApiRef}
            readModel={readModel}
            onModelSubscribe={subscribe}
            interactive={!systemFocusId && !(mobile && mobileRoom)}
            hostClassName={
              [
                systemFocusId ? "viewer-map--inert" : "",
                mapBackgroundPaused ? "viewer-map--paused" : "",
              ]
                .filter(Boolean)
                .join(" ") || undefined
            }
            playerFactionId={payload.factionId}
            onUnitDrop={events.onUnitDrop}
            onUnitDropReject={events.onUnitDropReject}
            onUnitDragStart={events.onUnitDragStart}
            onViewerContextMenu={events.onViewerContextMenu}
            onSystemHold={events.onSystemHold}
            onHoldProgress={events.onHoldProgress}
            onSystemOpen={events.onSystemOpen}
            onSystemClick={events.onSystemClick}
            onFleetClick={events.onFleetClick}
            onLegionClick={events.onLegionClick}
          />
          <DropZone
            zoneId="map-canvas"
            accepts={stockpileCardIds()}
            className="viewer-map-dropzone"
            contentLayout="contents"
            onDrop={(cardId, pos) => events.onStockpileMapDrop(cardId, pos)}
          />
          <TurnStampHud
            turn={payload.world.meta.turn}
            name={payload.world.meta.name}
            enabled={graphics.turnStamp}
          />
          <ViewerAlertFab items={viewerAlertItems} unreadRp={rpUnread} />
          {economyPopover ? (
            <EconomySignalPopover
              open
              anchor={economyPopover}
              onClose={() => setEconomyPopover(null)}
              signals={economySystemSignals}
              onFocusSystem={(systemId) => {
                const sig = economySystemSignals.find(
                  (s) => s.systemId === systemId,
                );
                if (sig?.category) setEcoHighlightCategory(sig.category);
                mapApiRef.current?.focusSystem(systemId);
                setSelectedSystemId(systemId);
                actions.openPlayerSystem(systemId);
                bump();
              }}
              onOpenEconomy={() => {
                const top = economySystemSignals[0];
                if (top?.category) setEcoHighlightCategory(top.category);
                if (top?.systemId) setEconomyLinkedSystemId(top.systemId);
                setEconomyPopover(null);
                navigateViewerRoom("economy");
              }}
            />
          ) : null}
          <ViewerContextMenu
            menu={viewerCtx}
            payload={payload}
            onClose={() => setViewerCtx(null)}
            onSelectFleet={(id) => {
              setSelectedFleetId(id);
              setSelectedLegionId(null);
              const f = payload.world.fleets.find((x) => x.id === id);
              if (f) setSelectedSystemId(f.systemId);
            }}
            onSelectLegion={(id) => {
              setSelectedLegionId(id);
              setSelectedFleetId(null);
              const l = payload.world.legions.find((x) => x.id === id);
              if (l) setSelectedSystemId(l.systemId);
            }}
            onSelectSystem={(id) => {
              setSelectedSystemId(id);
              setTargetSystemId(id);
            }}
            onOpenSystem={(id) => {
              setSelectedSystemId(id);
              actions.openPlayerSystem(id);
            }}
            onMoveUnit={(kind, unitId, toSystemId, hops) => {
              void actions.submitMoveOrder(kind, unitId, toSystemId, hops);
            }}
            onOrderType={(kind, opts) => {
              if (kind === "attack_system" && opts.fleetId && opts.systemId) {
                actions.submitDirectAttack(opts.fleetId, opts.systemId);
                return;
              }
              if (kind === "attack_system" && opts.legionId && opts.systemId) {
                actions.submitDirectLegionAttack(opts.legionId, opts.systemId);
                return;
              }
              if (kind === "claim_system" && opts.systemId) {
                actions.submitDirectClaim(opts.systemId, opts.fleetId);
                return;
              }
              setOrderType(kind);
              if (opts.fleetId) {
                setSelectedFleetId(opts.fleetId);
                setSelectedLegionId(null);
              }
              if (opts.systemId) {
                setSelectedSystemId(opts.systemId);
                setTargetSystemId(opts.systemId);
              }
              setQueueOpen(true);
            }}
            onOpenOrders={() => setQueueOpen(true)}
            onOpenRp={() => navigateViewerRoom("rp")}
            onScoutReveal={(systemId) => {
              void actions.submitScoutReveal(systemId);
            }}
            onBoard={(legionId, targetFleetId) => {
              actions.submitBoard(legionId, targetFleetId);
            }}
            scoutApCost={intentApCost("intent.scout_reveal")}
            reservedAp={reservedAp}
            apMax={apMax}
            reservedForceAp={reservedForceAp}
            forceApMax={forceApMax}
          />
          <MapOverlays>
            {payload && (
              <FleetOrderRing
                ring={orderRing}
                payload={payload}
                reservedAp={reservedAp}
                apMax={apMax}
                reservedForceAp={reservedForceAp}
                forceApMax={forceApMax}
                scoutApCost={intentApCost("intent.scout_reveal")}
                scoutForceApCost={intentForceApCost("intent.scout_world")}
                moveForceApCost={intentForceApCost("intent.move_fleet")}
                legionMoveForceApCost={intentForceApCost("intent.move_legion")}
                attackEmpireApCost={intentApCost("intent.attack_system")}
                attackForceApCost={intentForceApCost("intent.attack_system")}
                onClose={() => setOrderRing(null)}
                onMove={(kind, unitId, toSystemId, hops) => {
                  setOrderRing(null);
                  void actions.submitUnitOrder(
                    kind,
                    unitId,
                    toSystemId,
                    hops,
                    kind === "fleet" ? "move_fleet" : "move_legion",
                  );
                }}
                onAttack={(kind, unitId, toSystemId) => {
                  setOrderRing(null);
                  if (kind === "fleet") {
                    actions.submitDirectAttack(unitId, toSystemId);
                  } else {
                    actions.submitDirectLegionAttack(unitId, toSystemId);
                  }
                }}
                onBlockade={(fleetId, toSystemId, hops) => {
                  setOrderRing(null);
                  actions.submitDirectBlockade(fleetId, toSystemId, hops);
                }}
                onFortify={(fleetId, systemId) => {
                  setOrderRing(null);
                  setSelectedFleetId(fleetId);
                  setSelectedSystemId(systemId);
                  setOrderType("fortify");
                  void actions.submitUnitOrder(
                    "fleet",
                    fleetId,
                    systemId,
                    0,
                    "fortify",
                  );
                }}
                onCancelRoute={(fleetId) => {
                  setOrderRing(null);
                  void actions.cancelFleetRoute(fleetId);
                }}
                onOpenSystem={(systemId) => {
                  setOrderRing(null);
                  actions.openPlayerSystem(systemId);
                }}
                onClearStance={(fleetId) => {
                  setOrderRing(null);
                  actions.clearFleetStance(fleetId);
                }}
                onScout={(systemId) => {
                  setOrderRing(null);
                  void actions.submitScoutReveal(systemId);
                }}
                onClaim={(systemId, fleetId) => {
                  setOrderRing(null);
                  actions.submitDirectClaim(systemId, fleetId);
                }}
                onBoard={(legionId, targetFleetId) => {
                  setOrderRing(null);
                  actions.submitBoard(legionId, targetFleetId);
                }}
              />
            )}
            <OrderTargetBanner />
          </MapOverlays>
          {mobile &&
            viewMode === "map" &&
            (selectedFleet || selectedLegion) &&
            (selectedFleet?.factionId === payload.factionId ||
              selectedLegion?.factionId === payload.factionId) && (
              <div className="viewer-touch-bar" role="toolbar">
                <div className="viewer-touch-bar-main">
                  <strong>
                    {selectedFleet?.name ?? selectedLegion?.name}
                  </strong>
                  <span className="hint">Тяните на систему или «Ход»</span>
                </div>
                <button
                  type="button"
                  className={`btn ${touchMoveArmed ? "primary" : "ghost"}`}
                  onClick={() => {
                    setTouchMoveArmed(
                      !useViewerSessionStore.getState().touchMoveArmed,
                    );
                    setSheetOpen(false);
                    setViewerCtx(null);
                  }}
                >
                  Ход
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={!selectedSystemId}
                  onClick={() => {
                    if (!selectedSystemId) return;
                    setTouchMoveArmed(false);
                    actions.openPlayerSystem(selectedSystemId);
                  }}
                >
                  Внутрь
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    setTouchMoveArmed(false);
                    setSelectedFleetId(null);
                    setSelectedLegionId(null);
                  }}
                >
                  ×
                </button>
              </div>
            )}
          {!mobile && (
            <div className="viewer-zoom" aria-label="Масштаб">
              <button
                type="button"
                className="viewer-zoom-btn"
                aria-label="Приблизить"
                onClick={() => mapApiRef.current?.zoomBy(1.25)}
              >
                <ZoomIn size={20} strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                className="viewer-zoom-btn"
                aria-label="Отдалить"
                onClick={() => mapApiRef.current?.zoomBy(0.8)}
              >
                <ZoomOut size={20} strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                className="viewer-zoom-btn"
                aria-label="Сбросить вид"
                onClick={() => mapApiRef.current?.resetView()}
              >
                <Home size={18} strokeWidth={2} aria-hidden />
              </button>
            </div>
          )}
          {orderMsg && (viewMode === "map" || viewMode === "economy") && (
            <div className="viewer-toast" role="status">
              {orderMsg}
            </div>
          )}
          {boardRefreshToast && viewMode === "map" && (
            <div className="viewer-status-slot">
              <StatusStrip
                message={boardRefreshToast}
                onDismiss={() => setBoardRefreshToast(null)}
              />
            </div>
          )}
          {diploIncoming.length > 0 &&
            viewMode === "map" &&
            !desktopWorkbench && (
              <div className="viewer-diplo-banner" role="status">
                <span>
                  Входящих дипломатических предложений:{" "}
                  <strong>{diploIncoming.length}</strong>
                </span>
                <button
                  type="button"
                  className="btn sm primary"
                  onClick={() => {
                    setFocusDiploOfferId(diploIncoming[0]?.id ?? null);
                    navigateViewerRoom("diplomacy");
                  }}
                >
                  Открыть
                </button>
              </div>
            )}
        </Suspense>
      ) : null}
    </main>
  );
}
