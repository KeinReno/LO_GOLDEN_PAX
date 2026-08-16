import { journalPush } from "./journal.mjs";
import { hopPath, linkAllowsTravel } from "../pathfinding.mjs";
import {
  completeForceTravel,
  refreshSystemBlockade,
} from "../forceMovement.mjs";
import { getContent } from "../contentLoader.mjs";

/** @deprecated alias — prefer refreshSystemBlockade from forceMovement */
export function clearBlockadeIfEmpty(world, systemId) {
  refreshSystemBlockade(world, systemId);
}

/**
 * Instant travel within movement radius (rules.movement.rangeHops).
 * @param {"move"|"blockade"|"fortify"} arriveStance stance on arrival
 */
export function beginFleetTravel(world, fleet, toId, arriveStance, journal, meta) {
  return completeForceTravel(
    world,
    fleet,
    "fleet",
    toId,
    arriveStance,
    journal,
    meta,
  );
}

/**
 * Advance fleets/legions with pending routes by one hop each tick.
 * @param {Set<string>} [skipFleetIds] fleets with a new move/blockade/fortify intent this tick
 */
export function advanceUnitRoutes(world, journal, skipFleetIds) {
  for (const fleet of world.fleets ?? []) {
    // Migrate legacy underscore fields from earlier builds.
    if (fleet._arriveStance && !fleet.pendingArrival) {
      fleet.pendingArrival = {
        stance: fleet._arriveStance,
        systemId: fleet._arriveSystemId || fleet.systemId,
      };
    }
    delete fleet._arriveStance;
    delete fleet._arriveSystemId;

    if (skipFleetIds?.has(fleet.id)) continue;
    if (fleet.travelOrderId) continue;

    const route = fleet.route ?? [];
    if (!route.length) {
      delete fleet.pendingArrival;
      continue;
    }
    const fromId = fleet.systemId;
    const nextId = route[0];
    const rest = route.slice(1);
    if (!(world.systems ?? []).some((s) => s.id === nextId)) {
      fleet.route = [];
      delete fleet.pendingArrival;
      continue;
    }
    const hopLink = (world.links ?? []).find(
      (l) =>
        (l.fromId === fromId && l.toId === nextId) ||
        (l.fromId === nextId && l.toId === fromId),
    );
    if (hopLink && !linkAllowsTravel(hopLink.type, "fleet")) {
      fleet.route = [];
      delete fleet.pendingArrival;
      journalPush(journal, {
        type: "reject",
        reason: "fleet_blocked_link",
        fleetId: fleet.id,
        fromId,
        toId: nextId,
        linkType: hopLink.type,
        factionId: fleet.factionId,
      });
      continue;
    }
    fleet.lastSystemId = fromId;
    fleet.systemId = nextId;
    fleet.route = rest;
    const arrived = rest.length === 0;
    if (arrived) {
      const stance = fleet.pendingArrival?.stance || "idle";
      fleet.stance = stance;
      if (stance === "blockade") {
        const sys = (world.systems ?? []).find((s) => s.id === nextId);
        if (sys) sys.blockaded = true;
      }
      delete fleet.pendingArrival;
    } else {
      fleet.stance = "move";
      if (fleet.pendingArrival) {
        fleet.pendingArrival.fromSystemId = fromId;
      }
    }
    clearBlockadeIfEmpty(world, fromId);
    journalPush(journal, {
      type: "route_step",
      fleetId: fleet.id,
      fromId,
      toId: nextId,
      hopsLeft: rest.length,
      arrived,
      factionId: fleet.factionId,
    });
  }
  for (const legion of world.legions ?? []) {
    if (legion.travelOrderId) continue;
    const route = legion.route ?? [];
    if (!route.length) continue;
    const fromId = legion.systemId;
    const nextId = route[0];
    const rest = route.slice(1);
    if (!(world.systems ?? []).some((s) => s.id === nextId)) {
      legion.route = [];
      continue;
    }
    legion.lastSystemId = fromId;
    legion.systemId = nextId;
    legion.route = rest;
    legion.status = rest.length ? "move" : "idle";
    journalPush(journal, {
      type: "route_step_legion",
      legionId: legion.id,
      fromId,
      toId: nextId,
      hopsLeft: rest.length,
      arrived: rest.length === 0,
      factionId: legion.factionId,
    });
  }
}

