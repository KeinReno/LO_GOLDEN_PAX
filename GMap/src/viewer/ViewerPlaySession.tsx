import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CardBoard } from "../ui/cardBoardContext";
import type {
  ViewerPayload,
} from "../state/types";
import {
  ViewerPlayCombatOverlays,
  useViewerCombatActions,
  type ViewerPlayEngagementActions,
} from "./features/combat-flow";
import {
  useViewerEconomyIntents,
  useViewerUnitOrders,
  applyViewerSessionFromAction,
  commitViewerActionAp,
} from "./features/order-orchestrator";
import {
  ViewerPlayRooms,
  ViewerChronicleRoom,
  closeViewerMapOverlays,
  isDesktopWorkbenchView,
  isMobileImmersiveView,
  navigateViewerRoom,
} from "./features/rooms-router";
import { ViewerPlaySystemDive, useViewerSystemActions, useViewerDiveNav } from "./features/system-dive";
import {
  pendingOrderCount,
  ViewerPlayTopbar,
  ViewerPlayDrawers,
  ViewerPlaySheet,
  ViewerPlayDock,
  ViewerPlayFloats,
  ViewerPlayOrdersPanel,
  ViewerPlayLoginGate,
  factionThemeVars,
} from "./features/chrome";
import {
  computeMapBackgroundPaused,
  computeShowMapLayer,
  useMapViewport,
  ViewerPlayMapStage,
  buildViewerPlayMapModel,
} from "./features/map-viewport";
import {
  useViewerAuth,
  useViewerAutoLogin,
} from "./hooks/useViewerAuth";
import { useViewerPlayLogin } from "./hooks/useViewerPlayLogin";
import { useViewerLivePolls } from "./hooks/useViewerLivePolls";
import { useViewerQuestActions } from "./hooks/useViewerQuestActions";
import { useViewerContentCatalogs } from "./hooks/useViewerContentCatalogs";
import { useViewerPlaySessionEffects } from "./hooks/useViewerPlaySessionEffects";
import type { MapStyleId } from "../renderers/styles/mapTheme";
import { useWorldStore } from "../state/worldStore";
import { useViewerChromeStore } from "../state/viewerChromeStore";
import { useViewerPanelFocusStore } from "../state/viewerPanelFocusStore";
import { useViewerSessionStore } from "../state/viewerSessionStore";
import { useViewerMapPrefsStore } from "../state/viewerMapPrefsStore";
import { useViewerBattleSessionStore } from "../state/viewerBattleSessionStore";
import { useViewerOrderSessionStore } from "../state/viewerOrderSessionStore";
import {
  isMobileRoomView,
  mapGraphicsWhenPaused,
  useViewerViewport,
} from "./useViewerViewport";
import { PhoneStatusBar } from "./phone/PhoneStatusBar";
import { usePhoneBackStack } from "./phone/usePhoneBackStack";
import { useViewerAlerts } from "./useViewerAlerts";
import { useViewerDockChrome } from "./useViewerDockChrome";
import { useViewerHotkeys } from "./useViewerHotkeys";
import {
  buildEconomySystemSignals,
  severeBottleneckSystemIds,
} from "./buildEconomySignals";

