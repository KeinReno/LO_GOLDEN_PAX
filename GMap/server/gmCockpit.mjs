/**
 * C5 GM cockpit helpers — faction compare, session brief, intervention log.
 * Extends existing ops/balance surfaces; does not invent parallel state.
 *
 * Thin re-export barrel — implementation lives in ./gmCockpit/*.mjs.
 * Kept as the stable import path so existing `from "./gmCockpit.mjs"`
 * call sites across the server don't need to change.
 */
export {
  GM_INTERVENTIONS_PATH,
  appendGmIntervention,
  listGmInterventions,
} from "./gmCockpit/interventions.mjs";
export {
  buildFactionComparison,
  buildSessionBrief,
  listCockpitBackups,
} from "./gmCockpit/factionOverview.mjs";
export { runDryRunTick, markDryRunRestoreFailed } from "./gmCockpit/dryRun.mjs";
export { listGmPegMultipliers, setGmPegMultiplier } from "./gmCockpit/pegDials.mjs";
