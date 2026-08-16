import { useCallback, useMemo, type RefObject } from "react";
import type { MapCanvasApi } from "../renderers/MapCanvas";
import { useViewerChromeStore } from "../state/viewerChromeStore";
import { useViewerPanelFocusStore } from "../state/viewerPanelFocusStore";
import { useViewerSessionStore } from "../state/viewerSessionStore";
import { useViewerMapOverlayStore } from "../state/viewerMapOverlayStore";
import type { ViewerPayload } from "../state/types";
import { useViewerBattleSessionStore } from "../state/viewerBattleSessionStore";
import { buildViewerAlerts } from "./buildViewerAlerts";
import type { AlertFocusAnchor } from "./ViewerAlertFab";
import type { EconomySystemSignal } from "./economyFlowTypes";
import { writeStoredStart } from "./viewerNavTypes";

export interface ViewerAlertNavActions {
  closeMapOverlays: () => void;
  setFocusDiploOfferId: (id: string | null) => void;
  goView: (v: import("./viewerNavTypes").PlayerView) => void;
}

export interface UseViewerAlertsOptions {
  payload: ViewerPayload | null;
  pendingCount: number;
  economySystemSignals: EconomySystemSignal[];
  economyPressure: number | undefined;
  mapApiRef: RefObject<MapCanvasApi | null>;
  openStanceRing: (
    engagementId: string,
    anchor?: { clientX: number; clientY: number },
  ) => void;
  nav: ViewerAlertNavActions;
}