export function ViewerPlaySession() {
  const { mobile } = useViewerViewport();
  usePhoneBackStack(mobile);
  useViewerDockChrome();
  const dockCollapsed = useViewerChromeStore((s) => s.dockCollapsed);
  const queueOpen = useViewerChromeStore((s) => s.queueOpen);
  const setDockCollapsedPersisted = useViewerChromeStore(
    (s) => s.setDockCollapsedPersisted,
  );
  const setQueueOpen = useViewerChromeStore((s) => s.setQueueOpen);
  const sheetOpen = useViewerChromeStore((s) => s.sheetOpen);
  const setRpUnread = useViewerChromeStore((s) => s.setRpUnread);
  const closeShellOverlays = useViewerChromeStore((s) => s.closeShellOverlays);

  const techMapHighlightIds = useViewerPanelFocusStore(
    (s) => s.techMapHighlightIds,
  );
  const setMarketTab = useViewerPanelFocusStore((s) => s.setMarketTab);
  const setEconomyLinkedSystemId = useViewerPanelFocusStore(
    (s) => s.setEconomyLinkedSystemId,
  );
  const setResearchBranch = useViewerPanelFocusStore(
    (s) => s.setResearchBranch,
  );
  const setTechMapHighlightIds = useViewerPanelFocusStore(
    (s) => s.setTechMapHighlightIds,
  );

  const viewMode = useViewerSessionStore((s) => s.viewMode);
  const selectedSystemId = useViewerSessionStore((s) => s.selectedSystemId);
  const selectedFleetId = useViewerSessionStore((s) => s.selectedFleetId);
  const selectedLegionId = useViewerSessionStore((s) => s.selectedLegionId);
  const setViewMode = useViewerSessionStore((s) => s.setViewMode);
  const clearMapSelection = useViewerSessionStore((s) => s.clearMapSelection);

  const perfMode = useViewerMapPrefsStore((s) => s.perfMode);
  const graphics = useViewerMapPrefsStore((s) => s.graphics);
  const layers = useViewerMapPrefsStore((s) => s.layers);
  const mapStyle = useViewerMapPrefsStore((s) => s.mapStyle);
  const setLayers = useViewerMapPrefsStore((s) => s.setLayers);
  const applyMapStyleStore = useViewerMapPrefsStore((s) => s.applyMapStyle);
  const commitLayers = useViewerMapPrefsStore((s) => s.commitLayers);
  const setPerfModeDirect = useViewerMapPrefsStore((s) => s.setPerfMode);
  const setGraphicsDirect = useViewerMapPrefsStore((s) => s.setGraphics);

  const openCardBattle = useViewerBattleSessionStore((s) => s.openCardBattle);

  const apMax = useViewerOrderSessionStore((s) => s.apMax);
  const reservedAp = useViewerOrderSessionStore((s) => s.reservedAp);
  const forceApMax = useViewerOrderSessionStore((s) => s.forceApMax);
  const reservedForceAp = useViewerOrderSessionStore((s) => s.reservedForceAp);
  const setOrderMsg = useViewerOrderSessionStore((s) => s.setOrderMsg);
  const applyApFromApi = useViewerOrderSessionStore((s) => s.applyApFromApi);
  const flowData = useViewerOrderSessionStore((s) => s.flowData);
  const commitApFromAction = commitViewerActionAp;
  const { mapApiRef, modelRef, bump, subscribe } = useMapViewport();
  const auth = useViewerAuth();
  const {
    factionId,
    password,
    loginPerf,
    loginMapStyle,
    setFactionId,
    setPassword,
    setLoginPerf,
    setLoginMapStyle,
    setError,
    credsRef,
    sessionGenRef,
    logoutLocal,
  } = auth;
  const [payload, setPayload] = useState<ViewerPayload | null>(null);
  /** Mobile: tap system to move selected own unit (fallback to drag). */
  const [focusDiploOfferId, setFocusDiploOfferId] = useState<string | null>(
    null,
  );
  const catalogs = useViewerContentCatalogs();
  const { buildingsCatalog, mapResourcesCatalog } = catalogs;
  const loadWorld = useWorldStore((s) => s.loadWorld);
  const applySessionFromAction = (
    data: Parameters<typeof applyViewerSessionFromAction>[0],
  ) =>
    applyViewerSessionFromAction(data, {
      setPayload,
      loadWorld,
      commitAp: commitApFromAction,
    });
  const mapStampRef = useRef<string | null>(null);

  const {
    syncHint,
    setSyncHint,
    boardRefreshToast,
    setBoardRefreshToast,
    refreshEngagements,
    isStale,
  } = useViewerLivePolls({
    payload,
    password,
    credsRef,
    mapStampRef,
    setPayload,
    commitApFromAction,
    bump,
  });

  const applyMapStyle = (style: MapStyleId) => {
    applyMapStyleStore(style);
    setLoginMapStyle(style);
  };

  const mobileRoom = isMobileRoomView(mobile, viewMode);
  const mobileImmersive = isMobileImmersiveView(mobile, viewMode);
  const desktopWorkbench = isDesktopWorkbenchView(mobile, viewMode);
  const mapBackgroundPaused = computeMapBackgroundPaused({
    mobile,
    viewMode,
    sheetOpen,
  });
  const mapGraphics = mapGraphicsWhenPaused(graphics, mapBackgroundPaused);

  const { login, restoreFromToken } = useViewerPlayLogin({
    factionId,
    password,
    loginPerf,
    loginMapStyle,
    setFactionId,
    setPassword,
    setError,
    setIsLoggingIn: auth.setIsLoggingIn,
    credsRef,
    mapStampRef,
    applyMapStyle,
    setPerfModeDirect,
    commitLayers,
    setGraphicsDirect,
    setPayload,
    loadWorld,
    applyApFromApi,
    setSyncHint,
    clearMapSelection,
    closeShellOverlays,
    setViewMode,
    modelRef,
    bump,
  });

  useViewerAutoLogin({
    payload,
    setFactionId,
    setPassword,
    login,
  });

  useEffect(() => {
    void restoreFromToken();
    // Token boot once; PIN form remains if restore fails.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    submitPlayerIntent,
    sendCaravan,
    setTax,
    setFlowPriority,
    reserveStock,
    setEconomicPolicy,
    submitTransfer,
    submitMarketConvert,
    submitMarketOffer,
    submitMarketCancel,
    submitScoutReveal,
  } = useViewerEconomyIntents({
    payload,
    password,
    setPayload,
    commitApFromAction,
    onCaravanSent: (toSystemId) => {
      setEconomyLinkedSystemId(toSystemId);
      mapApiRef.current?.flashSystem(toSystemId, "move");
    },
  });

  const {
    openPlayerSystem,
    focusSystemOnMap,
    openPlayerPlanet,
    closePlayerSystem,
  } = useViewerDiveNav(mapApiRef);

  const {
    submitCombatStance,
    submitRequestCardBattle,
    openStanceRing,
  } = useViewerCombatActions({
    payload,
    password,
    refreshEngagements,
  });

  const {
    setBuildQueue,
    previewBuild,
    openResearchWithTech,
    highlightSystemsForTech,
    runFoundHybridLineage,
    runPlanetAction,
    applyRecruitSession,
    runSystemAction,
    openBuildingFromResearch,
  } = useViewerSystemActions({
    payload,
    password,
    setPayload,
    applySessionFromAction,
    bump,
    loadWorld,
    mapApiRef,
    buildingsCatalog,
    onOpenSystem: openPlayerSystem,
    onOpenPlanet: openPlayerPlanet,
  });

  const {
    cancelOrder,
    submitUnitOrder,
    submitMoveOrder,
    submitDirectAttack,
    submitDirectLegionAttack,
    submitBoard,
    submitDirectClaim,
    submitDirectBlockade,
    cancelFleetRoute,
    clearFleetStance,
    onUnitDrop,
    submitOrder,
  } = useViewerUnitOrders({
    payload,
    password,
    setPayload,
    commitApFromAction,
    bump,
    loadWorld,
    sessionGenRef,
    mapStampRef,
    mapApiRef,
    refreshEngagements,
    applyRecruitSession,
    reservedAp,
    apMax,
    reservedForceAp,
    forceApMax,
  });

  const { submitQuestAction } = useViewerQuestActions({
    payload,
    password,
    setPayload,
    commitApFromAction,
    setOrderMsg,
  });

  const readModel = () => {
    const m = buildViewerPlayMapModel({
      payload,
      selectedSystemId,
      selectedFleetId,
      selectedLegionId,
      layers,
      perfMode,
      mapStyle,
      mapGraphics,
      economyBottleneckSystemIds,
    });
    if (payload) modelRef.current = m;
    return m;
  };

  const showMapLayer = computeShowMapLayer({
    hasPayload: !!payload,
    mobile,
    viewMode,
    queueOpen,
    sheetOpen,
  });

  const pendingCount = useMemo(
    () => pendingOrderCount(payload?.world.orders),
    [payload],
  );

  const economySystemSignals = useMemo(() => {
    if (!payload) return [];
    return buildEconomySystemSignals(payload, flowData);
  }, [payload, flowData]);

  const alertNav = useMemo(
    () => ({
      closeMapOverlays: closeViewerMapOverlays,
      setFocusDiploOfferId,
      goView: navigateViewerRoom,
    }),
    [setFocusDiploOfferId],
  );

  const { viewerAlertItems } = useViewerAlerts({
    payload,
    pendingCount,
    economySystemSignals,
    economyPressure: payload?.economy?.pressure,
    mapApiRef,
    openStanceRing,
    nav: alertNav,
  });

  const economyBottleneckSystemIds = useMemo(() => {
    const bn = severeBottleneckSystemIds(economySystemSignals);
    if (!techMapHighlightIds.length) return bn;
    return [...new Set([...bn, ...techMapHighlightIds])];
  }, [economySystemSignals, techMapHighlightIds]);

  useViewerPlaySessionEffects({
    bump,
    payload,
    layers,
    perfMode,
    mapStyle,
    graphics,
    mapBackgroundPaused,
    economyBottleneckSystemIds,
  });

  useViewerHotkeys({
    payload,
    mobile,
    viewMode,
    dockCollapsed,
    showMapLayer,
    techMapHighlightIds,
    setLayers,
    setDockCollapsedPersisted,
    setQueueOpen,
    setMarketTab,
    setResearchBranch,
    setRpUnread,
    setTechMapHighlightIds,
  });

  if (!payload) {
    return (
      <ViewerPlayLoginGate
        mobile={mobile}
        auth={auth}
        onLogin={() => login()}
      />
    );
  }

  const engagementActions: ViewerPlayEngagementActions = {
    submitScoutReveal,
    submitCombatStance,
    openStanceRing,
    submitRequestCardBattle,
    openCardBattle,
  };

  const faction = payload.world.factions.find((f) => f.id === payload.factionId);

  const ordersPanel = (
    <ViewerPlayOrdersPanel
      payload={payload}
      onSubmit={() => void submitOrder()}
      onCancelOrder={(id) => void cancelOrder(id)}
    />
  );

  const chronicleRoom = (
    <ViewerChronicleRoom
      payload={payload}
      password={password}
      mobile={mobile}
      factionColor={faction?.color}
      avatarUrl={faction?.avatarUrl}
    />
  );


  const factionCss = factionThemeVars(faction);

  return (
    <CardBoard>
    <div
      className={`viewer-shell ${
        mobile
          ? "viewer-shell--mobile viewer-shell--v2 viewer-shell--phone"
          : "viewer-shell--desktop"
      }${dockCollapsed ? " viewer-shell--dock-collapsed" : ""}${
        mapBackgroundPaused ? " viewer-shell--map-paused" : ""
      }${mobileImmersive ? " viewer-shell--immersive" : ""}`}
      data-perf={perfMode}
      data-dock={dockCollapsed ? "collapsed" : "open"}
      data-room={mobileRoom ? viewMode : undefined}
      style={factionCss}
    >
      {faction?.emblemPath && (
        <div
          className="viewer-faction-wash"
          aria-hidden
          style={{ backgroundImage: `url(${faction.emblemPath})` }}
        />
      )}
      {mobile ? (
        <PhoneStatusBar
          payload={payload}
          pendingCount={pendingCount}
          ordersPanel={ordersPanel}
          isStale={isStale}
          viewerAlertItems={viewerAlertItems}
        />
      ) : (
        <ViewerPlayTopbar
          payload={payload}
          mobile={mobile}
          showMapLayer={showMapLayer}
          mapResourcesCatalog={mapResourcesCatalog}
          pendingCount={pendingCount}
          ordersPanel={ordersPanel}
          isStale={isStale}
        />
      )}

      <ViewerPlayMapStage
        payload={payload}
        mobile={mobile}
        showMapLayer={showMapLayer}
        mapBackgroundPaused={mapBackgroundPaused}
        desktopWorkbench={desktopWorkbench}
        mobileRoom={mobileRoom}
        readModel={readModel}
        subscribe={subscribe}
        mapApiRef={mapApiRef}
        bump={bump}
        economySystemSignals={economySystemSignals}
        viewerAlertItems={viewerAlertItems}
        boardRefreshToast={boardRefreshToast}
        setBoardRefreshToast={setBoardRefreshToast}
        setFocusDiploOfferId={setFocusDiploOfferId}
        actions={{
          onUnitDrop,
          submitMoveOrder,
          sendCaravan,
          openPlayerSystem,
          submitUnitOrder,
          submitDirectAttack,
          submitDirectLegionAttack,
          submitDirectClaim,
          submitDirectBlockade,
          submitBoard,
          submitScoutReveal,
          cancelFleetRoute,
          clearFleetStance,
        }}
      />

      <ViewerPlayRooms
        payload={payload}
        password={password}
        mobile={mobile}
        economySystemSignals={economySystemSignals}
        viewerAlertItems={viewerAlertItems}
        focusDiploOfferId={focusDiploOfferId}
        setFocusDiploOfferId={setFocusDiploOfferId}
        mapApiRef={mapApiRef}
        chronicleRoom={chronicleRoom}
        actions={{
          bump,
          setPayload,
          applySessionFromAction,
          loadWorld,
          ...engagementActions,
          openBuildingFromResearch,
          highlightSystemsForTech,
          submitMarketConvert,
          submitMarketOffer,
          submitMarketCancel,
          submitTransfer,
          submitQuestAction,
          submitPlayerIntent,
          focusSystemOnMap,
          openPlayerSystem,
          applyRecruitSession,
          setFlowPriority,
          setTax,
          setEconomicPolicy,
          reserveStock,
          sendCaravan,
          runPlanetAction,
          setBuildQueue,
          previewBuild,
          openResearchWithTech,
          runFoundHybridLineage,
        }}
      />

      <ViewerPlayDrawers
        payload={payload}
        mobile={mobile}
        syncHint={syncHint}
        onLogout={() => {
          logoutLocal();
          setPayload(null);
        }}
        onLoginPerf={setLoginPerf}
        onLoginMapStyle={setLoginMapStyle}
      />

      <ViewerPlaySheet
        payload={payload}
        mobile={mobile}
        actions={engagementActions}
        openPlayerSystem={openPlayerSystem}
      />

      <ViewerPlayFloats payload={payload} />

      <ViewerPlayDock
        payload={payload}
        mobile={mobile}
        viewerAlertItems={viewerAlertItems}
      />

      <ViewerPlayCombatOverlays
        payload={payload}
        password={password}
        actions={{
          submitUnitOrder,
          submitCombatStance,
        }}
      />
      <ViewerPlaySystemDive
        payload={payload}
        password={password}
        catalogs={catalogs}
        actions={{
          onClose: closePlayerSystem,
          onOpenPlanet: openPlayerPlanet,
          onFocusSystem: focusSystemOnMap,
          onPlanetAction: runPlanetAction,
          onSystemAction: runSystemAction,
          onFoundHybrid: runFoundHybridLineage,
          onRecruitSession: applyRecruitSession,
          onOpenResearch: openResearchWithTech,
          onChangeBuildQueue: setBuildQueue,
          onPreviewBuild: previewBuild,
          onClaim: submitDirectClaim,
          onAttack: submitDirectAttack,
        }}
      />

    </div>
    </CardBoard>
  );
}
