import { useCallback } from "react";
import type {
  MapCanvasApi,
  MapContextPick,
  MapUnitDropPayload,
} from "../../../renderers/MapCanvas";
import { hopDistance } from "../../../state/pathfinding";
import type { ViewerPayload } from "../../../state/types";
import { useViewerChromeStore } from "../../../state/viewerChromeStore";
import { useViewerMapOverlayStore } from "../../../state/viewerMapOverlayStore";
import { useViewerOrderSessionStore } from "../../../state/viewerOrderSessionStore";
import { useViewerSessionStore } from "../../../state/viewerSessionStore";
import { resolveFleetOrderRing } from "../../FleetOrderRing";
import { noPathNote } from "../order-orchestrator/unitOrderCopy";
import {
  caravanDropAmount,
  pickTargetSetNote,
  resolveMapSystemClick,
} from "./mapClickResolve";

export type ViewerMapPlayActions = {
  onUnitDrop: (drop: MapUnitDropPayload) => void;
  submitMoveOrder: (
    kind: "fleet" | "legion",
    unitId: string,
    toSystemId: string,
    hops?: number,
  ) => void;
  sendCaravan: (cardId: string, toSystemId: string, amount: number) => void;
  openPlayerSystem: (systemId: string) => void;
};

type Opts = {
  payload: ViewerPayload | null;
  mobile: boolean;
  bump: () => void;
  mapApiRef: { current: MapCanvasApi | null };
  actions: ViewerMapPlayActions;
};

