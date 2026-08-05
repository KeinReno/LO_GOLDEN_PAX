import { useDrag } from "@use-gesture/react";
import { useCallback, useRef, type CSSProperties } from "react";
import { GESTURE } from "./gestureMap";

/** @use-gesture expects touch-action: none on the bind target (dev warning + scroll jank). */
export function mergeGestureBindProps(
  props: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...props,
    style: {
      touchAction: "none",
      ...(props.style as CSSProperties | undefined),
    },
  };
}

type LongPressHandlers = {
  onLongPress: (e: { x: number; y: number }) => void;
  onTap?: (e: { x: number; y: number }) => void;
  enabled?: boolean;
  ms?: number;
  /** Prevent native context menu while listening. */
  preventContextMenu?: boolean;
  /**
   * Pointer capture blocks HTML5 dragstart on the same element.
   * Keep true for menus; set false when the target is also `draggable`.
   */
  pointerCapture?: boolean;
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
  pointerCapture = true,
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
      threshold: GESTURE.dragThresholdPx,
      pointer: { touch: true, capture: pointerCapture },
      preventScroll: pointerCapture,
    },
  );

  return useCallback(() => mergeGestureBindProps(bind()), [bind]);
}
