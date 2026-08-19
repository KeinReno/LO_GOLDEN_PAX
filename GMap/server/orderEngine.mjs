/**
 * B4 — Order + AP time engine (ETA processes, accumulating research).
 * Single time model: game hours = turn × HOURS_PER_TURN.
 *
 * Thin re-export barrel — implementation lives in ./orderEngine/*.mjs.
 * Kept as the stable import path so existing `from "./orderEngine.mjs"`
 * call sites across the server don't need to change.
 */
export {
  HOURS_PER_TURN,
  intentCategory,
  gameHourAtTurn,
  turnsUntil,
  hoursRemaining,
  buildHoursFromTier,
  resolveBuildHours,
  systemDistance,
  resolveFleetSpeed,
  resolveLegionSpeed,
  applyDurationModifiers,
  computeFleetMoveEta,
  computeLegionMoveEta,
  shouldCreateEtaOrder,
} from "./orderEngine/time.mjs";
export {
  activeOrders,
  reservedApFromOrders,
  reservedForceApFromOrders,
  normalizePlayerOrder,
  formatOrderEtaSummary,
} from "./orderEngine/queries.mjs";
export { createOrderFromIntent } from "./orderEngine/create.mjs";
export { resolveDueOrders } from "./orderEngine/resolve.mjs";
