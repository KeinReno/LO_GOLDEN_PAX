/**
 * Single gesture vocabulary for GMap (viewer + editor chrome).
 * Map canvas (Pixi) and React overlays must share these meanings.
 *
 * tap / click     → select + light preview at source
 * long-press      → unit order ring (FleetOrderRing) or context fallback
 * drag            → spatial order (move / assign / attack via onUnitDrop)
 * RMB             → unit order ring when applicable, else context card
 * pinch / wheel   → camera zoom
 * double-tap      → drill-down (galaxy → system → planet)
 */

export const GESTURE = {
  longPressMs: 450,
  longPressMoveTolerancePx: 10,
  holdRingMs: 450,
  dragThresholdPx: 6,
  doubleTapMs: 400,
} as const;

export type GestureVerb =
  | "select"
  | "preview"
  | "move"
  | "context"
  | "confirm-danger"
  | "zoom"
  | "drill";
