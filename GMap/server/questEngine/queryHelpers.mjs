/**
 * Faction/world query helpers + yearly-quest filter matching.
 * Extracted from ../questEngine.mjs.
 */
export function factionById(world, factionId) {
  return (world.factions ?? []).find((f) => f.id === factionId) || null;
}

export function ownedSystems(world, factionId) {
  return (world.systems ?? []).filter((s) => s.ownerFactionId === factionId);
}

function warCount(world, factionId) {
  let n = 0;
  for (const d of world.diplomacy ?? []) {
    const a = d.aId || d.aFactionId || d.fromFactionId;
    const b = d.bId || d.bFactionId || d.toFactionId;
    if (a !== factionId && b !== factionId) continue;
    if (d.status === "war" || d.relation === "war" || d.state === "war") n += 1;
  }
  return n;
}

function hasRefugees(world, factionId) {
  for (const s of ownedSystems(world, factionId)) {
    for (const p of s.planets ?? []) {
      if ((p.refugees ?? 0) > 0) return true;
      if (p.tags?.includes?.("refugees")) return true;
    }
  }
  return (world.caravans ?? []).some(
    (c) => c.kind === "refugee" && c.toFactionId === factionId,
  );
}

function hasRace(world, factionId, raceId) {
  for (const s of ownedSystems(world, factionId)) {
    for (const p of s.planets ?? []) {
      const comp = p.raceComposition || p.races || [];
      if (Array.isArray(comp)) {
        for (const row of comp) {
          const id = typeof row === "string" ? row : row.raceId || row.id;
          if (id === raceId) return true;
        }
      } else if (comp && typeof comp === "object" && comp[raceId]) {
        return true;
      }
    }
  }
  return false;
}

function hasBuilding(world, factionId, buildingId) {
  for (const s of ownedSystems(world, factionId)) {
    for (const p of s.planets ?? []) {
      const lists = [
        ...(p.buildings ?? []),
        ...(p.surfaceBuildings ?? []),
        ...(p.orbitalBuildings ?? []),
      ];
      for (const b of lists) {
        const bid =
          typeof b === "string" ? b : b?.buildingId ?? b?.kind ?? b?.id;
        if (bid === buildingId) return true;
      }
    }
  }
  return false;
}

function lowLoyaltyRace(faction, raceId) {
  const map = faction?.loyaltyByRace || {};
  if (raceId && Number.isFinite(map[raceId])) return map[raceId] < 40;
  if (Number.isFinite(faction?.loyalty)) return faction.loyalty < 40;
  // Soft default until A3 lands: treat as matching (allow filtered quests).
  return true;
}

function borderWithWar(world, factionId) {
  if (warCount(world, factionId) <= 0) return false;
  const owned = new Set(ownedSystems(world, factionId).map((s) => s.id));
  for (const link of world.links ?? []) {
    const a = link.fromId || link.a || link.fromSystemId;
    const b = link.toId || link.b || link.toSystemId;
    if (!owned.has(a) && !owned.has(b)) continue;
    const otherId = owned.has(a) ? b : a;
    const other = (world.systems ?? []).find((s) => s.id === otherId);
    if (!other?.ownerFactionId || other.ownerFactionId === factionId) continue;
    // Neighbor owned by someone we are at war with
    for (const d of world.diplomacy ?? []) {
      const x = d.aId || d.aFactionId || d.fromFactionId;
      const y = d.bId || d.bFactionId || d.toFactionId;
      const pair =
        (x === factionId && y === other.ownerFactionId) ||
        (y === factionId && x === other.ownerFactionId);
      if (pair && (d.status === "war" || d.relation === "war" || d.state === "war")) {
        return true;
      }
    }
  }
  return false;
}

function arcActive(world, factionId, arcId) {
  if (!arcId) return false;
  return (world.quests ?? []).some(
    (q) =>
      q.sourceFactionId === factionId &&
      q.status === "active" &&
      (q.catalogId === arcId || q.arc?.id === arcId || q.id === arcId),
  );
}

/**
 * @param {object} filterBy
 * @param {object} ctx
 */
export function matchesFilter(filterBy, ctx) {
  const f = filterBy || {};
  if (f.minEra != null && (ctx.era ?? 1) < Number(f.minEra)) return false;
  if (f.maxWarCount != null && ctx.warCount > Number(f.maxWarCount)) return false;
  if (f.hasRefugees && !ctx.hasRefugees) return false;
  if (f.borderWithWar && !ctx.borderWithWar) return false;
  if (f.requiresRace && !ctx.hasRace(f.requiresRace)) return false;
  if (f.requiresBuilding && !ctx.hasBuilding(f.requiresBuilding)) return false;
  if (f.lowLoyaltyRace && !ctx.lowLoyaltyRace(f.lowLoyaltyRace)) return false;
  if (f.excludeIfArcActive && ctx.arcActive(f.excludeIfArcActive)) return false;
  return true;
}

export function buildFilterContext(world, factionId) {
  const faction = factionById(world, factionId);
  return {
    era: world.meta?.era ?? 1,
    warCount: warCount(world, factionId),
    hasRefugees: hasRefugees(world, factionId),
    borderWithWar: borderWithWar(world, factionId),
    hasRace: (raceId) => hasRace(world, factionId, raceId),
    hasBuilding: (buildingId) => hasBuilding(world, factionId, buildingId),
    lowLoyaltyRace: (raceId) => lowLoyaltyRace(faction, raceId),
    arcActive: (arcId) => arcActive(world, factionId, arcId),
  };
}
