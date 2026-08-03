export type BuildingDefAccess = {
  faction?: string;
  prerequisites?: { race?: string };
};

/** Strip `faction_` prefix → content tag (`faction_belator` → `belator`). */
export function factionContentTag(factionId: string): string {
  return factionId.replace(/^faction_/, "");
}

/**
 * Whether a faction may build this def in the UI / server.
 * Race prereq is enforced only when raceIds is non-empty.
 */
export function canFactionBuildDef(
  def: BuildingDefAccess,
  factionId: string,
  opts?: { raceIds?: string[] },
): boolean {
  const tag = factionContentTag(factionId);
  const factionOk =
    !def.faction || def.faction === "generic" || def.faction === tag;
  if (!factionOk) return false;

  const reqRace = def.prerequisites?.race;
  const raceIds = opts?.raceIds;
  if (reqRace && raceIds && raceIds.length > 0) {
    if (!raceIds.includes(reqRace)) return false;
  }
  return true;
}

/** Map planet raceComposition ids to content race tags (`race_norborian` → `norborian`). */
export function raceIdsFromComposition(
  composition: { raceId: string }[] | undefined,
): string[] {
  return (composition ?? []).map((r) =>
    String(r.raceId || "").replace(/^race_/, ""),
  );
}
