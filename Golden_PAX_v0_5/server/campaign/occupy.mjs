import { applyOccupationEffects } from "../domain/forces/occupation.mjs";
import { loadSystemWithPlanets, savePlanet, updateSystem } from "./planetStore.mjs";

/** Persist domain applyOccupationEffects through planet/system stores. */
export function persistOccupation(db, campaignId, systemId, winnerFactionId) {
  const system = loadSystemWithPlanets(db, campaignId, systemId);
  if (!system) return { ok: false, error: "system_not_found" };
  const { system: next, popHit } = applyOccupationEffects(system, winnerFactionId);
  updateSystem(db, campaignId, systemId, { ownerFactionId: winnerFactionId });
  for (const planet of next.planets) {
    const prev = (system.planets || []).find((p) => p.id === planet.id);
    if (!prev) continue;
    if (prev.ownerFactionId !== planet.ownerFactionId || prev.population !== planet.population) {
      savePlanet(db, campaignId, planet);
    }
  }
  return { ok: true, system: next, popHit };
}
