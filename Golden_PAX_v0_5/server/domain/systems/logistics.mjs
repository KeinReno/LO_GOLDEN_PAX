/**
 * Logistics network — supply graph from capital through corridor/gate links.
 * Ported from GMap/server/logistics.mjs (behavior, not code shape).
 *
 * Diplomacy: GMap reads getDiplomacyRelation(world, ...). This project has
 * no factionIntel; pass `world.relations` as domain/diplomacy's
 * `${min}|${max}` map. Missing relations → not an ally (can't traverse).
 *
 * Faction traits: GMap's logisticsRangeBonus reads trait effects. This
 * project has no full trait data model yet — degrade to 0 bonus when
 * `faction.traits` / content.faction_traits is absent. Don't block.
 *
 * Space-object tags: GMap's systemSpaceObjectTags reads string tags.
 * This project's spaceObjects are `{ typeId }` instances — both shapes
 * are accepted.
 */
import { getRelation } from "../diplomacy/relations.mjs";

const LOGISTICS_LINK_TYPES = new Set(["corridor", "gate"]);
const ALLY_RELATIONS = new Set(["trade", "alliance"]);

function logisticsRules(content) {
  return content?.rules?.logistics || {};
}

function disconnectedArgs(content) {
  const rules = logisticsRules(content);
  const pen = (rules.disconnectedPenalties || []).find((e) => e.effect === "logistics_disconnected_penalty");
  return {
    productionMult: pen?.args?.productionMult ?? 0.5,
    upkeepMult: pen?.args?.upkeepMult ?? 1.3,
    combatDefMult: pen?.args?.combatDefMult ?? 0.7,
  };
}

export function resolveCapitalSystemId(world, factionId) {
  const faction = (world.factions ?? []).find((f) => f.id === factionId);
  if (faction?.capitalSystemId) {
    const named = (world.systems ?? []).find((s) => s.id === faction.capitalSystemId);
    if (named && named.ownerFactionId === factionId) return named.id;
  }
  const marked = (world.systems ?? []).find((s) => s.ownerFactionId === factionId && s.isCapital);
  if (marked) return marked.id;
  const first = (world.systems ?? []).find((s) => s.ownerFactionId === factionId);
  return first?.id || null;
}

function diplomacyRelation(world, factionId, ownerId) {
  if (world.relations) return getRelation(world.relations, factionId, ownerId);
  return "neutral";
}

function isAllyOrSelf(world, factionId, ownerId) {
  if (!ownerId) return false;
  if (ownerId === factionId) return true;
  return ALLY_RELATIONS.has(diplomacyRelation(world, factionId, ownerId));
}

export function systemSpaceObjectTags(sys) {
  const raw = sys?.spaceObjects;
  if (!Array.isArray(raw) || !raw.length) {
    if (sys?.poiType && sys.poiType !== "none") return [sys.poiType];
    return [];
  }
  const tags = raw.map((t) => (typeof t === "string" ? t : t?.typeId)).filter((t) => t && t !== "none");
  return [...new Set(tags)];
}

function hasQuarantine(sys) {
  return systemSpaceObjectTags(sys).includes("quarantine");
}

function hasDepot(sys) {
  return systemSpaceObjectTags(sys).includes("depot");
}

function canTraverse(world, factionId, sys, content) {
  if (!sys) return false;
  const rules = logisticsRules(content);
  if (!isAllyOrSelf(world, factionId, sys.ownerFactionId)) return false;
  if (rules.quarantineBreaksLogistics && hasQuarantine(sys)) return false;
  if (rules.blockadedIsDisconnected && sys.blockaded) return false;
  return true;
}