export function applyMoveFleet(world, intent, journal) {
  const fleetId = intent.payload?.fleetId;
  const toId = intent.payload?.toSystemId;
  const fleet = (world.fleets ?? []).find((f) => f.id === fleetId);
  if (!fleet) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "fleet_missing",
    });
    return false;
  }
  if (fleet.factionId !== intent.factionId) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "fleet_not_owned",
    });
    return false;
  }
  const sys = (world.systems ?? []).find((s) => s.id === toId);
  if (!sys) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "system_missing",
    });
    return false;
  }
  const travel = beginFleetTravel(world, fleet, toId, "idle", journal, {
    type: "move_fleet",
    intentId: intent.id,
    factionId: intent.factionId,
  });
  if (
    travel.ok &&
    intent.defId === "intent.move_fleet" &&
    toId !== fleet.pendingAttackSystemId
  ) {
    delete fleet.pendingAttackSystemId;
  }
  if (travel.ok) clearBlockadeIfEmpty(world, travel.fromId);
  return travel.ok;
}

export function applyMoveLegion(world, intent, journal) {
  const legionId = intent.payload?.legionId;
  const toId = intent.payload?.toSystemId;
  const legion = (world.legions ?? []).find((l) => l.id === legionId);
  if (!legion || legion.factionId !== intent.factionId) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "legion_invalid",
    });
    return false;
  }
  if (!(world.systems ?? []).some((s) => s.id === toId)) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "system_missing",
    });
    return false;
  }
  const travel = completeForceTravel(
    world,
    legion,
    "legion",
    toId,
    "idle",
    journal,
    {
      type: "move_legion",
      intentId: intent.id,
      factionId: intent.factionId,
    },
  );
  if (!travel.ok) return false;
  if (
    intent.defId === "intent.move_legion" &&
    toId !== legion.pendingAttackSystemId
  ) {
    delete legion.pendingAttackSystemId;
  }
  return true;
}

export function applyBlockade(world, intent, journal) {
  const fleetId = intent.payload?.fleetId;
  const toId = intent.payload?.toSystemId;
  const fleet = (world.fleets ?? []).find((f) => f.id === fleetId);
  if (!fleet) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "fleet_missing",
    });
    return false;
  }
  if (fleet.factionId !== intent.factionId) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "fleet_not_owned",
    });
    return false;
  }
  const sys = (world.systems ?? []).find((s) => s.id === toId);
  if (!sys) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "system_missing",
    });
    return false;
  }
  const travel = beginFleetTravel(world, fleet, toId, "blockade", journal, {
    type: "blockade",
    intentId: intent.id,
    factionId: intent.factionId,
  });
  if (!travel.ok) return false;
  delete fleet.pendingAttackSystemId;
  clearBlockadeIfEmpty(world, travel.fromId);
  if (travel.arrived) {
    sys.blockaded = true;
    fleet.stance = "blockade";
  }
  return true;
}

export function applyFortify(world, intent, journal) {
  const fleetId = intent.payload?.fleetId;
  const toId = intent.payload?.toSystemId;
  const fleet = (world.fleets ?? []).find((f) => f.id === fleetId);
  if (!fleet) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "fleet_missing",
    });
    return false;
  }
  if (fleet.factionId !== intent.factionId) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "fleet_not_owned",
    });
    return false;
  }
  if (toId && !(world.systems ?? []).some((s) => s.id === toId)) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "system_missing",
    });
    return false;
  }
  const holdSystemId = toId || fleet.systemId;
  const travel = beginFleetTravel(
    world,
    fleet,
    holdSystemId,
    "fortify",
    journal,
    {
      type: "fortify",
      intentId: intent.id,
      factionId: intent.factionId,
    },
  );
  if (travel.ok) {
    delete fleet.pendingAttackSystemId;
    clearBlockadeIfEmpty(world, travel.fromId);
  }
  return travel.ok;
}
