import { useEffect } from "react";
import type { ViewerPayload } from "../../state/types";
import { useViewerOrderSessionStore } from "../../state/viewerOrderSessionStore";
import { useViewerSessionStore } from "../../state/viewerSessionStore";
import { isInputFocused } from "../useViewerHotkeys";

export function useViewerPlaySessionEffects(opts: {
  bump: () => void;
  payload: ViewerPayload | null;
  layers: unknown;
  perfMode: unknown;
  mapStyle: unknown;
  graphics: unknown;
  mapBackgroundPaused: boolean;
  economyBottleneckSystemIds: unknown;
}) {
  const {
    bump,
    payload,
    layers,
    perfMode,
    mapStyle,
    graphics,
    mapBackgroundPaused,
    economyBottleneckSystemIds,
  } = opts;

  const selectedSystemId = useViewerSessionStore((s) => s.selectedSystemId);
  const selectedFleetId = useViewerSessionStore((s) => s.selectedFleetId);
  const selectedLegionId = useViewerSessionStore((s) => s.selectedLegionId);
  const pickingTarget = useViewerSessionStore((s) => s.pickingTarget);
  const touchMoveArmed = useViewerSessionStore((s) => s.touchMoveArmed);
  const setSelectedFleetId = useViewerSessionStore((s) => s.setSelectedFleetId);
  const setSelectedLegionId = useViewerSessionStore(
    (s) => s.setSelectedLegionId,
  );
  const setPickingTarget = useViewerSessionStore((s) => s.setPickingTarget);
  const setTouchMoveArmed = useViewerSessionStore((s) => s.setTouchMoveArmed);

  const orderMsg = useViewerOrderSessionStore((s) => s.orderMsg);
  const setOrderMsg = useViewerOrderSessionStore((s) => s.setOrderMsg);
  const flowData = useViewerOrderSessionStore((s) => s.flowData);

  useEffect(() => {
    bump();
  }, [
    bump,
    layers,
    perfMode,
    mapStyle,
    graphics,
    mapBackgroundPaused,
    selectedSystemId,
    selectedFleetId,
    selectedLegionId,
    payload,
  ]);

  useEffect(() => {
    if (!orderMsg || pickingTarget) return;
    const t = window.setTimeout(() => setOrderMsg(null), 4500);
    return () => window.clearTimeout(t);
  }, [orderMsg, pickingTarget, setOrderMsg]);

  useEffect(() => {
    if (!pickingTarget && !touchMoveArmed && !selectedFleetId && !selectedLegionId)
      return;
    const onKey = (e: KeyboardEvent) => {
      if (isInputFocused(e.target)) return;
      if (e.key === "Escape") {
        setPickingTarget(false);
        setTouchMoveArmed(false);
        setOrderMsg(null);
        setSelectedFleetId(null);
        setSelectedLegionId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    pickingTarget,
    touchMoveArmed,
    selectedFleetId,
    selectedLegionId,
    setOrderMsg,
    setPickingTarget,
    setSelectedFleetId,
    setSelectedLegionId,
    setTouchMoveArmed,
  ]);

  useEffect(() => {
    bump();
  }, [bump, flowData, economyBottleneckSystemIds]);
}
