import type { TechnologyDef } from "../../state/contentCatalog";

export type ResearchPathStep = {
  techId: string;
  name: string;
  cost: number;
  category?: string;
  era?: number;
};

/** Client-side prerequisite path (mirrors server researchPathTo). */
export function buildResearchPath(
  techId: string,
  byId: Map<string, TechnologyDef>,
  unlocked: Set<string>,
): { steps: ResearchPathStep[]; totalCognitio: number } {
  const path: string[] = [];
  const visiting = new Set<string>();

  const walk = (id: string) => {
    if (!id || unlocked.has(id) || visiting.has(id)) return;
    const def = byId.get(id);
    if (!def) return;
    visiting.add(id);
    for (const pre of def.prerequisites || []) walk(pre);
    visiting.delete(id);
    if (!unlocked.has(id) && !path.includes(id)) path.push(id);
  };

  walk(techId);
  let totalCognitio = 0;
  const steps = path.map((id) => {
    const def = byId.get(id);
    const cost = Number(def?.cost?.["currency.cognitio"] ?? 0);
    totalCognitio += cost;
    return {
      techId: id,
      name: def?.name || id,
      cost,
      category: def?.category,
      era: def?.era,
    };
  });
  return { steps, totalCognitio };
}
