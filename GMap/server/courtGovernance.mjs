/**
 * Court governance — scoped NPC effects, internal blocs, council seats.
 * Roster CRUD/posting live in courtRoster.mjs (extends this; does not replace it).
 *
 * Thin re-export barrel — implementation lives in ./courtGovernance/*.mjs.
 * Kept as the stable import path so existing `from "./courtGovernance.mjs"`
 * call sites across the server don't need to change.
 */
export {
  npcAvailable,
  defaultUnlockedSeatIds,
  ensureFactionCouncil,
  resolveSeatPortfolioId,
  getPortfolioDef,
  resolveOccupiedSeatBonus,
  isSeatUnlocked,
  unlockCouncilSeat,
  lockCouncilSeat,
} from "./courtGovernance/council.mjs";
export { ensureInternalBlocs, recomputeInternalBlocs } from "./courtGovernance/blocs.mjs";
export {
  ensurePlayerRulers,
  syncNpcPassiveEffects,
  systemHasGovernor,
  npcLoyaltyDeltaForSystem,
  npcProductionMultForSystem,
  factionScopedActiveEffects,
  npcTaskSpeedMult,
  courtPopGrowthEffects,
  explainNpcInfluence,
} from "./courtGovernance/passiveEffects.mjs";
