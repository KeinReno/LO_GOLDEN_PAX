/**
 * Compatibility shim — one revolt machine lives in stabilityRevolt.mjs.
 * Planet `stability` is the meter; loyalty is display/input (seed if unset).
 */
export {
  stabilityCfg as revoltCfg,
  STABILITY_STAGE1_THRESHOLD as STAGE1_THRESHOLD,
  STABILITY_STAGE2_THRESHOLD as STAGE2_THRESHOLD,
  STABILITY_STAGE3_DURATION_TURNS as STAGE3_DURATION_TURNS,
  STABILITY_STAGE1_PROD_MULT as STAGE1_PROD_MULT,
  STABILITY_STAGE2_PROD_MULT as STAGE2_PROD_MULT,
  STABILITY_REBEL_POP_SHARE as REBEL_POP_SHARE,
  revoltStage,
  planetStabilityValue as revoltMeter,
  isRebelFactionId,
  isRebelForce,
  isRebelLegion,
  rebelForcesInSystem as rebelLegionsInSystem,
  rebelCount,
  spawnRebelForce,
  resolveRebelEngagement,
  resolveSecession,
  shouldSecede,
  rebelFactionId,
  rebelFactionName,
  majorityRaceId,
  ownerLegionAtPlanet,
  revoltProductionEffects,
  collectRevoltProductionEffects,
  applyPlanetRevolt,
  applyAllRevolts,
  applyStabilityRevolt,
} from "./stabilityRevolt.mjs";
