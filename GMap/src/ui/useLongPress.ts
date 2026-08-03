import { useDrag } from "@use-gesture/react";
import { useCallback, useRef } from "react";
import { GESTURE } from "./gestureMap";

type LongPressHandlers = {
  onLongPress: (e: { x: number; y: number }) => void;
  onTap?: (e: { x: number; y: number }) => void;
  enabled?: boolean;
  ms?: number;
  /** Prevent native context menu while listening. */
  preventContextMenu?: boolean;
};

/**
 * Unified long-press / tap via @use-gesture (Pointer Events).
 * Use on React overlays; Pixi map keeps its own Federated handlers
 * but should use the same GESTURE.longPressMs.
 */
export function useLongPress({
  onLongPress,
  onTap,
  enabled = true,
  ms = GESTURE.longPressMs,
  preventContextMenu = true,
}: LongPressHandlers) {
  const firedRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const bind = useDrag(
    ({ first, last, movement: [mx, my], xy: [x, y], canceled, event }) => {
      if (!enabled) return;
      if (first) {
        firedRef.current = false;
        clear();
        timerRef.current = window.setTimeout(() => {
          firedRef.current = true;
          onLongPress({ x, y });
        }, ms);
      }
      const dist = Math.hypot(mx, my);
      if (dist > GESTURE.longPressMoveTolerancePx) {
        clear();
      }
      if (last) {
        const wasLong = firedRef.current;
        clear();
        if (!wasLong && !canceled && dist <= GESTURE.dragThresholdPx) {
          onTap?.({ x, y });
        }
        firedRef.current = false;
      }
      if (preventContextMenu && event && "preventDefault" in event) {
        const pe = event as PointerEvent;
        if (pe.pointerType === "touch" || pe.type === "contextmenu") {
          pe.preventDefault?.();
        }
      }
    },
    {
      filterTaps: true,
      threshold: 0,
      pointer: { touch: true },
    },
  );

  return bind;
}
