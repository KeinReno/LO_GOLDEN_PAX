/**
 * Client helpers for hybrid lineages (mirror server/hybridRegistry.mjs).
 */
import { getCachedContent } from "./contentCatalog";
import type { Planet, RaceShare } from "./types";

export function hybridLineageId(raceA: string, raceB: string): string {
  const a = raceA.replace(/^race_/, "");
  const b = raceB.replace(/^race_/, "");
  const [x, y] = [a, b].sort();
  return `race_hybrid.${x}_${y}`;
}

export function canHybridizePair(raceA: string, raceB: string): boolean {
  const rules = getCachedContent()?.hybrid_rules;
  const map = rules?.compatibility ?? {};
  const listA = map[raceA] ?? [];
  const listB = map[raceB] ?? [];
  return listA.includes(raceB) || listB.includes(raceA);
}

function shareOf(composition: RaceShare[], raceId: string): number {
  return (
    composition.find((r) => r.raceId === raceId)?.percent ??
    0
  );
}

export type HybridCandidate = {
  raceA: string;
  raceB: string;
  lineageId: string;
  lineageName: string;
  shareA: number;
  shareB: number;
  ready: boolean;
};

/** Pairs on this planet that meet min share for founding. */
export function hybridCandidatesForPlanet(
  composition: RaceShare[],
  minShare = 35,
): HybridCandidate[] {
  const content = getCachedContent();
  const races = content?.races ?? {};
  const seen = new Set<string>();
  const out: HybridCandidate[] = [];
  const ids = composition
    .filter((r) => (r.percent ?? 0) >= minShare && !r.raceId.startsWith("race_hybrid."))
    .map((r) => r.raceId);

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const raceA = ids[i];
      const raceB = ids[j];
      if (!canHybridizePair(raceA, raceB)) continue;
      const key = [raceA, raceB].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      const lineageId = hybridLineageId(raceA, raceB);
      const shareA = shareOf(composition, raceA);
      const shareB = shareOf(composition, raceB);
      out.push({
        raceA,
        raceB,
        lineageId,
        lineageName: races[lineageId]?.name ?? lineageId,
        shareA,
        shareB,
        ready: shareA >= minShare && shareB >= minShare,
      });
    }
  }
  return out;
}

export function hybridResearchBlocked(
  tech: { hybridOf?: string[]; requiresLineage?: string },
  unlockedLineages: string[] | undefined,
  world: { factions?: Array<{ id: string }>; systems?: Array<{ ownerFactionId?: string | null; planets?: Planet[] }> } | undefined,
  factionId: string | undefined,
): boolean {
  const lineageId =
    tech.requiresLineage ??
    (tech.hybridOf?.length === 2
      ? hybridLineageId(tech.hybridOf[0], tech.hybridOf[1])
      : null);
  if (!lineageId) return false;
  if ((unlockedLineages ?? []).includes(lineageId)) return false;
  const min = getCachedContent()?.hybrid_rules?.minParentSharePercent ?? 35;
  if (!tech.hybridOf || tech.hybridOf.length !== 2 || !world || !factionId) {
    return true;
  }
  const [a, b] = tech.hybridOf;
  let wA = 0;
  let wB = 0;
  let pop = 0;
  for (const sys of world.systems ?? []) {
    if (sys.ownerFactionId !== factionId) continue;
    for (const p of sys.planets ?? []) {
      const n = Number(p.population || 0);
      if (n <= 0) continue;
      pop += n;
      for (const row of p.raceComposition ?? []) {
        if (row.raceId === a) wA += n * ((row.percent ?? 0) / 100);
        if (row.raceId === b) wB += n * ((row.percent ?? 0) / 100);
      }
    }
  }
  if (pop <= 0) return true;
  return wA / pop < min / 100 || wB / pop < min / 100;
}

export function hybridLockLabel(tech: {
  hybridOf?: string[];
  requiresLineage?: string;
}): string | null {
  const content = getCachedContent();
  if (!tech.hybridOf || tech.hybridOf.length !== 2) {
    if (tech.requiresLineage) {
      const name =
        content?.races?.[tech.requiresLineage]?.name ?? tech.requiresLineage;
      return `Смешанный род «${name}»`;
    }
    return null;
  }
  const [a, b] = tech.hybridOf;
  const na = content?.races?.[a]?.name ?? a;
  const nb = content?.races?.[b]?.name ?? b;
  return `Синтез: ${na} + ${nb}`;
}
