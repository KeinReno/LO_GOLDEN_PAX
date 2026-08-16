/**
 * Engine hop-range + fuel movement-points (NEW DESIGN layer).
 *
 * Does not replace GMap hop graph (`pathfinding` / `logistics`) or instant/AP
 * hop orders. `forceMovement.completeForceTravel` still teleports; this module
 * supplies per-force range and an MP pool spent on each hop.
 *
 * Formula (first-pass, content/core/rules.json `movement`):
 *   rangeHops(force) = engineRangeHops[engineTier]   (legion: legionRangeHops / rangeHops)
 *   maxMP(force)     = fuelMovementPoints[fuelTier]  (legion: legionMovementPoints)
 *   baseCost         = hops × movementPointsPerHop   (default 1)
 *   spent            = max(1, round((baseCost + flat) × move_cost_mult))
 *                      when no move_cost_mult effects: spent = baseCost (0 hops → 0)
 *   refill           = maxMP, every turn, any location
 *
 * engineTier/fuelTier: explicit fields, else max ship `engineTier`/`tier`
 * from composition, else the old flat rangeHops / 3 MP so existing fleets
 * keep their hop orders.
 */
import { applyFlatThenMult, buildModifierStack } from "./modifierStack.mjs";

function movementRules(content) {
  return content?.rules?.movement ?? {};
}

function tableLookup(table, tier, fallback) {
  if (!table || typeof table !== "object") return fallback;
  const v = table[String(tier)] ?? table[tier];
  if (v == null || !Number.isFinite(Number(v))) return fallback;
  return Math.max(0, Math.floor(Number(v)));
}

function finiteInt(value) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Math.max(0, Math.floor(Number(value)));
}

/** GMap's flat constant — fallback when a force has no engine modeled. */
export function resolveMoveRangeHops(content, mode = "fleet") {
  const mov = movementRules(content);
  const key = mode === "legion" ? "legionRangeHops" : "fleetRangeHops";
  const specific = mov[key];
  if (specific != null && Number.isFinite(Number(specific))) {
    return Math.max(0, Math.floor(Number(specific)));
  }
  return Math.max(0, Math.floor(Number(mov.rangeHops ?? 3)));
}

export function tiersFromDef(def) {
  return {
    engineTier: Math.max(0, Math.floor(Number(def?.engineTier ?? def?.tier ?? 0))),
    fuelTier: Math.max(0, Math.floor(Number(def?.fuelTier ?? def?.tier ?? 0))),
  };
}

function compositionTier(force, content, field) {
  const ships = content?.ships ?? {};
  let best = null;
  for (const g of force?.composition ?? []) {
    const def = ships[g.defId] || ships[g.type];
    const raw = def?.[field] ?? def?.tier;
    const n = finiteInt(raw);
    if (n == null) continue;
    best = Math.max(best ?? 0, n);
  }
  return best;
}

export function resolveEngineTier(force, content) {
  const explicit = finiteInt(force?.engineTier);
  if (explicit != null) return explicit;
  return compositionTier(force, content, "engineTier");
}

export function resolveFuelTier(force, content) {
  const explicit = finiteInt(force?.fuelTier);
  if (explicit != null) return explicit;
  return compositionTier(force, content, "fuelTier");
}

/**
 * Fleet hop range from engine tier. Legions keep the GMap legion/shared
 * rangeHops constant (engines are a ship concept).
 */
export function resolveEngineRangeHops(force, content, kind = "fleet") {
  const mode = kind === "legion" ? "legion" : "fleet";
  const fallback = resolveMoveRangeHops(content, mode);
  if (mode === "legion") return fallback;
  const tier = resolveEngineTier(force, content);
  if (tier == null) return fallback;
  return tableLookup(movementRules(content).engineRangeHops, tier, fallback);
}

export function maxMovementPoints(force, content, kind = "fleet") {
  const mov = movementRules(content);
  if (kind === "legion") {
    return Math.max(0, Math.floor(Number(mov.legionMovementPoints ?? mov.rangeHops ?? 3)));
  }
  const fallback = Math.max(0, Math.floor(Number(mov.rangeHops ?? 3)));
  const tier = resolveFuelTier(force, content);
  if (tier == null) return fallback;
  return tableLookup(mov.fuelMovementPoints, tier, fallback);
}

export function movementPointsPerHop(content) {
  return Math.max(0, Math.floor(Number(movementRules(content).movementPointsPerHop ?? 1)));
}

