/**
 * Narrative POI / refugees / timers / consequence presets (P6).
 * NPC court tasks (A10).
 *
 * Thin re-export barrel — implementation lives in ./narrative/*.mjs.
 * Kept as the stable import path so existing `from "./narrative.mjs"`
 * call sites across the server don't need to change.
 */
export * from "./narrative/poiTimersRefugees.mjs";
export * from "./narrative/courtTasks.mjs";
