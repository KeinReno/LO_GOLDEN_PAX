/**
 * Quest engine (A9): yearly rolls, choice/dice resolution, one-shot effects.
 *
 * Thin re-export barrel — implementation lives in ./questEngine/*.mjs.
 * Kept as the stable import path so existing `from "./questEngine.mjs"`
 * call sites across the server don't need to change.
 */
export { matchesFilter, buildFilterContext } from "./questEngine/queryHelpers.mjs";
export { stockCostsFromEffects } from "./questEngine/effects.mjs";
export {
  rollYearlyQuests,
  hasRolledYearlyQuests,
  expireQuests,
  resolveQuestChoice,
  resolveQuestDice,
  normalizeQuest,
} from "./questEngine/resolve.mjs";
