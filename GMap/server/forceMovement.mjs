/**
 * Instant force movement within hop radius (hyperlane graph).
 *
 * Hop graph stays here (`hopPath` / `checkMoveRange` / teleport). Engine range
 * + fuel MP + `move_cost_mult` are a layer from `forceMp.mjs` — instant/AP
 * hop orders still call this function; they are not replaced.
 */
import { hopPath, neighborIds } from "./pathfinding.mjs";
import { getContent } from "./contentLoader.mjs";
import { ensureFactionEco, readLedger } from "./ledger.mjs";
import {
  assertMoveAffordable,
  applyMpSpend,
  collectMoveCostEffects,
  currentMovementPoints,
  resolveEngineRangeHops,
  techMoveCostEffects,
} from "./forceMp.mjs";

export function hopDistance(world, fromId, toId, mode = "any") {
  const path = hopPath(world, fromId, toId, mode);
  if (!fromId || !toId) return Infinity;
  if (fromId === toId) return 0;
  if (path.length < 2) return Infinity;
  return path.length - 1;
}

export function resolveMoveRangeHops(content, mode = "fleet") {
  const mov = content?.rules?.movement ?? {};
  const key = mode === "legion" ? "legionRangeHops" : "fleetRangeHops";
  const specific = mov[key];
  if (specific != null && Number.isFinite(Number(specific))) {
    return Math.max(0, Math.floor(Number(specific)));
  }
  return Math.max(0, Math.floor(Number(mov.rangeHops ?? 3)));
}

function liveMoveCostEffects(world, unit, content) {
  const fac = (world.factions ?? []).find((f) => f.id === unit?.factionId);
  let tech = [];
  try {
    if (unit?.factionId) {
      const ledger = readLedger();
      const eco = ensureFactionEco(ledger, unit.factionId);
      tech = techMoveCostEffects(eco, content);
    }
  } catch {
    tech = [];
  }
  return collectMoveCostEffects(fac?.activeEffects, tech, unit);
}

export function checkMoveRange(world, content, fromId, toId, mode, unit) {
  const maxHops = unit
    ? resolveEngineRangeHops(unit, content, mode === "legion" ? "legion" : "fleet")
    : resolveMoveRangeHops(content, mode);
  const hops = hopDistance(world, fromId, toId, mode);
  if (!Number.isFinite(hops)) {
    return { ok: false, error: "Нет пути", hops, maxHops };
  }
  if (hops > maxHops) {
    return {
      ok: false,
      error: `Цель вне радиуса (${hops} > ${maxHops} пр.)`,
      hops,
      maxHops,
    };
  }
  return { ok: true, hops, maxHops };
}

/** All system ids reachable within maxHops (inclusive of origin). */
export function systemsWithinMoveRange(world, fromId, mode, maxHops) {
  const reached = new Set();
  if (!fromId) return reached;
  reached.add(fromId);
  if (maxHops <= 0) return reached;
  const q = [{ id: fromId, hops: 0 }];
  let qi = 0;
  while (qi < q.length) {
    const { id, hops } = q[qi++];
    if (hops >= maxHops) continue;
    for (const n of neighborIds(world, id, mode)) {
      if (reached.has(n)) continue;
      reached.add(n);
      q.push({ id: n, hops: hops + 1 });
    }
  }
  return reached;
}

export function refreshSystemBlockade(world, systemId) {
  if (!systemId) return;
  const sys = (world.systems ?? []).find((s) => s.id === systemId);
  if (!sys) return;
  const still = (world.fleets ?? []).some(
    (f) =>
      f.systemId === systemId &&
      f.stance === "blockade" &&
      !(f.route && f.route.length),
  );
  sys.blockaded = still;
}

/**
 * Teleport fleet/legion to destination when within movement radius.
 * @returns {{ ok: boolean, fromId?: string, toId?: string, arrived?: boolean, hopsLeft?: number }}
 */
