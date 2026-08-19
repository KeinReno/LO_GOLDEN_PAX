import { useCallback } from "react";
import type { MapCanvasApi } from "../../../renderers/MapCanvas";
import { useViewerChromeStore } from "../../../state/viewerChromeStore";
import { useViewerMapOverlayStore } from "../../../state/viewerMapOverlayStore";
import { useViewerOrderSessionStore } from "../../../state/viewerOrderSessionStore";
import { useViewerPanelFocusStore } from "../../../state/viewerPanelFocusStore";
import { useViewerSessionStore } from "../../../state/viewerSessionStore";
import { useViewerSystemDiveStore } from "../../../state/viewerSystemDiveStore";
import { useWorldStore } from "../../../state/worldStore";
import { navigateViewerRoom } from "../rooms-router/navigateViewerRoom";
import { recruitOpenGate } from "../../forces/recruitMapPick";
import {
  diveCloseWorldPatch,
  diveOpenWorldPatch,
  divePlanetWorldPatch,
} from "./diveNav";

export function useViewerDiveNav(mapApiRef: {
  current: MapCanvasApi | null;
}) {
  const setSelectedSystemId = useViewerSessionStore(
    (s) => s.setSelectedSystemId,
  );
  const setSheetOpen = useViewerChromeStore((s) => s.setSheetOpen);
  const setTouchMoveArmed = useViewerSessionStore((s) => s.setTouchMoveArmed);
  const setViewerCtx = useViewerMapOverlayStore((s) => s.setViewerCtx);
  const setEconomyLinkedSystemId = useViewerPanelFocusStore(
    (s) => s.setEconomyLinkedSystemId,
  );
  const openDive = useViewerSystemDiveStore((s) => s.openDive);
  const closeDive = useViewerSystemDiveStore((s) => s.closeDive);
  const closeSystemView = useWorldStore((s) => s.closeSystemView);

  const openPlayerSystem = useCallback(
    (systemId: string, planetId?: string) => {
      const pick = useViewerPanelFocusStore.getState().recruitMapPick;
      const gate = recruitOpenGate(pick, systemId);
      if (gate.action === "block") {
        useViewerOrderSessionStore.getState().setOrderMsg(gate.reason);
        return;
      }
      if (gate.action === "consume") {
        const dive = useViewerSystemDiveStore.getState();
        dive.setSystemPreferDeck("produce");
        dive.setSystemProduceTab(gate.tab);
        useViewerPanelFocusStore.getState().setRecruitMapPick(null);
        useViewerPanelFocusStore.getState().setTechMapHighlightIds([]);
        useViewerOrderSessionStore.getState().setOrderMsg(
          gate.tab === "ships"
            ? "Верфь. Зажмите карту корабля — спишутся металл, снабжение и население."
            : "Казармы. Зажмите карту отряда — спишутся металл, снабжение и население.",
        );
      }
      if (planetId) {
        navigateViewerRoom("map");
        openDive(systemId);
        setSelectedSystemId(systemId);
        setSheetOpen(false);
        setTouchMoveArmed(false);
        setViewerCtx(null);
        useWorldStore.setState(divePlanetWorldPatch(systemId, planetId));
        window.setTimeout(() => mapApiRef.current?.focusSystem(systemId), 80);
        return;
      }
      navigateViewerRoom("map");
      openDive(systemId);
      setSelectedSystemId(systemId);
      setSheetOpen(false);
      setTouchMoveArmed(false);
      setViewerCtx(null);
      useWorldStore.setState(diveOpenWorldPatch(systemId));
      window.setTimeout(() => mapApiRef.current?.focusSystem(systemId), 80);
    },
    [
      openDive,
      closeDive,
      closeSystemView,
      setSelectedSystemId,
      setSheetOpen,
      setTouchMoveArmed,
      setViewerCtx,
      mapApiRef,
    ],
  );

  const focusSystemOnMap = useCallback(
    (systemId: string) => {
      setSelectedSystemId(systemId);
      navigateViewerRoom("map");
      window.setTimeout(() => mapApiRef.current?.focusSystem(systemId), 80);
    },
    [setSelectedSystemId, mapApiRef],
  );

  const openPlayerPlanet = useCallback(
    (systemId: string, planetId: string) => {
      openPlayerSystem(systemId, planetId);
    },
    [openPlayerSystem],
  );

  const closePlayerSystem = useCallback(() => {
    closeDive();
    setEconomyLinkedSystemId(null);
    closeSystemView();
    useWorldStore.setState(diveCloseWorldPatch());
  }, [closeDive, closeSystemView, setEconomyLinkedSystemId]);

  return {
    openPlayerSystem,
    focusSystemOnMap,
    openPlayerPlanet,
    closePlayerSystem,
  };
}
