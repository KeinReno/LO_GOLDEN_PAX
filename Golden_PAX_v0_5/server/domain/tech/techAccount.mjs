/**
 * A faction's tech state. Originally ported from GMap ledger tech fields;
 * Tech Tree 2.0 (2026-08-14) replaced the dead `unlockedUpgrades` list with
 * `techGrades` / `techSockets` / `currentOffers` — new design, not a GMap
 * port (GMap has none of those).
 */

export const DEFAULT_TECH_TIERS = { A: 1, B: 1, C: 1, D: 1, E: 1, F: 1 };

/** @param {string} factionId */
export function defaultTechAccount(factionId) {
  return {
    factionId,
    unlockedTechs: [],
    techGrades: {},
    techSockets: {},
    currentOffers: {},
    techTiers: { ...DEFAULT_TECH_TIERS },
    unlockedProperties: [],
    researchQueue: [],
  };
}
