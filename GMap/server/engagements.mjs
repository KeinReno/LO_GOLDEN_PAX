/**
 * Engagement store + contact/resolve pipeline (P5 / A6).
 * Engagements live between ticks until stances lock or maxRounds.
 *
 * Thin re-export barrel — implementation lives in ./engagements/*.mjs.
 * Kept as the stable import path so existing `from "./engagements.mjs"`
 * call sites across the server don't need to change.
 */
export {
  ENGAGEMENTS_PATH,
  OPEN_ENGAGEMENT_STATUSES,
  isOpenEngagement,
  cancelEngagementsMissingForces,
  readEngagements,
  writeEngagements,
  createEngagement,
} from "./engagements/store.mjs";
export {
  resolveOpenEngagements,
  advanceEngagement,
  instantResolveEngagementIds,
} from "./engagements/resolveTick.mjs";
export { collectContactsAndAttacks } from "./engagements/contacts.mjs";
export {
  setEngagementStance,
  requestCardBattle,
  forceCardBattle,
  applyCardBattleTriggers,
  playEngagementCard,
  strikeEngagementFront,
  readyEngagementCard,
  stanceOrderEngagement,
  passEngagementCard,
  drawEngagementCard,
  reorderEngagementFront,
  retreatEngagementCard,
  claimEngagementTrophy,
  skipEngagementTrophy,
} from "./engagements/cardActions.mjs";
