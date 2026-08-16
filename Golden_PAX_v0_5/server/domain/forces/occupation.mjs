/**
 * First-pass occupation after a legion fight. Ports the *body* of
 * GMap/server/engagements.mjs applyOccupationEffects (~owner transfer +
 * ~8% pop hit). Skips refugees, coOwnerFactionIds, contested arrays
 * (deferred in this project). No assault theater.
 */

export const OCCUPATION_POP_HIT = 0.08;

/**
 * After legion-vs-legion resolveExchange: occupy if the winner still has
 * a legion in the system and no other faction's legion remains.
 *
 * @returns {string|null} winner factionId, or null if occupy does not fire
 */
export function shouldOccupyAfterEngage({ outcome, forceA, forceB, remainingForces }) {
  if (!forceA || !forceB) return null;
  if (forceA.kind !== "legion" || forceB.kind !== "legion") return null;
  let winnerId = null;
  if (outcome === "win_a") winnerId = forceA.factionId;
  else if (outcome === "win_b") winnerId = forceB.factionId;
  else return null;
  const systemId = forceA.systemId;
  if (!systemId) return null;
  const ownLegion = remainingForces.some(
    (f) => f.kind === "legion" && f.factionId === winnerId && f.systemId === systemId,
  );
  const enemyLegion = remainingForces.some(
    (f) => f.kind === "legion" && f.factionId !== winnerId && f.systemId === systemId,
  );
  if (ownLegion && !enemyLegion) return winnerId;
  return null;
}

/**
 * Walk into an enemy-owned system with no enemy legion left — occupy
 * without an assault theater. Called from the move route (empty land)
 * and is the same rule as post-engage aftermath.
 */
export function shouldOccupyEmptySystem({ force, system, remainingForces }) {
  if (!force || force.kind !== "legion" || !system?.id) return null;
  if (!system.ownerFactionId || system.ownerFactionId === force.factionId) return null;
  if (force.systemId !== system.id) return null;
  const enemyLegion = (remainingForces || []).some(
    (f) => f.kind === "legion" && f.factionId !== force.factionId && f.systemId === system.id,
  );
  if (enemyLegion) return null;
  return force.factionId;
}

/**
 * Transfer system + already-owned planets to the winner. Uncolonized
 * planets stay unowned. Pop hit ~8% (min 1) on transferred worlds.
 *
 * @param {object} system  loadSystemWithPlanets shape
 * @param {string} winnerFactionId
 */
export function applyOccupationEffects(system, winnerFactionId) {
  if (!system || !winnerFactionId) return { system, popHit: 0 };
  let popHit = 0;
  const planets = (system.planets || []).map((p) => {
    if (!p.ownerFactionId) return p;
    let population = Number(p.population) || 0;
    if (population > 0) {
      const loss = Math.max(1, Math.floor(population * OCCUPATION_POP_HIT));
      population = Math.max(0, population - loss);
      popHit += loss;
    }
    return { ...p, ownerFactionId: winnerFactionId, population };
  });
  return {
    system: { ...system, ownerFactionId: winnerFactionId, planets },
    popHit,
  };
}
