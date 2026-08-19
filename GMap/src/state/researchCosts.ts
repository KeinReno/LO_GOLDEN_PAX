/**
 * Client-side research cost helpers (mirror of server techActions).
 */
import { getCachedContent, type TechnologyDef, type TechUpgrade } from "./contentCatalog";
import type { ViewerPayload } from "./types";
import { factionHasProperty } from "./techGate";
import { factionTechGrade, gradeEffectMagnitude } from "./techProgress";
import { groupOffersByDirection, resolveTechDirection } from "./techDirections";

type EcoSlice = NonNullable<ViewerPayload["economy"]>;

/** Mirror of server/techOffers.mjs — only applied when an offer exists for the axis. */
export const OFFER_BYPASS_COGNITIO_MULT = 1.5;

function isOfferEligibleTech(tech: TechnologyDef): boolean {
  if (tech.catalogPending) return false;
  if (tech.alchemyOnly) return false;
  const tags = tech.tags || [];
  if (tags.includes("alchemy") || tags.includes("combo")) return false;
  if (tech.opensPath) return false;
  if ((tech.effects || []).some((e) => e.effect === "open_path")) return false;
  return Boolean(resolveTechDirection(tech));
}

export function isTechInOffer(
  tech: TechnologyDef,
  eco: EcoSlice | undefined,
): boolean {
  if (tech.catalogPending || tech.alchemyOnly) return false;
  if (!isOfferEligibleTech(tech)) return true;
  const axis = resolveTechDirection(tech);
  const grouped = groupOffersByDirection(eco?.currentOffers);
  const candidates =
    (axis && grouped[axis]?.candidates) ||
    eco?.currentOffers?.[tech.category]?.candidates;
  if (!candidates?.length) return true;
  return candidates.includes(tech.id);
}

function researchCostMult(
  eco: EcoSlice | undefined,
  category: string | undefined,
): number {
  const content = getCachedContent();
  const techs = content?.technologies || {};
  let mult = 1;
  for (const id of eco?.unlockedTechs || []) {
    const def = techs[id];
    if (!def) continue;
    const mag = gradeEffectMagnitude(def, factionTechGrade(eco, id));
    for (const e of def.effects || []) {
      if (e.effect !== "research_cost_mult") continue;
      const cat = String((e.args as { category?: string } | undefined)?.category || "*");
      if (cat === "*" || cat === category) {
        const raw = Number((e.args as { mult?: number } | undefined)?.mult ?? 1);
        mult *= raw * mag;
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
  let n = mult === 1 ? base : Math.max(1, Math.ceil(base * mult));
  if ("id" in tech && "category" in tech && !isTechInOffer(tech as TechnologyDef, eco)) {
    n = Math.ceil(n * OFFER_BYPASS_COGNITIO_MULT);
  }
  return n;
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
