import type { DiplomacyRelation, WorldState } from "./types";

function diplomacyEdgeIsWar(edge: {
  relation?: DiplomacyRelation | string;
  status?: string;
  state?: string;
}): boolean {
  const r = edge.relation ?? edge.status ?? edge.state;
  return r === "war";
}

export function factionsAtWar(
  world: WorldState,
  aId: string,
  bId: string,
): boolean {
  if (!aId || !bId || aId === bId) return false;
  const [x, y] = aId < bId ? [aId, bId] : [bId, aId];
  const canonical = (world.diplomacy ?? []).find(
    (e) => e.aId === x && e.bId === y,
  );
  if (canonical && diplomacyEdgeIsWar(canonical)) return true;
  return (world.diplomacy ?? []).some((e) => {
    if (!diplomacyEdgeIsWar(e)) return false;
    return (
      (e.aId === aId && e.bId === bId) || (e.aId === bId && e.bId === aId)
    );
  });
}

/** Mirrors server defender/hostility checks for attack_system UI. */
export function canAttackSystem(
  world: WorldState,
  factionId: string,
  systemId: string,
): { eligible: boolean; label: string } {
  const sys = world.systems.find((s) => s.id === systemId);
  if (!sys) return { eligible: false, label: "Атака" };

  if (sys.contested) return { eligible: true, label: "Атака" };

  if (sys.ownerFactionId && sys.ownerFactionId !== factionId) {
    return { eligible: true, label: "Атака" };
  }

  const hostileFleet = (world.fleets ?? []).some(
    (f) =>
      f.systemId === systemId &&
      f.factionId !== factionId &&
      (factionsAtWar(world, factionId, f.factionId) ||
        sys.ownerFactionId === f.factionId),
  );
  const hostileLegion = (world.legions ?? []).some(
    (l) =>
      l.systemId === systemId &&
      l.factionId !== factionId &&
      (factionsAtWar(world, factionId, l.factionId) ||
        sys.ownerFactionId === l.factionId),
  );
  if (hostileFleet || hostileLegion) {
    return { eligible: true, label: "Атака" };
  }

  const otherFacs = new Set<string>();
  for (const f of world.fleets ?? []) {
    if (f.systemId === systemId && f.factionId !== factionId) {
      otherFacs.add(f.factionId);
    }
  }
  for (const l of world.legions ?? []) {
    if (l.systemId === systemId && l.factionId !== factionId) {
      otherFacs.add(l.factionId);
    }
  }
  for (const fid of otherFacs) {
    if (factionsAtWar(world, factionId, fid)) {
      return { eligible: true, label: "Атака" };
    }
  }

  return { eligible: false, label: "Атака" };
}

/** True when attack_system would have a hostile target in this system. */
export function canAttackUnitAtSystem(
  world: WorldState,
  attackerFactionId: string,
  systemId: string,
): boolean {
  return canAttackSystem(world, attackerFactionId, systemId).eligible;
}

/** Direct attack on a hostile fleet/legion glyph (war or territorial rules). */
export function canAttackHostileUnit(
  world: WorldState,
  attackerFactionId: string,
  targetFactionId: string,
  systemId: string,
): boolean {
  if (!attackerFactionId || !targetFactionId) return false;
  if (attackerFactionId === targetFactionId) return false;
  if (factionsAtWar(world, attackerFactionId, targetFactionId)) return true;
  return canAttackUnitAtSystem(world, attackerFactionId, systemId);
}

export function systemHasHostileInvaders(
  world: WorldState,
  ownerFactionId: string,
  systemId: string,
): boolean {
  const hostileLegion = (world.legions ?? []).some(
    (l) =>
      l.systemId === systemId &&
      l.factionId !== ownerFactionId &&
      factionsAtWar(world, ownerFactionId, l.factionId),
  );
  const hostileFleet = (world.fleets ?? []).some(
    (f) =>
      f.systemId === systemId &&
      f.factionId !== ownerFactionId &&
      factionsAtWar(world, ownerFactionId, f.factionId),
  );
  return hostileLegion || hostileFleet;
}
