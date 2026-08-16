/**
 * Content lookup helpers. Ported verbatim from GMap/server/planetActions.mjs
 * (module-private there — exported here since domain/* functions are meant
 * to be unit-tested directly, CLAUDE.md rule 3). No racial-variant
 * resolution (GMap's variantResolver.mjs) — that's a deferred layer on top,
 * see README.md "Status".
 */

function normalizeColonyType(type) {
  if (!type || type === "none") return "none";
  if (type === "capital") return "core";
  return type;
}

export function defForKindZone(content, kind, zone) {
  return Object.values(content.buildings || {}).find((d) => d.kind === kind && d.zone === zone);
}

/** Prefer exact buildingId/baseBuildingId; fall back to kind+zone. */
export function buildingDefFromInstance(content, buildingInst) {
  const defs = content.buildings || {};
  const id = buildingInst?.buildingId || buildingInst?.id;
  if (id && defs[id]) return defs[id];
  const baseId = buildingInst?.baseBuildingId;
  if (baseId && defs[baseId]) return defs[baseId];
  return defForKindZone(content, buildingInst?.kind, buildingInst?.zone);
}

export function colonyDefForType(content, colonyType) {
  const t = normalizeColonyType(colonyType);
  return Object.values(content.colonies || {}).find((d) => d.colonyType === t);
}

export { normalizeColonyType };