/** Extra hops from faction traits / effects. 0 when trait data isn't available. */
export function logisticsRangeBonus(world, factionId, content) {
  let hops = 0;
  const faction = (world.factions ?? []).find((f) => f.id === factionId);
  for (const trait of faction?.traits || []) {
    const effects =
      (typeof trait === "object" && trait.effects) ||
      content?.faction_traits?.traits?.[typeof trait === "string" ? trait : trait.id]?.effects ||
      [];
    for (const e of effects) {
      if (e.effect === "logistics_range_add") {
        hops += Number(e.args?.hops ?? e.args?.amount ?? 0) || 0;
      }
    }
  }
  return hops;
}

export function computeSupplyLevel(hops, content) {
  const decay = logisticsRules(content).supplyDecayPerHop ?? 0.15;
  const h = Math.max(0, Number(hops) || 0);
  return 1 / (1 + decay * h);
}

function emptyLogistics(turn) {
  return {
    connectedToCapital: false,
    hopsToCapital: -1,
    viaDepot: false,
    supplyLevel: 0,
    bottlenecked: false,
    parentId: null,
    computedAtTurn: turn,
  };
}

/**
 * BFS from capital; mutates owned systems' `logistics` for this faction.
 * @returns {Map<string, object>} logistics by system id (owned only)
 */
export function computeLogisticsNetwork(world, factionId, content, turn = null) {
  const rules = logisticsRules(content);
  const computedAtTurn = turn ?? world.meta?.turn ?? 0;
  const baseRange = (rules.baseRangeHops ?? 3) + logisticsRangeBonus(world, factionId, content);
  const depotBonus = rules.depotRangeBonus ?? 2;
  const byId = new Map((world.systems ?? []).map((s) => [s.id, s]));
  const result = new Map();

  for (const sys of world.systems ?? []) {
    if (sys.ownerFactionId !== factionId) continue;
    sys.logistics = emptyLogistics(computedAtTurn);
    result.set(sys.id, sys.logistics);
  }

  const capitalId = resolveCapitalSystemId(world, factionId);
  if (!capitalId || !byId.has(capitalId)) return result;

  const capital = byId.get(capitalId);
  if (capital.ownerFactionId === factionId) {
    const atCap = {
      connectedToCapital: true,
      hopsToCapital: 0,
      viaDepot: hasDepot(capital),
      supplyLevel: 1,
      bottlenecked: false,
      parentId: null,
      computedAtTurn,
    };
    capital.logistics = atCap;
    result.set(capitalId, atCap);
  }

  const visited = new Map([[capitalId, { hops: 0, parentId: null, viaDepot: hasDepot(capital) }]]);
  const queue = [capitalId];

  while (queue.length) {
    const id = queue.shift();
    const cur = visited.get(id);
    const maxHops = baseRange + (cur.viaDepot ? depotBonus : 0);
    if (cur.hops >= maxHops) continue;

    for (const link of world.links ?? []) {
      if (!LOGISTICS_LINK_TYPES.has(link.type)) continue;
      let nextId = null;
      if (link.fromId === id) nextId = link.toId;
      else if (link.toId === id) nextId = link.fromId;
      else continue;

      const next = byId.get(nextId);
      if (!canTraverse(world, factionId, next, content)) continue;
      if (rules.quarantineBreaksLogistics && hasQuarantine(next) && nextId !== capitalId) {
        continue;
      }

      const hops = cur.hops + 1;
      const viaDepot = cur.viaDepot || hasDepot(next);
      const rangeLimit = baseRange + (viaDepot ? depotBonus : 0);
      if (hops > rangeLimit) continue;

      const prev = visited.get(nextId);
      if (prev && prev.hops <= hops) continue;

      visited.set(nextId, { hops, parentId: id, viaDepot });
      queue.push(nextId);
    }
  }

  for (const [sysId, node] of visited) {
    const sys = byId.get(sysId);
    if (!sys || sys.ownerFactionId !== factionId) continue;

    let connected = true;
    if (rules.blockadedIsDisconnected && sys.blockaded && sysId !== capitalId) {
      connected = false;
    }

    const rangeLimit = baseRange + (node.viaDepot ? depotBonus : 0);
    const bottlenecked = connected && node.hops > 0 && node.hops >= Math.max(1, rangeLimit - 1);

    const logistics = connected
      ? {
          connectedToCapital: true,
          hopsToCapital: node.hops,
          viaDepot: node.viaDepot,
          supplyLevel: computeSupplyLevel(node.hops, content),
          bottlenecked,
          parentId: node.parentId,
          computedAtTurn,
        }
      : {
          ...emptyLogistics(computedAtTurn),
          hopsToCapital: node.hops,
          viaDepot: node.viaDepot,
          parentId: node.parentId,
          bottlenecked: false,
        };

    sys.logistics = logistics;
    result.set(sysId, logistics);
  }

  return result;
}

