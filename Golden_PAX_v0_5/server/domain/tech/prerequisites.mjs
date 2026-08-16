import { resolveTechDef } from "./resolveTechDef.mjs";

/**
 * Prerequisite checking. GMap/server/techActions.mjs repeats this exact
 * "is every prerequisite already unlocked" loop three times verbatim
 * (canQueueTech, techAvailability, researchTech) — pulled out to one
 * function here instead of re-copying it a fourth time.
 *
 * @returns {string | null} the first missing prerequisite's id, or null if all are met
 */
export function firstMissingPrerequisite(def, unlockedTechs) {
  const unlocked = new Set(unlockedTechs || []);
  for (const pre of def?.prerequisites || []) {
    if (!unlocked.has(pre)) return pre;
  }
  return null;
}

/**
 * Prerequisite path to a tech (root → target) with total cognitio cost of
 * the missing techs. Ported from GMap/server/techActions.mjs's
 * researchPathTo — the base DFS + cost sum, without its optional
 * research_cost_mult modifier-stack adjustment (that needs
 * buildModifierStack + race/faction effects, not ported yet — costs here
 * are the raw content costs).
 *
 * @param {string} techId
 * @param {string[]} unlockedTechs
 * @param {object} content
 */
export function researchPathTo(techId, unlockedTechs, content) {
  const unlocked = new Set(unlockedTechs || []);
  const path = [];
  const visiting = new Set();

  function walk(id) {
    if (!id || unlocked.has(id) || visiting.has(id)) return;
    const def = resolveTechDef(content, id);
    if (!def) return;
    visiting.add(id);
    for (const pre of def.prerequisites || []) walk(pre);
    visiting.delete(id);
    if (!unlocked.has(id) && !path.includes(id)) path.push(id);
  }
  walk(techId);

  let totalCognitio = 0;
  const steps = path.map((id) => {
    const def = resolveTechDef(content, id);
    const cost = Number(def?.cost?.["currency.cognitio"] ?? 0);
    totalCognitio += cost;
    return { techId: id, name: def?.name || id, cost, category: def?.category, era: def?.era };
  });
  return { steps, totalCognitio, missing: steps.length };
}
