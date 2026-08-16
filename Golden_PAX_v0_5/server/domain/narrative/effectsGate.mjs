/**
 * Ported verbatim from GMap/server/narrative.mjs's isIntentForbiddenByEffects
 * — already pure. Checks whether an active effect stack (e.g. from a
 * deficit, quest, or treaty) forbids a specific intent this turn.
 */
export function isIntentForbiddenByEffects(effects, intentId) {
  return (effects || []).some((e) => e.effect === "forbid_intent" && e.args?.intentId === intentId);
}
