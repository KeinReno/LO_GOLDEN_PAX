/**
 * Bilateral relation lookup (neutral/war/alliance/trade/...). Ported from
 * GMap/server/opinionTick.mjs's getRelation — same sorted-pair-key
 * convention, reshaped to read from a plain relations map instead of
 * `world.diplomacy` edges, since there's no world model here yet.
 *
 * @typedef {Record<string, string>} RelationsTable  key: `${minId}|${maxId}` -> relation
 */

/** @param {RelationsTable} relations */
export function relationKey(aId, bId) {
  return aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
}

/** @param {RelationsTable} relations */
export function getRelation(relations, aId, bId) {
  if (!aId || !bId || aId === bId) return "neutral";
  return relations?.[relationKey(aId, bId)] ?? "neutral";
}

/** @param {RelationsTable} relations */
export function setRelation(relations, aId, bId, relation) {
  return { ...relations, [relationKey(aId, bId)]: relation };
}