export function useViewerMapCanvasEvents({
  payload,
  mobile,
  bump,
  mapApiRef,
  actions,
}: Opts) {
  const viewMode = useViewerSessionStore((s) => s.viewMode);
  const selectedFleetId = useViewerSessionStore((s) => s.selectedFleetId);
  const selectedLegionId = useViewerSessionStore((s) => s.selectedLegionId);
  const setSelectedSystemId = useViewerSessionStore((s) => s.setSelectedSystemId);
  const setSelectedFleetId = useViewerSessionStore((s) => s.setSelectedFleetId);
  const setSelectedLegionId = useViewerSessionStore((s) => s.setSelectedLegionId);
  const setTargetSystemId = useViewerSessionStore((s) => s.setTargetSystemId);
  const setPickingTarget = useViewerSessionStore((s) => s.setPickingTarget);
  const setTouchMoveArmed = useViewerSessionStore((s) => s.setTouchMoveArmed);
  const setSheetOpen = useViewerChromeStore((s) => s.setSheetOpen);
  const setQueueOpen = useViewerChromeStore((s) => s.setQueueOpen);
  const setViewerCtx = useViewerMapOverlayStore((s) => s.setViewerCtx);
  const setOrderRing = useViewerMapOverlayStore((s) => s.setOrderRing);
  const setHoldProgress = useViewerMapOverlayStore((s) => s.setHoldProgress);
  const setOrderMsg = useViewerOrderSessionStore((s) => s.setOrderMsg);

  const openFleetOrderRing = useCallback(
    (pick: MapContextPick) => {
      if (!payload) return false;
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
      setViewerCtx,
      setOrderRing,
      setSheetOpen,
      setTouchMoveArmed,
      setSelectedFleetId,
      setSelectedLegionId,
      setSelectedSystemId,
      setTargetSystemId,
    ],
  );

  const onUnitDrop = (drop: MapUnitDropPayload) => {
    setTouchMoveArmed(false);
    actions.onUnitDrop(drop);
  };

  const onUnitDropReject = (msg: string) => setOrderMsg(msg);

  const onUnitDragStart = (kind: "fleet" | "legion", unitId: string) => {
    if (!payload) return;
    if (kind === "fleet") {
      setSelectedFleetId(unitId);
      setSelectedLegionId(null);
      const fleet = payload.world.fleets.find((f) => f.id === unitId);
      if (fleet) setSelectedSystemId(fleet.systemId);
    } else {
      setSelectedLegionId(unitId);
      setSelectedFleetId(null);
      const leg = payload.world.legions.find((l) => l.id === unitId);
      if (leg) setSelectedSystemId(leg.systemId);
    }
    setSheetOpen(false);
    setTouchMoveArmed(false);
    bump();
  };

  const onViewerContextMenu = (pick: MapContextPick) => {
    if (openFleetOrderRing(pick)) return;
    setViewerCtx(pick);
    setSheetOpen(false);
    setTouchMoveArmed(false);
    if (pick.fleetId) {
      setSelectedFleetId(pick.fleetId);
      setSelectedLegionId(null);
    } else if (pick.legionId) {
      setSelectedLegionId(pick.legionId);
      setSelectedFleetId(null);
    }
    if (pick.systemId) setSelectedSystemId(pick.systemId);
  };

  const onSystemHold = (systemId: string, screenX: number, screenY: number) => {
    openFleetOrderRing({
      screenX,
      screenY,
      worldX: 0,
      worldY: 0,
      systemId,
      fleetId: selectedFleetId,
      legionId: selectedLegionId,
      linkId: null,
    });
  };

  const onSystemOpen = (id: string) => {
    setSelectedSystemId(id);
    setSheetOpen(false);
    setTouchMoveArmed(false);
    actions.openPlayerSystem(id);
  };

  const onSystemClick = (id: string | null) => {
    if (!payload) return;
    const session = useViewerSessionStore.getState();
    if (id) setTargetSystemId(id);
    const unitKind = session.selectedLegionId ? "legion" : "fleet";
    const unitId = session.selectedLegionId ?? session.selectedFleetId;
    const unit =
      unitKind === "legion"
        ? payload.world.legions.find((l) => l.id === unitId) ?? null
        : payload.world.fleets.find((f) => f.id === unitId) ?? null;
    const hops =
      id && unit
        ? hopDistance(payload.world, unit.systemId, id)
        : 0;
    const decision = resolveMapSystemClick({
      systemId: id,
      pickingTarget: session.pickingTarget,
      touchMoveArmed: session.touchMoveArmed,
      selectedFleetId: session.selectedFleetId,
      selectedLegionId: session.selectedLegionId,
      factionId: payload.factionId,
      mobile,
      viewMode: session.viewMode,
      systemName: id
        ? payload.world.systems.find((s) => s.id === id)?.name
        : undefined,
      unit,
      hops: Number.isFinite(hops) ? hops : 0,
    });
    if (decision.kind === "pick-target") {
      setSelectedSystemId(decision.systemId);
      setPickingTarget(false);
      setOrderMsg(pickTargetSetNote(decision.name));
      setQueueOpen(true);
      bump();
      return;
    }
    if (decision.kind === "touch-move") {
      setTouchMoveArmed(false);
      actions.submitMoveOrder(
        decision.unitKind,
        decision.unitId,
        decision.toSystemId,
        decision.hops,
      );
      bump();
      return;
    }
    if (decision.kind === "touch-move-fail") {
      setTouchMoveArmed(false);
      setOrderMsg(noPathNote());
      bump();
      return;
    }
    if (session.touchMoveArmed) setTouchMoveArmed(false);
    setSelectedFleetId(null);
    setSelectedLegionId(null);
    setSelectedSystemId(decision.systemId);
    if (decision.openSheet) setSheetOpen(true);
    bump();
  };

  const onFleetClick = (id: string) => {
    if (!payload) return;
    setSelectedFleetId(
      useViewerSessionStore.getState().selectedFleetId === id ? null : id,
    );
    setSelectedLegionId(null);
    const fleet = payload.world.fleets.find((f) => f.id === id);
    if (fleet) setSelectedSystemId(fleet.systemId);
    setTouchMoveArmed(false);
    if (mobile && viewMode === "map") setSheetOpen(true);
    bump();
  };

  const onLegionClick = (id: string) => {
    if (!payload) return;
    setSelectedLegionId(
      useViewerSessionStore.getState().selectedLegionId === id ? null : id,
    );
    setSelectedFleetId(null);
    const leg = payload.world.legions.find((l) => l.id === id);
    if (leg) setSelectedSystemId(leg.systemId);
    setTouchMoveArmed(false);
    if (mobile && viewMode === "map") setSheetOpen(true);
    bump();
  };

  const onStockpileMapDrop = (cardId: string, pos: { x: number; y: number }) => {
    if (!payload) return;
    const sys = mapApiRef.current?.hitTestSystemAtClient(pos.x, pos.y);
    if (!sys) return;
    const stock = payload.economy?.stocks?.[cardId] ?? 0;
    actions.sendCaravan(cardId, sys.id, caravanDropAmount(stock));
  };

  return {
    openFleetOrderRing,
    onUnitDrop,
    onUnitDropReject,
    onUnitDragStart,
    onViewerContextMenu,
    onSystemHold,
    onHoldProgress: setHoldProgress,
    onSystemOpen,
    onSystemClick,
    onFleetClick,
    onLegionClick,
    onStockpileMapDrop,
  };
}
