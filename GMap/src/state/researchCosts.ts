/**
 * Client-side research cost helpers (mirror of server techActions).
 */
import {
  getCachedContent,
  type TechnologyDef,
  type TechUpgrade,
} from "./contentCatalog";
import type { ViewerPayload } from "./types";
import { factionHasProperty } from "./techGate";

type EcoSlice = NonNullable<ViewerPayload["economy"]>;

function researchCostMult(
  eco: EcoSlice | undefined,
  category: string | undefined,
): number {
  const content = getCachedContent();
  const techs = content?.technologies || {};
  const unlockedUpgrades = new Set(eco?.unlockedUpgrades || []);
  let mult = 1;
  for (const id of eco?.unlockedTechs || []) {
    const def = techs[id];
    if (!def) continue;
    for (const e of def.effects || []) {
      if (e.effect !== "research_cost_mult") continue;
      const cat = String((e.args as { category?: string } | undefined)?.category || "*");
      if (cat === "*" || cat === category) {
        mult *= Number((e.args as { mult?: number } | undefined)?.mult ?? 1);
      }
    }
    for (const u of def.upgrades || []) {
      if (!unlockedUpgrades.has(u.id)) continue;
      for (const e of u.effects || []) {
        if (e.effect !== "research_cost_mult") continue;
        const cat = String(
          (e.args as { category?: string } | undefined)?.category || "*",
        );
        if (cat === "*" || cat === category) {
          mult *= Number((e.args as { mult?: number } | undefined)?.mult ?? 1);
        }
      }
    }
  }
  return mult;
}

export function effectiveCognitioCost(
  tech: TechnologyDef | TechUpgrade,
  eco: EcoSlice | undefined,
  category?: string,
): number {
  const base = Number(tech.cost?.["currency.cognitio"] ?? 0);
  if (base <= 0) return 0;
  const cat =
    category ||
    ("category" in tech ? (tech as TechnologyDef).category : undefined);
  const mult = researchCostMult(eco, cat);
  if (mult === 1) return base;
  return Math.max(1, Math.ceil(base * mult));
}

export function missingRequireProperties(
  tech: TechnologyDef,
  eco: EcoSlice | undefined,
): string[] {
  const req = (tech as TechnologyDef & { requireProperties?: string[] })
    .requireProperties;
  if (!req?.length) return [];
  return req.filter((p) => !factionHasProperty(eco, p));
}
