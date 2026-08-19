import { useCallback, useEffect } from "react";
import type {
  MapCanvasApi,
  MapContextPick,
  MapUnitDropPayload,
} from "../../../renderers/MapCanvas";
import { cycleStackSelection } from "../../../renderers/forceOrbitLayout";
import { hopDistance } from "../../../state/pathfinding";
import type { ViewerPayload } from "../../../state/types";
import { useViewerChromeStore } from "../../../state/viewerChromeStore";
import { useViewerMapOverlayStore } from "../../../state/viewerMapOverlayStore";
import { useViewerOrderSessionStore } from "../../../state/viewerOrderSessionStore";
import { useViewerPanelFocusStore } from "../../../state/viewerPanelFocusStore";
import { useViewerSessionStore } from "../../../state/viewerSessionStore";
import { resolveFleetOrderRing } from "../../FleetOrderRing";
import { isInputFocused } from "../../hooks/isInputFocused";
import { noPathNote } from "../order-orchestrator/unitOrderCopy";
import {
  caravanDropAmount,
  pickTargetSetNote,
  resolveMapSystemClick,
} from "./mapClickResolve";
import { navigateViewerRoom } from "../rooms-router/navigateViewerRoom";

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
    if (id && useViewerPanelFocusStore.getState().recruitMapPick) {
      setSelectedSystemId(id);
      setSheetOpen(false);
      setTouchMoveArmed(false);
      actions.openPlayerSystem(id);
      bump();
      return;
    }
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
    if (decision.openSheet) {
      navigateViewerRoom("map");
      setSheetOpen(true);
    }
    bump();
  };

  const onFleetClick = (
    id: string,
    screen?: { x: number; y: number },
    retain?: boolean,
  ) => {
    if (!payload) return;
    const prev = useViewerSessionStore.getState().selectedFleetId;
    const next = retain
      ? id
      : cycleStackSelection(payload.world.fleets, id, prev);
    setSelectedFleetId(next);
    setSelectedLegionId(null);
    const fleet = payload.world.fleets.find((f) => f.id === (next ?? id));
    if (fleet) setSelectedSystemId(fleet.systemId);
    setTouchMoveArmed(false);
    if (mobile && viewMode === "map") setSheetOpen(true);
    if (
      next &&
      fleet?.factionId === payload.factionId &&
      screen &&
      !mobile
    ) {
      openFleetOrderRing({
        screenX: screen.x,
        screenY: screen.y,
        worldX: 0,
        worldY: 0,
        systemId: fleet.systemId,
        fleetId: next,
        legionId: null,
        linkId: null,
        fromFleetHit: true,
      });
    } else if (!next) {
      setOrderRing(null);
    }
    bump();
  };

  const onLegionClick = (
    id: string,
    screen?: { x: number; y: number },
    retain?: boolean,
  ) => {
    if (!payload) return;
    const prev = useViewerSessionStore.getState().selectedLegionId;
    const next = retain
      ? id
      : cycleStackSelection(payload.world.legions, id, prev);
    setSelectedLegionId(next);
    setSelectedFleetId(null);
    const leg = payload.world.legions.find((l) => l.id === (next ?? id));
    if (leg) setSelectedSystemId(leg.systemId);
    setTouchMoveArmed(false);
    if (mobile && viewMode === "map") setSheetOpen(true);
    if (
      next &&
      leg?.factionId === payload.factionId &&
      screen &&
      !mobile
    ) {
      openFleetOrderRing({
        screenX: screen.x,
        screenY: screen.y,
        worldX: 0,
        worldY: 0,
        systemId: leg.systemId,
        fleetId: null,
        legionId: next,
        linkId: null,
        fromLegionHit: true,
      });
    } else if (!next) {
      setOrderRing(null);
    }
    bump();
  };

  useEffect(() => {
    if (!payload) return;
    const onKey = (e: KeyboardEvent) => {
      if (isInputFocused(e.target) || e.ctrlKey || e.metaKey) return;
      if (e.key !== "[" && e.key !== "]") return;
      e.preventDefault();
      const session = useViewerSessionStore.getState();
      const dir = e.key === "]" ? 1 : -1;
      if (session.selectedFleetId) {
        const f = payload.world.fleets.find((x) => x.id === session.selectedFleetId);
        if (!f) return;
        const stack = payload.world.fleets.filter(
          (x) => x.systemId === f.systemId && x.factionId === f.factionId,
        );
        if (stack.length < 2) return;
        const idx = stack.findIndex((x) => x.id === f.id);
        const next = stack[(idx + dir + stack.length) % stack.length]!;
        setSelectedFleetId(next.id);
        bump();
        return;
      }
      if (session.selectedLegionId) {
        const l = payload.world.legions.find((x) => x.id === session.selectedLegionId);
        if (!l) return;
        const stack = payload.world.legions.filter(
          (x) => x.systemId === l.systemId && x.factionId === l.factionId,
        );
        if (stack.length < 2) return;
        const idx = stack.findIndex((x) => x.id === l.id);
        const next = stack[(idx + dir + stack.length) % stack.length]!;
        setSelectedLegionId(next.id);
        bump();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [payload, setSelectedFleetId, setSelectedLegionId, bump]);

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
