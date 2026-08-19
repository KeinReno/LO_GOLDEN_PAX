/**
 * 3-stage stability revolt (v0.5 STABILITY_AND_REVOLT_SPEC), GMap-shaped.
 *
 * Planet `stability` is the revolt meter (occupation already writes it).
 * Loyalty stays independent (still receives stability_add 1:1) and does not
 * spawn rebels. loyalty < 20 drains this meter. Rebels are militia from
 * spent population (GMap override: not thin air).
 *
 * Thin re-export barrel — implementation lives in ./stabilityRevolt/*.mjs.
 * Kept as the stable import path so existing `from "./stabilityRevolt.mjs"`
 * call sites across the server don't need to change.
 */
export {
  STABILITY_START,
  STABILITY_MIN,
  STABILITY_MAX,
  STABILITY_NATURAL_DECAY,
  STABILITY_STAGE1_THRESHOLD,
  STABILITY_STAGE2_THRESHOLD,
  STABILITY_STAGE3_DURATION_TURNS,
  STABILITY_STAGE1_PROD_MULT,
  STABILITY_STAGE2_PROD_MULT,
  STABILITY_REBEL_POP_SHARE,
  LOYALTY_COLLAPSE_THRESHOLD,
  LOYALTY_COLLAPSE_DRAIN,
  stabilityCfg,
  clampStability,
  planetStabilityValue,
  stabilityBand,
  revoltStage,
  isRebelFactionId,
  isRebelForce,
  isRebelLegion,
  rebelForcesInSystem,
  tickPlanetStability,
  tickAllPlanetStability,
  revoltProductionEffects,
  collectRevoltProductionEffects,
  rebelCount,
  rebelFactionId,
  rebelFactionName,
  rebelColorHex,
  majorityRaceId,
} from "./stabilityRevolt/meter.mjs";
export {
  spawnRebelForce,
  ownerLegionAtPlanet,
  resolveRebelEngagement,
  shouldSecede,
  resolveSecession,
  applyPlanetRevolt,
  applyAllRevolts,
  applyStabilityRevolt,
} from "./stabilityRevolt/revoltMachine.mjs";
