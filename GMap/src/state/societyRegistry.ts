/**
 * Client culture / faith registry (read-only from content catalog).
 */
import { getCachedContent } from "./contentCatalog";

export type CultureDef = {
  id: string;
  name: string;
  tags?: string[];
  compatibleRaces?: string[];
  effects?: Array<{ effect: string; args?: Record<string, unknown> }>;
};

export type FaithDef = {
  id: string;
  name: string;
  tags?: string[];
  taboo_properties?: string[];
  effects?: Array<{ effect: string; args?: Record<string, unknown> }>;
};

export function listCultures(): CultureDef[] {
  const c = getCachedContent()?.cultures?.cultures;
  return Object.values(c || {});
}

export function getCulture(id: string): CultureDef | undefined {
  return getCachedContent()?.cultures?.cultures?.[id];
}

export function listFaiths(): FaithDef[] {
  const f = getCachedContent()?.faiths?.faiths;
  return Object.values(f || {});
}

export function getFaith(id: string): FaithDef | undefined {
  return getCachedContent()?.faiths?.faiths?.[id];
}

export function hybridCompatibility(): Record<string, string[]> {
  return getCachedContent()?.hybrid_rules?.compatibility || {};
}

/** Union of taboo property ids active on this planet (faith shares or primary). */
export function collectFaithTabooProperties(
  planet: { faithShare?: Array<{ faithId: string; percent?: number }> },
  primaryFaith = "faith.secular",
): Set<string> {
  const rows = planet.faithShare?.length
    ? planet.faithShare.filter((r) => (r.percent ?? 0) > 0)
    : [{ faithId: primaryFaith, percent: 100 }];
  const out = new Set<string>();
  for (const row of rows) {
    const def = getFaith(row.faithId);
    for (const p of def?.taboo_properties || []) out.add(p);
  }
  return out;
}

export function resourceFaithTabooHit(
  resourceProperties: string[] | undefined,
  taboos: Set<string>,
): string | null {
  if (!taboos.size || !resourceProperties?.length) return null;
  const hit = resourceProperties.filter((p) => taboos.has(p));
  if (!hit.length) return null;
  return hit.join(", ");
}
