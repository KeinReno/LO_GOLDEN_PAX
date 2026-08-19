/**
 * Combat resolve by roles + matchups + composition casualties (P5 / A6).
 * Veterancy, stationary defense units, assault phases.
 *
 * Thin re-export barrel — implementation lives in ./combatResolve/*.mjs.
 * Kept as the stable import path so existing `from "./combatResolve.mjs"`
 * call sites across the server don't need to change.
 */
export { propertyCombatBreakdown, propertyCombatMult } from "./combatResolve/properties.mjs";
export {
  veterancyConfig,
  levelFromXp,
  applyVeterancyOnUnitUpgrade,
  applyUnitUpgradeEffectsToWorld,
  awardVeterancyXp,
} from "./combatResolve/veterancy.mjs";
export { gatherDefenseUnits, buildDefenseLayers } from "./combatResolve/defenseLayers.mjs";
export {
  gatherGroups,
  applyCourtStatMultToGroups,
  applyCombatRoleBonus,
  totalPower,
  applyCasualties,
  persistStationaryCasualties,
  pruneDestroyedGroups,
  cleanupEmptyComposition,
} from "./combatResolve/fightMath.mjs";
export { resolveEngagementFight, resolveAssaultPhase, ASSAULT_PHASES } from "./combatResolve/resolve.mjs";
