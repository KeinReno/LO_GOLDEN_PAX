/**
 * Faction / race gating for building defs (mirrors src/state/buildingAccess.ts).
 */

/** @param {string} factionId */
export function factionContentTag(factionId) {
  return String(factionId || "").replace(/^faction_/, "");
}

/**
 * @param {{ faction?: string, prerequisites?: { race?: string } }} def
 * @param {string} factionId
 * @param {{ raceIds?: string[] }} [opts]
 */
export function canFactionBuildDef(def, factionId, opts) {
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

/** @param {{ raceId: string }[] | undefined} composition */
export function raceIdsFromComposition(composition) {
  return (composition ?? []).map((r) =>
    String(r.raceId || "").replace(/^race_/, ""),
  );
}
