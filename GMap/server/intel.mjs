/**
 * Intel Fog — knowledge levels 0–4 per entity type for each faction.
 * Monotonic only (never decreases). Own entities always level 4.
 * No decay, no disinformation.
 *
 * Thin re-export barrel — implementation lives in ./intel/*.mjs.
 * Kept as the stable import path so existing `from "./intel.mjs"`
 * call sites across the server don't need to change.
 */
export {
  INTEL_PATH,
  getIntelRules,
  clampLevel,
  levelFromProgress,
  readIntelStore,
  writeIntelStore,
  ensureFactionIntel,
  getLevel,
  setKnowledgeLevel,
  canEspionage,
  markEspionageUsed,
} from "./intel/store.mjs";
export {
  bootstrapOwnKnowledge,
  bumpSystemIntel,
  applySystemDiscovery,
  updateIntelFromDiplomacy,
  processIntelTick,
} from "./intel/discovery.mjs";
export {
  publicIntelPayload,
  approximateStat,
  approximateStats,
  maskEntityByLevel,
  maskFactionForIntel,
} from "./intel/masking.mjs";
