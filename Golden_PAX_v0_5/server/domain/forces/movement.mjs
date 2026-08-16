/**
 * Instant force movement within hop radius (hyperlane graph).
 *
 * Core (`hopDistance` / `systemsWithinMoveRange` / the teleport in
 * `completeForceTravel`) is a behavior port of GMap/server/forceMovement.mjs.
 * Movement is instant — no in-transit state, `force.systemId` updates
 * immediately. GMap blockade refresh / intent journal / `getContent()`
 * hidden calls are not ported (this project has no persisted blockade
 * and domain functions take content explicitly).
 *
 * Engine → range and fuel → movement-points are NEW DESIGN, not in GMap.
 * They replace GMap's flat `content.rules.movement.rangeHops` constant
 * (and the unused `defaultFleetSpeed` field, which is not consumed).
 *
 * First-pass numerics (content/core/rules.json `movement`, 2026-08-15):
 *   engineRangeHops:    tier 0→2, 1→3, 2→4, 3→5, 4→6, 5→7
 *   fuelMovementPoints: tier 0→3, 1→4, 2→6, 3→8, 4→10, 5→12
 *   movementPointsPerHop: 1
 *   legionRangeHops: 3, legionMovementPoints: 3 (no engine/fuel)
 * Tech-gating engines (mirrors Tech Tree 2.0 `weapon.*` equipment slots)
 * is a follow-up — this pass stores a flat `engineTier`/`fuelTier` integer
 * (optionally copied from `def.engineTier` / `def.fuelTier` at raise).
 *
 * `move_cost_mult` (court admiral posting / tech) is consumed here via
 * `opts.effects` — a plain list the HTTP route already collected. Domain
 * stays pure: no court/npcStore import.
 */
import { hopPath, neighborIds } from "../systems/pathfinding.mjs";
import { applyFlatThenMult, buildModifierStack } from "../economy/modifierStack.mjs";

export function hopDistance(world, fromId, toId, mode = "any") {
  const path = hopPath(world, fromId, toId, mode);
  if (!fromId || !toId) return Infinity;
  if (fromId === toId) return 0;
  if (path.length < 2) return Infinity;
  return path.length - 1;
}

function movementRules(content) {
  return content?.rules?.movement ?? {};
}

function tableLookup(table, tier, fallback) {
  if (!table || typeof table !== "object") return fallback;
  const v = table[String(tier)] ?? table[tier];
  if (v == null || !Number.isFinite(Number(v))) return fallback;
  return Math.max(0, Math.floor(Number(v)));
}

/** GMap's resolveMoveRangeHops — kept for legion fallback / parity. */
export function resolveMoveRangeHops(content, mode = "fleet") {
  const mov = movementRules(content);
  const key = mode === "legion" ? "legionRangeHops" : "fleetRangeHops";
  const specific = mov[key];
  if (specific != null && Number.isFinite(Number(specific))) {
    return Math.max(0, Math.floor(Number(specific)));
  }
  return Math.max(0, Math.floor(Number(mov.rangeHops ?? 3)));
}

/**
 * NEW DESIGN: fleet hop range from engine tier. Legions use the GMap
 * legion/shared rangeHops constant (engines are a ship concept).
 */
export function resolveEngineRangeHops(force, content) {
  const mode = force?.kind === "legion" ? "legion" : "fleet";
  if (mode === "legion") return resolveMoveRangeHops(content, "legion");
  const fallback = resolveMoveRangeHops(content, "fleet");
  return tableLookup(movementRules(content).engineRangeHops, force?.engineTier ?? 0, fallback);
}

/**
 * NEW DESIGN: movement-points pool max. Refills to this every turn,
 * regardless of location. Legions use a fixed content constant.
 */
export function maxMovementPoints(force, content) {
  const mov = movementRules(content);
  if (force?.kind === "legion") {
    return Math.max(0, Math.floor(Number(mov.legionMovementPoints ?? mov.rangeHops ?? 3)));
  }
  const fallback = Math.max(0, Math.floor(Number(mov.rangeHops ?? 3)));
  return tableLookup(mov.fuelMovementPoints, force?.fuelTier ?? 0, fallback);
}

export function movementPointsPerHop(content) {
  return Math.max(0, Math.floor(Number(movementRules(content).movementPointsPerHop ?? 1)));
}

function movementCostEffects(effects, force) {
  return (effects || []).filter((e) => {
    const scope = e.scope || "faction";
    if (scope === "faction") return true;
    if ((scope === "fleet" || scope === "legion") && force?.id && e.targetId === force.id) return true;
    return false;
  });
}

/** Integer MP spend for a hop count. Unchanged when no matching effects. */
export function movementCost(hops, content, effects, force) {
  if (!hops) return 0;
  const base = hops * movementPointsPerHop(content);
  const relevant = movementCostEffects(effects, force);
  if (!relevant.length) return base;
  const channel = buildModifierStack(relevant).channels.move_cost;
  if (!channel) return base;
  return Math.max(1, Math.round(applyFlatThenMult(base, channel)));
}

export function checkMoveRange(world, fromId, toId, mode, maxHops) {
  const hops = hopDistance(world, fromId, toId, mode);
  if (!Number.isFinite(hops)) {
    return { ok: false, error: "no_path", hops, maxHops };
  }
  if (hops > maxHops) {
    return { ok: false, error: "out_of_range", hops, maxHops };
  }
  return { ok: true, hops, maxHops };
}

/** All system ids reachable within maxHops (inclusive of origin). GMap port. */
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

/**
 * Instant teleport when destination is within engine range AND remaining
 * movement points cover hops × cost. Same-system is a no-op (0 hops, 0 MP).
 * Does not mutate `force` — returns a new object.
 */
export function completeForceTravel(world, force, toSystemId, content, opts = {}) {
  const toId = toSystemId;
  if (!force) return { ok: false, error: "no_force" };
  if (!toId) return { ok: false, error: "no_destination" };

  const mode = force.kind === "legion" ? "legion" : "fleet";
  const fromId = force.systemId;
  if (!fromId) return { ok: false, error: "no_location" };

  if (fromId === toId) {
    return { ok: true, force, fromId, toId, hops: 0, movementPointsSpent: 0 };
  }

  const maxHops = resolveEngineRangeHops(force, content);
  const range = checkMoveRange(world, fromId, toId, mode, maxHops);
  if (!range.ok) return { ...range, force };

  const spent = movementCost(range.hops, content, opts.effects, force);
  const pool = Math.max(0, Math.floor(Number(force.movementPoints ?? 0)));
  if (spent > pool) {
    return {
      ok: false,
      error: "insufficient_movement_points",
      hops: range.hops,
      maxHops,
      movementPoints: pool,
      movementPointsNeeded: spent,
      force,
    };
  }

  const next = {
    ...force,
    lastSystemId: fromId,
    systemId: toId,
    movementPoints: pool - spent,
  };
  return {
    ok: true,
    force: next,
    fromId,
    toId,
    hops: range.hops,
    maxHops,
    movementPointsSpent: spent,
    movementPoints: next.movementPoints,
  };
}

export function refillMovementPoints(force, content) {
  return { ...force, movementPoints: maxMovementPoints(force, content) };
}

/** Copy engine/fuel tier off a ship def at raise time (optional fields). */
export function tiersFromDef(def) {
  return {
    engineTier: Math.max(0, Math.floor(Number(def?.engineTier ?? 0))),
    fuelTier: Math.max(0, Math.floor(Number(def?.fuelTier ?? 0))),
  };
}
