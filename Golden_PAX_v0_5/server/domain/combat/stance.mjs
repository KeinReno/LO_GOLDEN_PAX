/** Ported verbatim from GMap/server/combatResolve.mjs. */
const STANCE_DEFAULT = { powerMult: 1, casualtyTakenMult: 1 };

export function stanceMult(content, stanceId) {
  return content.combat_stances?.[stanceId] || STANCE_DEFAULT;
}