export function useViewerAlerts({
  payload,
  pendingCount,
  economySystemSignals,
  economyPressure,
  mapApiRef,
  openStanceRing,
  nav,
}: UseViewerAlertsOptions) {
  const { closeMapOverlays, setFocusDiploOfferId, goView } = nav;
  const engagements = useViewerBattleSessionStore((s) => s.engagements);

  const rpUnread = useViewerChromeStore((s) => s.rpUnread);
  const setQueueOpen = useViewerChromeStore((s) => s.setQueueOpen);
  const setMenuOpen = useViewerChromeStore((s) => s.setMenuOpen);
  const setSettingsOpen = useViewerChromeStore((s) => s.setSettingsOpen);
  const setMapFiltersOpen = useViewerChromeStore((s) => s.setMapFiltersOpen);
  const setRpFloatOpen = useViewerChromeStore((s) => s.setRpFloatOpen);
  const setRpUnread = useViewerChromeStore((s) => s.setRpUnread);
  const closeShellOverlays = useViewerChromeStore((s) => s.closeShellOverlays);

  const setEcoHighlightCategory = useViewerPanelFocusStore(
    (s) => s.setEcoHighlightCategory,
  );
  const setEconomyLinkedSystemId = useViewerPanelFocusStore(
    (s) => s.setEconomyLinkedSystemId,
  );

  const setViewMode = useViewerSessionStore((s) => s.setViewMode);
  const setTouchMoveArmed = useViewerSessionStore((s) => s.setTouchMoveArmed);
  const setSelectedSystemId = useViewerSessionStore(
    (s) => s.setSelectedSystemId,
  );
  const setSelectedFleetId = useViewerSessionStore((s) => s.setSelectedFleetId);
  const setSelectedLegionId = useViewerSessionStore(
    (s) => s.setSelectedLegionId,
  );
  const setEconomyPopover = useViewerMapOverlayStore(
    (s) => s.setEconomyPopover,
  );

  const focusAlertIdleFleet = useCallback(
    (fleetId: string, systemId: string) => {
      if (!payload) return;
      setSelectedFleetId(fleetId);
      setSelectedLegionId(null);
      setSelectedSystemId(systemId);
      setViewMode("map");
      closeMapOverlays();
      closeShellOverlays();
      setTouchMoveArmed(false);
      writeStoredStart("map");
      window.setTimeout(
        () => mapApiRef.current?.focusSystem(systemId),
        80,
      );
    },
    [
      payload,
      closeMapOverlays,
      closeShellOverlays,
      mapApiRef,
      setSelectedFleetId,
      setSelectedLegionId,
      setSelectedSystemId,
      setViewMode,
      setTouchMoveArmed,
    ],
  );

  const focusAlertEngagement = useCallback(
    (
      systemId: string,
      engagementId: string,
      anchor?: { clientX: number; clientY: number },
    ) => {
      if (!payload) return;
      setSelectedSystemId(systemId);
      setViewMode("map");
      closeMapOverlays();
      closeShellOverlays();
      setTouchMoveArmed(false);
      writeStoredStart("map");
      openStanceRing(engagementId, anchor);
      window.setTimeout(
        () => mapApiRef.current?.focusSystem(systemId),
        80,
      );
    },
    [
      payload,
      closeMapOverlays,
      closeShellOverlays,
      mapApiRef,
      openStanceRing,
      setSelectedSystemId,
      setViewMode,
      setTouchMoveArmed,
    ],
  );

  const focusAlertOrders = useCallback(() => {
    setViewMode("map");
    closeMapOverlays();
    setQueueOpen(true);
    setMenuOpen(false);
    setSettingsOpen(false);
    setMapFiltersOpen(false);
    setRpFloatOpen(false);
    setTouchMoveArmed(false);
    writeStoredStart("map");
  }, [
    closeMapOverlays,
    setViewMode,
    setQueueOpen,
    setMenuOpen,
    setSettingsOpen,
    setMapFiltersOpen,
    setRpFloatOpen,
    setTouchMoveArmed,
  ]);

  const focusAlertDiplo = useCallback(
    (offerId?: string) => {
      setFocusDiploOfferId(offerId ?? null);
      closeMapOverlays();
      setQueueOpen(false);
      setMenuOpen(false);
      setSettingsOpen(false);
      setMapFiltersOpen(false);
      setRpFloatOpen(false);
      setTouchMoveArmed(false);
      setViewMode("diplomacy");
      writeStoredStart("hq");
    },
    [
      closeMapOverlays,
      setFocusDiploOfferId,
      setViewMode,
      setQueueOpen,
      setMenuOpen,
      setSettingsOpen,
      setMapFiltersOpen,
      setRpFloatOpen,
      setTouchMoveArmed,
    ],
  );

  const focusAlertRp = useCallback(() => {
    setViewMode("rp");
    closeMapOverlays();
    setMenuOpen(false);
    setSettingsOpen(false);
    setMapFiltersOpen(false);
    setRpFloatOpen(true);
    setTouchMoveArmed(false);
    setRpUnread(0);
    writeStoredStart("hq");
  }, [
    closeMapOverlays,
    setViewMode,
    setMenuOpen,
    setSettingsOpen,
    setMapFiltersOpen,
    setRpFloatOpen,
    setTouchMoveArmed,
    setRpUnread,
  ]);

  const focusAlertEconomy = useCallback(
    (anchor?: AlertFocusAnchor) => {
      const top = economySystemSignals[0];
      if (top?.category) setEcoHighlightCategory(top.category);
      if (top?.systemId) setEconomyLinkedSystemId(top.systemId);
      if ((economyPressure ?? 0) >= 2) {
        try {
          localStorage.setItem("gmap-eco-section", "policies");
        } catch {
          /* ignore */
        }
      }
      setMenuOpen(false);
      setSettingsOpen(false);
      setMapFiltersOpen(false);
      setRpFloatOpen(false);
      setTouchMoveArmed(false);
      setEconomyPopover(null);
      goView("economy");
      if (anchor) {
        void anchor;
      }
    },
    [
      economySystemSignals,
      economyPressure,
      goView,
      setEcoHighlightCategory,
      setEconomyLinkedSystemId,
      setMenuOpen,
      setSettingsOpen,
      setMapFiltersOpen,
      setRpFloatOpen,
      setTouchMoveArmed,
      setEconomyPopover,
    ],
  );

  const viewerAlertItems = useMemo(() => {
    if (!payload) return [];
    return buildViewerAlerts({
      payload,
      engagements,
      pendingOrderCount: pendingCount,
      rpUnread,
      systemSignals: economySystemSignals,
      callbacks: {
        onFocusIdleFleet: focusAlertIdleFleet,
        onFocusEngagement: focusAlertEngagement,
        onFocusOrders: focusAlertOrders,
        onFocusRp: focusAlertRp,
        onFocusEconomy: focusAlertEconomy,
        onFocusDiplo: focusAlertDiplo,
      },
    });
  }, [
    payload,
    engagements,
    pendingCount,
    rpUnread,
    focusAlertIdleFleet,
    focusAlertEngagement,
    focusAlertOrders,
    focusAlertDiplo,
    focusAlertRp,
    focusAlertEconomy,
    economySystemSignals,
  ]);

  return { viewerAlertItems };
}
