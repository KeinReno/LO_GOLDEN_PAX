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
  isLiveResearchDef,
  pruneNonLiveUnlockedTechs,
  factionHasProperty,
  factionRaceSharePercent,
  collectTechModifierEffects,
  applyResearchCostMult,
  applyUnlockEffects,
  recomputeUnlocksFromTechs,
  stripTechFromEco,
  factionMaxTier,
  canBuildWithTech,
  collectRequiredProperties,
  collectBuildingUnlockEffects,
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
  gmRevokeTech,
  researchUpgrade,
} from "./techActions/actions.mjs";
