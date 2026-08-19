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
import { questAttentionCount } from "./quests/questAttention";
import { writeStoredStart } from "./viewerNavTypes";
import { navigateViewerRoom } from "./features/rooms-router/navigateViewerRoom";
import { ECO_SECTION_STORAGE, type EconomySectionId } from "./economy/types";

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
  const setEconomyFocusCategory = useViewerPanelFocusStore(
    (s) => s.setEconomyFocusCategory,
  );
  const setEconomyFocusSection = useViewerPanelFocusStore(
    (s) => s.setEconomyFocusSection,
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
      setTouchMoveArmed(false);
      navigateViewerRoom("forces");
      window.setTimeout(
        () => mapApiRef.current?.focusSystem(systemId),
        80,
      );
    },
    [
      payload,
      mapApiRef,
      setSelectedFleetId,
      setSelectedLegionId,
      setSelectedSystemId,
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

  const focusAlertQuests = useCallback(() => {
    closeMapOverlays();
    setQueueOpen(false);
    setMenuOpen(false);
    setSettingsOpen(false);
    setMapFiltersOpen(false);
    setRpFloatOpen(false);
    setTouchMoveArmed(false);
    goView("quests");
    writeStoredStart("hq");
  }, [
    closeMapOverlays,
    goView,
    setQueueOpen,
    setMenuOpen,
    setSettingsOpen,
    setMapFiltersOpen,
    setRpFloatOpen,
    setTouchMoveArmed,
  ]);

  const focusAlertEconomy = useCallback(
    (anchor?: AlertFocusAnchor) => {
      const top = economySystemSignals[0];
      if (top?.category) {
        setEcoHighlightCategory(top.category);
        setEconomyFocusCategory(top.category);
      }
      if (top?.systemId) setEconomyLinkedSystemId(top.systemId);
      const section: EconomySectionId = top
        ? "production"
        : (economyPressure ?? 0) >= 2
          ? "policies"
          : "overview";
      setEconomyFocusSection(section);
      try {
        localStorage.setItem(ECO_SECTION_STORAGE, section);
      } catch {
        /* ignore */
      }
      setMenuOpen(false);
      setSettingsOpen(false);
      setMapFiltersOpen(false);
      setRpFloatOpen(false);
      setTouchMoveArmed(false);
      setEconomyPopover(null);
      goView("economy");
      void anchor;
    },
    [
      economySystemSignals,
      economyPressure,
      goView,
      setEcoHighlightCategory,
      setEconomyFocusCategory,
      setEconomyFocusSection,
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
      questAttention: questAttentionCount(payload),
      systemSignals: economySystemSignals,
      callbacks: {
        onFocusIdleFleet: focusAlertIdleFleet,
        onFocusEngagement: focusAlertEngagement,
        onFocusOrders: focusAlertOrders,
        onFocusRp: focusAlertRp,
        onFocusEconomy: focusAlertEconomy,
        onFocusDiplo: focusAlertDiplo,
        onFocusQuests: focusAlertQuests,
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
    focusAlertQuests,
    focusAlertRp,
    focusAlertEconomy,
    economySystemSignals,
  ]);

  return { viewerAlertItems };
}
