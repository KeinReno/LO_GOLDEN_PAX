/**
 * Ported verbatim from GMap/server/systemActions.mjs's systemHasShipyard/
 * systemHasBarracks (module-private there, never exported) — behavior-
 * tested rather than diffed directly. Whether a faction can produce ships
 * (needs a shipyard/spaceport building anywhere in the system, or a
 * "military" station) or ground units (needs a barracks building) at all.
 */
export function systemHasShipyard(system, factionId) {
  for (const p of system?.planets ?? []) {
    const owner = p.ownerFactionId || system.ownerFactionId;
    if (owner !== factionId) continue;
    for (const b of [...(p.orbitalBuildings ?? []), ...(p.surfaceBuildings ?? [])]) {
      if (b.kind === "shipyard" || b.kind === "spaceport") return true;
    }
  }
  return (system?.stations ?? []).some((s) => s.kind === "military" && s.factionId === factionId);
}

export function systemHasBarracks(system, factionId) {
  for (const p of system?.planets ?? []) {
    const owner = p.ownerFactionId || system.ownerFactionId;
    if (owner !== factionId) continue;
    for (const b of p.surfaceBuildings ?? []) {
      if (b.kind === "barracks") return true;
    }
  }
  return false;
}
