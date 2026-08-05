/** Strip `faction_` prefix → content tag (`faction_belator` → `belator`). */
export function factionContentTag(factionId) {
  return String(factionId || "").replace(/^faction_/, "");
}

/**
 * @param {{ faction?: string, prerequisites?: { race?: string, races?: string[] } }} def
 * @param {string} factionId
 * @param {{ raceIds?: string[] }} [opts]
 */
export function canFactionBuildDef(def, factionId, opts = {}) {
  const tag = factionContentTag(factionId);
  const factionOk =
    !def.faction || def.faction === "generic" || def.faction === tag;
  if (!factionOk) return false;

  const raceIds = opts?.raceIds || [];
  const reqRace = def.prerequisites?.race;
  const reqRaces = def.prerequisites?.races;

  if (reqRace && !raceIds.includes(reqRace)) return false;

  if (Array.isArray(reqRaces) && reqRaces.length > 0) {
    for (const r of reqRaces) {
      if (!raceIds.includes(r)) return false;
    }
  }

  return true;
}

/** @param {{ raceId: string }[] | undefined} composition */
export function raceIdsFromComposition(composition) {
  return (composition ?? []).map((r) =>
    String(r.raceId || "").replace(/^race_/, ""),
  );
}