export function completeForceTravel(
  world,
  unit,
  kind,
  toId,
  arriveStance,
  journal,
  meta,
) {
  const mode = kind === "legion" ? "legion" : "fleet";
  const fromId = unit.systemId;
  const content = meta?.content ?? getContent();
  const effects = meta?.effects ?? liveMoveCostEffects(world, unit, content);
  const leftBlockade =
    kind === "fleet" &&
    unit.stance === "blockade" &&
    (fromId !== toId || arriveStance !== "blockade");

  if (fromId === toId) {
    unit.route = [];
    if (kind === "fleet") {
      unit.stance = arriveStance;
      delete unit.pendingArrival;
    } else {
      unit.status = "idle";
    }
    if (leftBlockade || arriveStance !== "blockade") {
      refreshSystemBlockade(world, fromId);
    }
    if (kind === "fleet" && arriveStance === "blockade") {
      const sys = (world.systems ?? []).find((s) => s.id === toId);
      if (sys) sys.blockaded = true;
    }
    return { ok: true, fromId, toId, arrived: true, hopsLeft: 0, hops: 0, movementPointsSpent: 0 };
  }

  const path = hopPath(world, fromId, toId, mode);
  if (path.length < 2) {
    journal?.push?.({
      at: new Date().toISOString(),
      type: "reject",
      intentId: meta?.intentId,
      reason: "no_path",
      [`${kind}Id`]: unit.id,
      fromId,
      toId,
    });
    return { ok: false, reason: "no_path" };
  }

  const range = checkMoveRange(world, content, fromId, toId, mode, unit);
  if (!range.ok) {
    journal?.push?.({
      at: new Date().toISOString(),
      type: "reject",
      intentId: meta?.intentId,
      reason: "out_of_range",
      [`${kind}Id`]: unit.id,
      fromId,
      toId,
      hops: range.hops,
      maxHops: range.maxHops,
    });
    return { ok: false, reason: "out_of_range", hops: range.hops, maxHops: range.maxHops };
  }

  const afford = assertMoveAffordable(unit, range.hops, content, effects, kind);
  if (!afford.ok) {
    journal?.push?.({
      at: new Date().toISOString(),
      type: "reject",
      intentId: meta?.intentId,
      reason: afford.reason,
      [`${kind}Id`]: unit.id,
      fromId,
      toId,
      hops: range.hops,
      movementPoints: afford.pool,
      movementPointsNeeded: afford.spent,
    });
    return {
      ok: false,
      reason: afford.reason,
      error: afford.error,
      hops: range.hops,
      maxHops: range.maxHops,
      movementPointsNeeded: afford.spent,
      movementPoints: afford.pool,
    };
  }

  if (unit.movementPoints == null || !Number.isFinite(Number(unit.movementPoints))) {
    unit.movementPoints = currentMovementPoints(unit, content, kind);
  }
  applyMpSpend(unit, afford.spent);

  unit.lastSystemId = fromId;
  unit.systemId = toId;
  unit.route = [];
  if (kind === "fleet") {
    unit.stance = arriveStance;
    delete unit.pendingArrival;
  } else {
    unit.status = "idle";
  }

  if (leftBlockade || fromId !== toId) {
    refreshSystemBlockade(world, fromId);
  }
  if (kind === "fleet" && arriveStance === "blockade") {
    const sys = (world.systems ?? []).find((s) => s.id === toId);
    if (sys) sys.blockaded = true;
  }

  journal?.push?.({
    at: new Date().toISOString(),
    type: meta?.type ?? `move_${kind}`,
    intentId: meta?.intentId,
    [`${kind}Id`]: unit.id,
    fromId,
    toId,
    hops: range.hops,
    instant: true,
    arrived: true,
    hopsLeft: 0,
    movementPointsSpent: afford.spent,
    movementPoints: unit.movementPoints,
    factionId: meta?.factionId,
  });

  return {
    ok: true,
    fromId,
    toId,
    arrived: true,
    hopsLeft: 0,
    hops: range.hops,
    movementPointsSpent: afford.spent,
    movementPoints: unit.movementPoints,
  };
}

/** Apply instant move intents immediately (intent.instant + writeLiveBoard). */
export function applyInstantForceMove(world, intent) {
  const payload = intent.payload || {};
  const toId = payload.toSystemId;
  if (!toId) return { ok: false, error: "Нет цели" };

  if (intent.defId === "intent.move_fleet" || intent.defId === "intent.blockade" || intent.defId === "intent.fortify") {
    const fleet = (world.fleets ?? []).find((f) => f.id === payload.fleetId);
    if (!fleet || fleet.factionId !== intent.factionId) {
      return { ok: false, error: "Флот недоступен" };
    }
    const stance =
      intent.defId === "intent.blockade"
        ? "blockade"
        : intent.defId === "intent.fortify"
          ? "fortify"
          : "idle";
    const travel = completeForceTravel(
      world,
      fleet,
      "fleet",
      toId,
      stance,
      null,
      {
        type: intent.defId.replace("intent.", ""),
        intentId: intent.id,
        factionId: intent.factionId,
      },
    );
    if (!travel.ok) {
      return { ok: false, error: travel.error || "Нет пути, цель вне радиуса или нет очков движения" };
    }
    if (
      intent.defId === "intent.move_fleet" &&
      toId !== fleet.pendingAttackSystemId
    ) {
      delete fleet.pendingAttackSystemId;
    }
    return { ok: true };
  }

  if (intent.defId === "intent.move_legion") {
    const legion = (world.legions ?? []).find((l) => l.id === payload.legionId);
    if (!legion || legion.factionId !== intent.factionId) {
      return { ok: false, error: "Легион недоступен" };
    }
    const travel = completeForceTravel(
      world,
      legion,
      "legion",
      toId,
      "idle",
      null,
      {
        type: "move_legion",
        intentId: intent.id,
        factionId: intent.factionId,
      },
    );
    if (!travel.ok) {
      return { ok: false, error: travel.error || "Нет пути, цель вне радиуса или нет очков движения" };
    }
    if (toId !== legion.pendingAttackSystemId) {
      delete legion.pendingAttackSystemId;
    }
    return { ok: true };
  }

  return { ok: false, error: "Не instant-move intent" };
}
