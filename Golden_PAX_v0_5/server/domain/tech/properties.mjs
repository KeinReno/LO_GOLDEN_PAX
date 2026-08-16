/**
 * Ported verbatim from GMap/server/techActions.mjs's factionHasProperty —
 * already pure. A few properties are available from turn 1 without any
 * research; the rest come from techAccount.unlockedProperties (populated
 * by researchTech.mjs / domain/court's civic building unlocks — see
 * domain/court/civicAccount.mjs's header for that sharing).
 */
const BASE_PROPERTIES = new Set(["strong", "malleable", "fuel", "energy", "toxic", "weapon"]);

/** @param {{ unlockedProperties?: string[] }} techAccount */
export function factionHasProperty(techAccount, property) {
  if (BASE_PROPERTIES.has(property)) return true;
  return (techAccount?.unlockedProperties || []).includes(property);
}
