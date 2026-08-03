/**
 * Logistics network — supply graph from capital through corridor/gate links.
 */
import { getDiplomacyRelation } from "./factionIntel.mjs";
import { systemSpaceObjectTags } from "./narrative.mjs";

const LOGISTICS_LINK_TYPES = new Set(["corridor", "gate"]);
const ALLY_RELATIONS = new Set(["trade", "alliance"]);

function logisticsRules(content) {
  return content?.rules?.logistics || {};
}

function disconnectedArgs(content) {
  const rules = logisticsRules(content);
  const pen = (rules.disconnectedPenalties || []).find(
    (e) => e.effect === "logistics_disconnected_penalty",
  );
  return {
    productionMult: pen?.args?.productionMult ?? 0.5,
    upkeepMult: pen?.args?.upkeepMult ?? 1.3,
    combatDefMult: pen?.args?.combatDefMult ?? 0.7,
  };
}

export function resolveCapitalSystemId(world, factionId) {
  const faction = (world.factions ?? []).find((f) => f.id === factionId);
  if (faction?.capitalSystemId) {
    const named = (world.systems ?? []).find(
      (s) => s.id === faction.capitalSystemId,
    );
    if (named && named.ownerFactionId === factionId) return named.id;
  }
  const marked = (world.systems ?? []).find(
    (s) => s.ownerFactionId === factionId && s.isCapital,
  );
  if (marked) return marked.id;
  const first = (world.systems ?? []).find((s) => s.ownerFactionId === factionId);
  return first?.id || null;
}

function isAllyOrSelf(world, factionId, ownerId) {
  if (!ownerId) return false;
  if (ownerId === factionId) return true;
  return ALLY_RELATIONS.has(getDiplomacyRelation(world, factionId, ownerId));
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
  return true;
}

/** Extra hops from faction traits / effects (A1 logistics_range_add). */
export function logisticsRangeBonus(world, factionId, content) {
  let hops = 0;
  const faction = (world.factions ?? []).find((f) => f.id === factionId);
  for (const trait of faction?.traits || []) {
    const effects =
      (typeof trait === "object" && trait.effects) ||
      content?.faction_traits?.traits?.[typeof trait === "string" ? trait : trait.id]
        ?.effects ||
      [];
    for (const e of effects) {
      if (e.effect === "logistics_range_add") {
        hops += Number(e.args?.hops ?? e.args?.amount ?? 0) || 0;
      }
    }
  }
  return hops;
}

/**
 * @returns {number} supplyLevel 0..1
 */
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
  const baseRange =
    (rules.baseRangeHops ?? 3) + logisticsRangeBonus(world, factionId, content);
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

  /** @type {Map<string, { hops: number, parentId: string | null, viaDepot: boolean }>} */
  const visited = new Map([
    [
      capitalId,
      {
        hops: 0,
        parentId: null,
        viaDepot: hasDepot(capital),
      },
    ],
  ]);
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
      // Capital itself may have quarantine; already in visited.
      if (
        rules.quarantineBreaksLogistics &&
        hasQuarantine(next) &&
        nextId !== capitalId
      ) {
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
    const bottlenecked =
      connected && node.hops > 0 && node.hops >= Math.max(1, rangeLimit - 1);

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

/**
 * Scale effect args by supplyLevel (flats/mults interpolate toward identity).
 */
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
 * Collect ModifierStack effects for a faction from current system.logistics.
 * Production/upkeep per-system scaling is applied in economyTick separately;
 * here we surface AP + explainable penalties/bonuses.
 */
export function applyLogisticsEffects(world, factionId, content) {
  const rules = logisticsRules(content);
  const effects = [];
  const owned = (world.systems ?? []).filter(
    (s) => s.ownerFactionId === factionId,
  );
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
      if (bonus.effect === "production_mult") continue; // per-system in economy
      const scaled = scaleEffectBySupply(bonus, bestSupply || 1);
      effects.push({
        ...scaled,
        source: {
          kind: "logistics",
          id: "connected",
          label: "Снабжение",
        },
      });
    }
  }

  const disconnected = owned.filter((s) => !s.logistics?.connectedToCapital);
  if (disconnected.length > 0) {
    for (const pen of rules.disconnectedPenalties || []) {
      effects.push({
        ...pen,
        args: { ...(pen.args || {}) },
        source: {
          kind: "logistics",
          id: "disconnected",
          label: `Отрезано (${disconnected.length})`,
        },
      });
    }
  }

  return effects;
}

/** Production multiplier for a single owned system (flows / yields). */
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

/** Upkeep multiplier for buildings/pop in a system. */
export function logisticsUpkeepMult(sys, content) {
  const L = sys?.logistics;
  if (!L || L.connectedToCapital) return 1;
  return disconnectedArgs(content).upkeepMult;
}

/** Combat defense multiplier for defender in this system. */
export function logisticsCombatDefMult(sys, content) {
  const L = sys?.logistics;
  if (!L || L.connectedToCapital) return 1;
  return disconnectedArgs(content).combatDefMult;
}

/** Recompute logistics for every faction on the board. */
export function computeAllFactionLogistics(world, content) {
  const turn = world.meta?.turn ?? 0;
  for (const fac of world.factions ?? []) {
    computeLogisticsNetwork(world, fac.id, content, turn);
  }
}
