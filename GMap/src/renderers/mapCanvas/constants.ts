import { GESTURE } from "../../ui/gestureMap";

export const SYSTEM_HIT_R = 20;
export const SYSTEM_DROP_R = 72;
/** Kept close to SYSTEM_HIT_R — a fleet/legion sitting at a system must not
 * block tapping/opening the system underneath it (units are checked first). */
export const FLEET_HIT_R = 24;
export const LEGION_HIT_R = 22;
/** Minimum on-screen hit size (px) so finger targets stay usable when zoomed out. */
export const MIN_TOUCH_HIT_PX = 48;
/** Unit touch floor is kept below the system's (40) so a zoomed-out system tap
 * still resolves to the system, not a unit parked on top of it. */
export const MIN_TOUCH_HIT_UNIT_PX = 32;
export const DRAG_START_PX = 14;
export const LONG_PRESS_MS = GESTURE.longPressMs;
export const DOUBLE_TAP_MS = GESTURE.doubleTapMs;
/** Fleet/legion move tween duration (ms) when a unit's systemId changes. */
export const UNIT_TRANSIT_MS = 650;
export const LINK_HIT_PX = 10;
export const FLEET_ICON_SIZE = 36;
export const FLEET_ICON_SIZE_SEL = 44;
export const LEGION_ICON_SIZE = 34;
export const LEGION_ICON_SIZE_SEL = 40;

