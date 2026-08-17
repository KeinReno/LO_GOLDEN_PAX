/**
 * Technology research: spend Cognitio → unlock techs / upgrades / tiers / properties.
 *
 * Thin re-export barrel — implementation lives in ./techActions/*.mjs.
 * Kept as the stable import path so existing `from "./techActions.mjs"`
 * call sites across the server don't need to change.
 */
export {
  DEFAULT_TECH_TIERS,
  resolveTechDef,
  factionHasProperty,
  factionRaceSharePercent,
  collectTechModifierEffects,
  applyResearchCostMult,
  applyUnlockEffects,
  recomputeUnlocksFromTechs,
  factionMaxTier,
  canBuildWithTech,
} from "./techActions/helpers.mjs";
export {
  RESEARCH_QUEUE_MAX,
  canQueueTech,
  techAvailability,
  setResearchQueue,
  accelerateResearch,
  removeFromResearchQueue,
  researchPathTo,
} from "./techActions/queue.mjs";
export {
  researchTech,
  rerollResearchOffer,
  upgradeResearchedTechGrade,
  fillResearchedTechSocket,
  gmGrantTech,
  researchUpgrade,
} from "./techActions/actions.mjs";
