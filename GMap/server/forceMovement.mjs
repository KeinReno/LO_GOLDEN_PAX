/**
 * Instant force movement within hop radius (hyperlane graph).
 */
import { hopPath, neighborIds } from "./pathfinding.mjs";
import { getContent } from "./contentLoader.mjs";

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

export function checkMoveRange(world, content, fromId, toId, mode) {
  const maxHops = resolveMoveRangeHops(content, mode);
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
  const content = getContent();
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
    return { ok: true, fromId, toId, arrived: true, hopsLeft: 0 };
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
    return { ok: false };
  }

  const range = checkMoveRange(world, content, fromId, toId, mode);
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
    return { ok: false };
  }

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
    factionId: meta?.factionId,
  });

  return {
    ok: true,
    fromId,
    toId,
    arrived: true,
    hopsLeft: 0,
    hops: range.hops,
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
      return { ok: false, error: "Нет пути или цель вне радиуса" };
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
      return { ok: false, error: "Нет пути или цель вне радиуса" };
    }
    if (toId !== legion.pendingAttackSystemId) {
      delete legion.pendingAttackSystemId;
    }
    return { ok: true };
  }

  return { ok: false, error: "Не instant-move intent" };
}
