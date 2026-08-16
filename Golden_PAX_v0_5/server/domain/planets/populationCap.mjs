import { buildingDefFromInstance, colonyDefForType, normalizeColonyType } from "./buildingDefs.mjs";

/**
 * Population cap from base + buildings' pop_cap_add effects + colony-type
 * bonus. Ported verbatim from GMap/server/planetActions.mjs's
 * planetCapFromBuildings — already pure. This is the real `cap` input
 * domain/economy's population growth curve needs (see
 * domain/economy/populationGrowth.mjs) — previously always caller-supplied.
 * Parity verified in populationCap.parity.test.mjs.
 */
export function planetCapFromBuildings(planet, content) {
  const base = 20;
  let cap = base;
  const all = [...(planet.surfaceBuildings ?? []), ...(planet.orbitalBuildings ?? []), ...(planet.buildings ?? [])];
  for (const b of all) {
    if (b.disabled) continue;
    const def = buildingDefFromInstance(content, b);
    let added = false;
    for (const e of def?.effects || []) {
      if (e.effect === "pop_cap_add") {
        cap += Number(e.args?.amount || 0);
        added = true;
      }
    }
    if (!added) {
      if (b.kind === "residential" || b.kind === "habitat") cap += 15;
      if (b.kind === "capitol") cap += 10;
    }
  }
  const ct = normalizeColonyType(planet.colonyType);
  const cdef = colonyDefForType(content, ct);
  for (const e of cdef?.effects || []) {
    if (e.effect === "pop_cap_add") cap += Number(e.args?.amount || 0);
  }
  if (!cdef) {
    if (ct === "core") cap += 25;
    if (ct === "outpost") cap += 5;
  }
  return cap;
}
