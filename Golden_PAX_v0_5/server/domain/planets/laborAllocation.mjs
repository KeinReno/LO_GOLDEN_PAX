import { buildingDefFromInstance } from "./buildingDefs.mjs";

/**
 * NOT a port — GMap has no per-building labor requirement (checked: no
 * `laborSlots`/`worker`/`crew` field anywhere in `buildings.json`). New
 * design from the 2026-08-12 grill session (Q5/Q6/Q11):
 * `content/core/buildings.json`'s `laborSlots` field (added alongside this
 * file — currently `= tier`, a first-pass balance default, not hand-tuned)
 * is how many population-units a building needs to reach full output.
 *
 * Auto-distribution (grill: "не должно требовать ручной расстановки
 * рабочих"): fills buildings in placement order — oldest-built first —
 * until population runs out; the first building that can't be fully
 * staffed gets a proportionally reduced fraction, everything after it gets
 * none. This ordering is a stated default, not confirmed with the user;
 * revisit if it reads oddly in play (see the grill capture file's Open
 * flags).
 *
 * Scoped to `yield_flat` buildings only (what buildingYields.mjs computes)
 * — `pop_cap_add` (housing) is deliberately NOT labor-gated, to avoid a
 * chicken-and-egg problem where growing the population cap itself requires
 * population to staff.
 *
 * @returns {Record<string, number>} building instance id -> staffed fraction [0,1]
 */
export function allocateLabor(planet, content) {
  const buildings = [...(planet.surfaceBuildings ?? []), ...(planet.orbitalBuildings ?? [])].filter((b) => !b.disabled);
  let remaining = Math.max(0, Number(planet.population) || 0);

  const staffing = {};
  for (const b of buildings) {
    const def = buildingDefFromInstance(content, b);
    const need = Math.max(1, Number(def?.laborSlots) || 1);
    if (remaining <= 0) {
      staffing[b.id] = 0;
      continue;
    }
    const used = Math.min(need, remaining);
    staffing[b.id] = used / need;
    remaining -= used;
  }
  return staffing;
}
