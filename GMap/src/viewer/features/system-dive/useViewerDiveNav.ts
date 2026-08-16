import { useCallback } from "react";
import type { MapCanvasApi } from "../../../renderers/MapCanvas";
import { useViewerChromeStore } from "../../../state/viewerChromeStore";
import { useViewerMapOverlayStore } from "../../../state/viewerMapOverlayStore";
import { useViewerPanelFocusStore } from "../../../state/viewerPanelFocusStore";
import { useViewerSessionStore } from "../../../state/viewerSessionStore";
import { useViewerSystemDiveStore } from "../../../state/viewerSystemDiveStore";
import { useWorldStore } from "../../../state/worldStore";
import { navigateViewerRoom } from "../rooms-router/navigateViewerRoom";
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
    (systemId: string) => {
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
      useWorldStore.setState(divePlanetWorldPatch(systemId, planetId));
    },
    [],
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
