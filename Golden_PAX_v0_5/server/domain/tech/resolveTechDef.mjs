/**
 * Resolve a tech from the live tree or alchemy combos. Ported verbatim
 * from GMap/server/techActions.mjs's resolveTechDef — already pure.
 */
export function resolveTechDef(content, techId) {
  if (!techId) return null;
  return content?.technologies?.[techId] || content?.tech_combos?.[techId] || null;
}
