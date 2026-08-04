/**
 * Client helpers for Intel Fog visibility (Race Registry / Variant System).
 * Server already masks payload; these gate content-catalog extras.
 */
import type { FactionIntelPublic, KnowledgeLevel } from "../../state/types";

function levelOf(
  map: Record<string, KnowledgeLevel> | undefined,
  id: string,
): KnowledgeLevel {
  const v = Math.floor(Number(map?.[id] ?? 0));
  if (v <= 0) return 0;
  if (v >= 4) return 4;
  return v as KnowledgeLevel;
}

/** Traits visible for a race at current intel level. */
export function getVisibleTraits(
  traits: Array<string | { id?: string }> | undefined,
  raceId: string,
  intel: FactionIntelPublic | undefined,
): string[] {
  const list = (Array.isArray(traits) ? traits : []).map((t) =>
    typeof t === "string" ? t : String(t?.id ?? ""),
  ).filter(Boolean);
  const level = levelOf(intel?.knownRaces, raceId);
  if (level >= 4) return list;
  if (level === 3) return list.filter((t) => !t.includes("hidden"));
  if (level === 2) return list.slice(0, 2);
  return [];
}

/** Building/unit variants that require race knowledge ≥ 2. */
export function getVisibleVariants<
  T extends { tags?: string[]; raceLock?: string },
>(variants: T[] | undefined, intel: FactionIntelPublic | undefined): T[] {
  const list = Array.isArray(variants) ? variants : [];
  return list.filter((v) => {
    const raceTag =
      v.raceLock ||
      (v.tags ?? []).find((t) => String(t).startsWith("race_"));
    if (!raceTag) return true;
    return levelOf(intel?.knownRaces, raceTag) >= 2;
  });
}

/** Whether a foreign tech id is known enough to show in Codex/reference. */
export function isTechDiscovered(
  techId: string,
  intel: FactionIntelPublic | undefined,
): boolean {
  return levelOf(intel?.knownTechs, techId) >= 1;
}
