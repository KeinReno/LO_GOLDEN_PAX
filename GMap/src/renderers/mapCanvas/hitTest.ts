import type { Point } from "../../generators/brushGenerator";
import type { StarSystem } from "../../state/types";
import { canAttackHostileUnit } from "../../state/combatEligibility";
import {
  layoutFleetsAroundSystem,
  layoutLegionsAroundSystem,
  type AnimClock,
} from "../drawMapIcons";
import { toIso } from "../iso";
import {
  SYSTEM_HIT_R,
  FLEET_HIT_R,
  LEGION_HIT_R,
  MIN_TOUCH_HIT_UNIT_PX,
} from "./constants";
import type { HostileUnitDropTarget, MapViewModel } from "./types";

export function findSystemAt(
  p: Point,
  systems: StarSystem[],
  hitR: number,
): StarSystem | null {
  const tip = toIso(p.x, p.y);
  let best: StarSystem | null = null;
  let bestD = hitR * hitR;
  for (const s of systems) {
    const sp = toIso(s.x, s.y);
    const dx = tip.x - sp.x;
    const dy = (tip.y - sp.y) * 1.6;
    const d = dx * dx + dy * dy;
    if (d <= bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

export function findFleetAt(
  p: Point,
  model: MapViewModel,
  anim: AnimClock,
  opts: {
    excludeFleetId?: string | null;
    expandHit?: boolean;
    hitR: number;
  },
): string | null {
  if (model.showFleets === false) return null;
  const tip = toIso(p.x, p.y);
  const byId = new Map(model.world.systems.map((s) => [s.id, s]));
  const bySystem = new Map<string, typeof model.world.fleets>();
  for (const f of model.world.fleets) {
    if (opts.excludeFleetId && f.id === opts.excludeFleetId) continue;
    const list = bySystem.get(f.systemId) ?? [];
    list.push(f);
    bySystem.set(f.systemId, list);
  }
  let bestId: string | null = null;
  let bestD = opts.hitR ** 2;
  for (const [sysId, fleets] of bySystem) {
    const sys = byId.get(sysId);
    if (!sys) continue;
    for (const slot of layoutFleetsAroundSystem(
      sys,
      fleets,
      anim,
      model.selectedFleetId,
    )) {
      const d = (slot.x - tip.x) ** 2 + (slot.y - tip.y) ** 2;
      if (d <= bestD) {
        bestD = d;
        bestId =
          (model.selectedFleetId &&
          slot.fleetIds?.includes(model.selectedFleetId)
            ? model.selectedFleetId
            : null) ?? slot.fleet.id;
      }
    }
  }
  return bestId;
}

export function findLegionAt(
  p: Point,
  model: MapViewModel,
  anim: AnimClock,
  opts: {
    excludeLegionId?: string | null;
    expandHit?: boolean;
    hitR: number;
  },
): string | null {
  if (model.showLegions === false) return null;
  const tip = toIso(p.x, p.y);
  const byId = new Map(model.world.systems.map((s) => [s.id, s]));
  const bySystem = new Map<string, typeof model.world.legions>();
  for (const l of model.world.legions ?? []) {
    if (opts.excludeLegionId && l.id === opts.excludeLegionId) continue;
    const list = bySystem.get(l.systemId) ?? [];
    list.push(l);
    bySystem.set(l.systemId, list);
  }
  let bestId: string | null = null;
  let bestD = opts.hitR ** 2;
  for (const [sysId, legs] of bySystem) {
    const sys = byId.get(sysId);
    if (!sys) continue;
    for (const slot of layoutLegionsAroundSystem(
      sys,
      legs,
      anim,
      model.selectedLegionId,
    )) {
      const d = (slot.x - tip.x) ** 2 + (slot.y - tip.y) ** 2;
      if (d <= bestD) {
        bestD = d;
        bestId =
          (model.selectedLegionId &&
          slot.legionIds?.includes(model.selectedLegionId)
            ? model.selectedLegionId
            : null) ?? slot.legion.id;
      }
    }
  }
  return bestId;
}

export function fleetHitRadius(
  isoHitR: (base: number, minPx?: number) => number,
  expandHit = false,
) {
  return isoHitR(
    expandHit ? FLEET_HIT_R * 1.45 : FLEET_HIT_R,
    MIN_TOUCH_HIT_UNIT_PX,
  );
}

export function legionHitRadius(
  isoHitR: (base: number, minPx?: number) => number,
  expandHit = false,
) {
  return isoHitR(
    expandHit ? LEGION_HIT_R * 1.45 : LEGION_HIT_R,
    MIN_TOUCH_HIT_UNIT_PX,
  );
}

export function systemHitRadius(
  isoHitR: (base: number, minPx?: number) => number,
  hitR?: number,
) {
  return hitR ?? isoHitR(SYSTEM_HIT_R, 40);
}

export function findHostileUnitAt(
  p: Point,
  model: MapViewModel,
  playerFid: string | null,
  dragKind: "fleet" | "legion",
  anim: AnimClock,
  excludeFleetId: string | null,
  excludeLegionId: string | null,
  isoHitR: (base: number, minPx?: number) => number,
): HostileUnitDropTarget | null {
  if (!playerFid) return null;

  const tryLegion = (): HostileUnitDropTarget | null => {
    const legionId = findLegionAt(p, model, anim, {
      excludeLegionId,
      expandHit: true,
      hitR: legionHitRadius(isoHitR, true),
    });
    if (!legionId) return null;
    const leg = (model.world.legions ?? []).find((x) => x.id === legionId);
    if (!leg || leg.factionId === playerFid) return null;
    if (
      !canAttackHostileUnit(
        model.world,
        playerFid,
        leg.factionId,
        leg.systemId,
      )
    ) {
      return null;
    }
    const sys = model.world.systems.find((s) => s.id === leg.systemId);
    if (!sys) return null;
    const legs = (model.world.legions ?? []).filter(
      (x) => x.systemId === sys.id && x.id !== excludeLegionId,
    );
    for (const slot of layoutLegionsAroundSystem(
      sys,
      legs,
      anim,
      model.selectedLegionId,
    )) {
      if (
        slot.legion.id === legionId ||
        (slot.legionIds?.includes(legionId) ?? false)
      ) {
        return {
          targetKind: "legion",
          targetId: legionId,
          systemId: leg.systemId,
          isoX: slot.x,
          isoY: slot.y,
        };
      }
    }
    return null;
  };

  const tryFleet = (): HostileUnitDropTarget | null => {
    const fleetId = findFleetAt(p, model, anim, {
      excludeFleetId,
      expandHit: true,
      hitR: fleetHitRadius(isoHitR, true),
    });
    if (!fleetId) return null;
    const f = model.world.fleets.find((x) => x.id === fleetId);
    if (!f || f.factionId === playerFid) return null;
    if (
      !canAttackHostileUnit(model.world, playerFid, f.factionId, f.systemId)
    ) {
      return null;
    }
    const sys = model.world.systems.find((s) => s.id === f.systemId);
    if (!sys) return null;
    const fleets = model.world.fleets.filter(
      (x) => x.systemId === sys.id && x.id !== excludeFleetId,
    );
    for (const slot of layoutFleetsAroundSystem(
      sys,
      fleets,
      anim,
      model.selectedFleetId,
    )) {
      if (
        slot.fleet.id === fleetId ||
        (slot.fleetIds?.includes(fleetId) ?? false)
      ) {
        return {
          targetKind: "fleet",
          targetId: fleetId,
          systemId: f.systemId,
          isoX: slot.x,
          isoY: slot.y,
        };
      }
    }
    return null;
  };

  if (dragKind === "legion") {
    return tryLegion() ?? tryFleet();
  }
  return tryFleet() ?? tryLegion();
}
