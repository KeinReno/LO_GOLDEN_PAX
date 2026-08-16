import type { ReactNode } from "react";
import { HoldRing } from "../../../ui/HoldRing";
import { useViewerMapOverlayStore } from "../../../state/viewerMapOverlayStore";

type Props = {
  children?: ReactNode;
};

/** Hold-progress ring; other overlays stay as children (order ring / ctx). */
export function MapOverlays({ children }: Props) {
  const holdProgress = useViewerMapOverlayStore((s) => s.holdProgress);
  return (
    <>
      {holdProgress && (
        <HoldRing
          x={holdProgress.x}
          y={holdProgress.y}
          progress={holdProgress.progress}
        />
      )}
      {children}
    </>
  );
}
