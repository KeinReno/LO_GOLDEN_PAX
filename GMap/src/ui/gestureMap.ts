/**
 * Single gesture vocabulary for GMap (viewer + editor chrome).
 * Map canvas (Pixi) and React overlays must share these meanings.
 *
 * tap / click     → select + light preview at source
 * long-press      → irreversible / secondary (demolish, attack confirm)
 * drag            → spatial order (move / assign)
 * RMB / two-finger→ context card at pointer (FloatingPopover)
 * pinch / wheel   → camera zoom
 * double-tap      → drill-down (galaxy → system → planet)
 */

export const GESTURE = {
  longPressMs: 450,
  longPressMoveTolerancePx: 10,
  holdRingMs: 450,
  dragThresholdPx: 6,
  doubleTapMs: 280,
} as const;

export type GestureVerb =
  | "select"
  | "preview"
  | "move"
  | "context"
  | "confirm-danger"
  | "zoom"
  | "drill";