function scaleEffectBySupply(effect, supplyLevel) {
  const e = {
    effect: effect.effect,
    args: { ...(effect.args || {}) },
  };
  const s = Math.max(0, Math.min(1, Number(supplyLevel) || 0));
  if (typeof e.args.amount === "number") {
    e.args.amount = e.args.amount * s;
  }
  if (typeof e.args.mult === "number") {
    e.args.mult = 1 + (e.args.mult - 1) * s;
  }
  return e;
}

/**
 * Collect ModifierStack effects from current system.logistics.
 * AP bonuses are returned here but this project has no AP budget yet —
 * callers that don't consume them are fine. Production/upkeep per-system
 * scaling is applied in flowIncome, not via this list.
 */
export function applyLogisticsEffects(world, factionId, content) {
  const rules = logisticsRules(content);
  const effects = [];
  const owned = (world.systems ?? []).filter((s) => s.ownerFactionId === factionId);
  if (!owned.length) return effects;

  let anyConnected = false;
  let bestSupply = 0;
  for (const sys of owned) {
    const L = sys.logistics;
    if (L?.connectedToCapital) {
      anyConnected = true;
      bestSupply = Math.max(bestSupply, L.supplyLevel ?? 0);
    }
  }

  if (anyConnected) {
    for (const bonus of rules.connectedBonuses || []) {
      if (bonus.effect === "production_mult") continue;
      const scaled = scaleEffectBySupply(bonus, bestSupply || 1);
      effects.push({
        ...scaled,
        source: { kind: "logistics", id: "connected", label: "Снабжение" },
      });
    }
  }

  const disconnected = owned.filter((s) => !s.logistics?.connectedToCapital);
  if (disconnected.length > 0) {
    for (const pen of rules.disconnectedPenalties || []) {
      effects.push({
        ...pen,
        args: { ...(pen.args || {}) },
        source: { kind: "logistics", id: "disconnected", label: `Отрезано (${disconnected.length})` },
      });
    }
  }

  return effects;
}

export function logisticsProductionMult(sys, content) {
  const L = sys?.logistics;
  if (!L) return 1;
  if (!L.connectedToCapital) {
    return disconnectedArgs(content).productionMult;
  }
  let scale = 1;
  for (const bonus of logisticsRules(content).connectedBonuses || []) {
    if (bonus.effect !== "production_mult") continue;
    const m = Number(bonus.args?.mult ?? 1);
    scale *= 1 + (m - 1) * (L.supplyLevel ?? 1);
  }
  return scale;
}

export function logisticsUpkeepMult(sys, content) {
  const L = sys?.logistics;
  if (!L || L.connectedToCapital) return 1;
  return disconnectedArgs(content).upkeepMult;
}

export function logisticsCombatDefMult(sys, content) {
  const L = sys?.logistics;
  if (!L || L.connectedToCapital) return 1;
  return disconnectedArgs(content).combatDefMult;
}

export function computeAllFactionLogistics(world, content) {
  const turn = world.meta?.turn ?? 0;
  for (const fac of world.factions ?? []) {
    computeLogisticsNetwork(world, fac.id, content, turn);
  }
  return world;
}
