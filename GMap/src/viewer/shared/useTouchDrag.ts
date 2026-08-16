import { useDrag } from "@use-gesture/react";
import type { UserDragConfig } from "@use-gesture/react";

const TOUCH_DRAG_DEFAULTS = {
  filterTaps: true,
  pointer: { touch: true },
} as const satisfies Partial<UserDragConfig>;

/** Touch-capable drag bind — canonical viewer gesture primitive. */
export function useTouchDrag(
  handler: Parameters<typeof useDrag>[0],
  config?: UserDragConfig,
) {
  return useDrag(handler, { ...TOUCH_DRAG_DEFAULTS, ...config });
}
