import type { OrderType, ViewerPayload } from "../../../state/types";
import { useViewerOrderSessionStore } from "../../../state/viewerOrderSessionStore";
import { useViewerSessionStore } from "../../../state/viewerSessionStore";
import { PlayerOrdersPanel } from "../../PlayerHqPanels";
import { pickTargetNote } from "../order-orchestrator/unitOrderCopy";
import { navigateViewerRoom } from "../rooms-router/navigateViewerRoom";

type Props = {
  payload: ViewerPayload;
  onSubmit: () => void;
  onCancelOrder: (id: string) => void;
};

export function ViewerPlayOrdersPanel({
  payload,
  onSubmit,
  onCancelOrder,
}: Props) {
  const orderType = useViewerOrderSessionStore((s) => s.orderType);
  const orderNote = useViewerOrderSessionStore((s) => s.orderNote);
  const orderMsg = useViewerOrderSessionStore((s) => s.orderMsg);
  const setOrderType = useViewerOrderSessionStore((s) => s.setOrderType);
  const setOrderNote = useViewerOrderSessionStore((s) => s.setOrderNote);
  const setOrderMsg = useViewerOrderSessionStore((s) => s.setOrderMsg);

  const selectedFleetId = useViewerSessionStore((s) => s.selectedFleetId);
  const selectedLegionId = useViewerSessionStore((s) => s.selectedLegionId);
  const targetSystemId = useViewerSessionStore((s) => s.targetSystemId);
  const setSelectedFleetId = useViewerSessionStore((s) => s.setSelectedFleetId);
  const setSelectedLegionId = useViewerSessionStore(
    (s) => s.setSelectedLegionId,
  );
  const setTargetSystemId = useViewerSessionStore((s) => s.setTargetSystemId);
  const setPickingTarget = useViewerSessionStore((s) => s.setPickingTarget);

  const selectedFleetName =
    (payload.world.fleets ?? []).find((f) => f.id === selectedFleetId)?.name ??
    null;
  const selectedLegionName =
    (payload.world.legions ?? []).find((l) => l.id === selectedLegionId)
      ?.name ?? null;

  return (
    <PlayerOrdersPanel
      payload={payload}
      orderType={orderType}
      setOrderType={(t) => setOrderType(t as OrderType)}
      orderNote={orderNote}
      setOrderNote={setOrderNote}
      orderMsg={orderMsg}
      selectedFleetId={selectedFleetId}
      setSelectedFleetId={setSelectedFleetId}
      selectedLegionId={selectedLegionId}
      setSelectedLegionId={setSelectedLegionId}
      selectedFleetName={selectedFleetName}
      selectedLegionName={selectedLegionName}
      targetSystemId={targetSystemId}
      setTargetSystemId={setTargetSystemId}
      onSubmit={onSubmit}
      onCancelOrder={onCancelOrder}
      onPickTargetOnMap={() => {
        setPickingTarget(true);
        setOrderMsg(pickTargetNote());
        navigateViewerRoom("map");
      }}
      onOpenMap={() => navigateViewerRoom("map")}
    />
  );
}
