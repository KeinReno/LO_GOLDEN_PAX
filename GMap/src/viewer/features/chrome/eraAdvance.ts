export function maxTechEra(
  techs: Record<string, { id: string; era?: number }>,
  unlocked: string[] | undefined,
): number {
  const set = new Set(unlocked ?? []);
  let maxEra = 1;
  for (const t of Object.values(techs)) {
    if (set.has(t.id)) maxEra = Math.max(maxEra, t.era ?? 1);
  }
  return maxEra;
}

export function eraSeenStorageKey(factionId: string): string {
  return `gmap-era-seen-${factionId}`;
}

export type EraAdvanceDecision =
  | { kind: "seed"; era: number }
  | { kind: "skip" }
  | { kind: "advance"; era: number };

export function decideEraAdvance(
  prev: number,
  maxEra: number,
): EraAdvanceDecision {
  if (prev === 0) return { kind: "seed", era: maxEra };
  if (maxEra <= prev) return { kind: "skip" };
  return { kind: "advance", era: maxEra };
}
