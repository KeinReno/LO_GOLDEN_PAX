import { useViewerOrderSessionStore } from "../../../state/viewerOrderSessionStore";
import { mergeActionAp, type ActionApPayload } from "./orderApMerge";

export function commitViewerActionAp(
  data: ActionApPayload,
  fallback?: { apCost?: number; forceCost?: number },
) {
  const s = useViewerOrderSessionStore.getState();
  const next = mergeActionAp(
    {
      reservedAp: s.reservedAp,
      apMax: s.apMax,
      reservedForceAp: s.reservedForceAp,
      forceApMax: s.forceApMax,
    },
    data,
    fallback,
  );
  s.applyApFromApi(next);
  return next;
}