/**
 * Court/tech `move_cost_mult` already emitted on faction.activeEffects /
 * researched techs — unused until this layer. Faction-scope always applies;
 * fleet/legion-scope only when targetId matches the force.
 */
export function collectMoveCostEffects(factionEffects, techEffects, force) {
  const merged = [...(factionEffects || []), ...(techEffects || [])];
  return merged.filter((e) => {
    if (e?.effect !== "move_cost_mult") return false;
    const scope = e.scope || "faction";
    if (scope === "faction") return true;
    if ((scope === "fleet" || scope === "legion") && force?.id && e.targetId === force.id) {
      return true;
    }
    return false;
  });
}

/**
 * `move_cost_mult` from researched techs/upgrades. Narrow read of eco +
 * content — does not import techActions/techOffers.
 */
export function techMoveCostEffects(eco, content) {
  const out = [];
  const techs = content?.technologies || {};
  const combos = content?.tech_combos?.combos || content?.tech_combos || {};
  const unlockedUpgrades = new Set(eco?.unlockedUpgrades || []);
  for (const id of eco?.unlockedTechs || []) {
    const def = techs[id] || combos[id];
    if (!def) continue;
    for (const e of def.effects || []) {
      if (e.effect === "move_cost_mult") {
        out.push({ ...e, source: { kind: "tech", id, label: def.name } });
      }
    }
    for (const u of def.upgrades || []) {
      if (!unlockedUpgrades.has(u.id)) continue;
      for (const e of u.effects || []) {
        if (e.effect === "move_cost_mult") {
          out.push({ ...e, source: { kind: "tech_upgrade", id: u.id, label: u.name } });
        }
      }
    }
  }
  return out;
}

/** Integer MP spend for a hop count. Unchanged when no matching effects. */
export function movementCost(hops, content, effects, force) {
  if (!hops) return 0;
  const base = hops * movementPointsPerHop(content);
  const relevant = collectMoveCostEffects(effects, null, force);
  if (!relevant.length) return base;
  const channel = buildModifierStack(relevant).channels.move_cost;
  if (!channel) return base;
  return Math.max(1, Math.round(applyFlatThenMult(base, channel)));
}

/** Missing pool → full tank so existing fleets are not stranded at 0. */
export function currentMovementPoints(force, content, kind = "fleet") {
  const raw = force?.movementPoints;
  if (raw != null && Number.isFinite(Number(raw))) {
    return Math.max(0, Math.floor(Number(raw)));
  }
  return maxMovementPoints(force, content, kind);
}

export function assertMoveAffordable(force, hops, content, effects, kind = "fleet") {
  const spent = movementCost(hops, content, effects, force);
  const pool = currentMovementPoints(force, content, kind);
  if (spent > pool) {
    return {
      ok: false,
      reason: "insufficient_movement_points",
      error: `Недостаточно очков движения (${spent} > ${pool})`,
      spent,
      pool,
    };
  }
  return { ok: true, spent, pool };
}

export function applyMpSpend(force, spent) {
  const pool = Math.max(0, Math.floor(Number(force.movementPoints ?? 0)));
  force.movementPoints = Math.max(0, pool - Math.max(0, Math.floor(Number(spent) || 0)));
  return force.movementPoints;
}

export function refillMovementPoints(force, content, kind = "fleet") {
  return { ...force, movementPoints: maxMovementPoints(force, content, kind) };
}

export function applyMpRefill(force, content, kind = "fleet") {
  force.movementPoints = maxMovementPoints(force, content, kind);
  return force;
}

/** Per-turn refill to max, regardless of location. Call at tick end. */
export function refillAllForces(world, content) {
  for (const fleet of world.fleets ?? []) {
    applyMpRefill(fleet, content, "fleet");
  }
  for (const legion of world.legions ?? []) {
    applyMpRefill(legion, content, "legion");
  }
  return world;
}

export function stampForceMp(force, content, kind, def) {
  if (kind !== "legion" && def) {
    const tiers = tiersFromDef(def);
    force.engineTier = Math.max(finiteInt(force.engineTier) ?? 0, tiers.engineTier);
    force.fuelTier = Math.max(finiteInt(force.fuelTier) ?? 0, tiers.fuelTier);
  }
  if (force.movementPoints == null || !Number.isFinite(Number(force.movementPoints))) {
    force.movementPoints = maxMovementPoints(force, content, kind);
  }
  return force;
}
