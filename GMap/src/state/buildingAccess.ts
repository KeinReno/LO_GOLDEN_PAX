export type BuildingDefAccess = {
  faction?: string;
  prerequisites?: { race?: string; races?: string[] };
};

/** Strip `faction_` prefix → content tag (`faction_belator` → `belator`). */
export function factionContentTag(factionId: string): string {
  return factionId.replace(/^faction_/, "");
}

/**
 * Whether a faction may build this def in the UI / server.
 * Race prereq fails closed: empty mix cannot satisfy a required race.
 * `prerequisites.races` requires all listed races in the colony mix.
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

  const raceIds = opts?.raceIds || [];
  const reqRace = def.prerequisites?.race;
  if (reqRace && !raceIds.includes(reqRace)) return false;

  const reqRaces = def.prerequisites?.races;
  if (Array.isArray(reqRaces) && reqRaces.length > 0) {
    for (const r of reqRaces) {
      if (!raceIds.includes(r)) return false;
    }
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
