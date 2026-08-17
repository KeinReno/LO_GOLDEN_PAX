/**
 * Research queue management + availability checks.
 * Extracted from ../techActions.mjs.
 */
import { getContent } from "../contentLoader.mjs";
import { readLedger, writeLedger, ensureFactionEco, adjustStock } from "../ledger.mjs";
import { readLiveBoard } from "../tableStore.mjs";
import { applyUnitUpgradeEffectsToWorld } from "../combatResolve.mjs";
import { applyPathResearchAffinity, checkPathGate } from "../techPaths.mjs";
import { applyOfferBypass, ensureOffers, techInOffer, techOfferAxis } from "../techOffers.mjs";
import {
  resolveTechDef,
  applyResearchCostMult,
  researchStackForFaction,
  checkTechLocks,
  applyUnlockEffects,
  canAfford,
  publicEcoSlice,
  offerOpts,
} from "./helpers.mjs";

export const RESEARCH_QUEUE_MAX = 5;

/**
 * Can this tech be placed in the research queue?
 * Requires prerequisites + race/trait locks. Does NOT require current cognitio.
 */
export function canQueueTech(factionId, techId, opts = {}) {
  const content = opts.content || getContent();
  const def = resolveTechDef(content, techId);
  if (!def) return { ok: false, error: "Неизвестная технология", canQueue: false };

  const world = opts.world ?? readLiveBoard();
  const ledger = opts.ledger || readLedger();
  const eco = opts.eco || ensureFactionEco(ledger, factionId);

  if ((eco.unlockedTechs || []).includes(techId)) {
    return { ok: false, error: "Уже исследовано", canQueue: false };
  }

  // Alchemy / combo techs are granted via laboratory, not normal research queue.
  if (def.alchemyOnly || (def.tags || []).includes("alchemy") || (def.tags || []).includes("combo")) {
    return {
      ok: false,
      error: "Только через лабораторию (алхимия)",
      canQueue: false,
    };
  }

  for (const pre of def.prerequisites || []) {
    if (!(eco.unlockedTechs || []).includes(pre)) {
      const preName = content.technologies?.[pre]?.name || pre;
      return {
        ok: false,
        error: `Нужна технология: ${preName}`,
        canQueue: false,
      };
    }
  }

  const lock = checkTechLocks(def, factionId, eco, content, world);
  if (!lock.ok) return { ...lock, canQueue: false };

  const pathGate = checkPathGate(def, eco, content);
  if (!pathGate.ok) return { ...pathGate, canQueue: false };

  return { ok: true, canQueue: true, def };
}

/**
 * Three-level availability for UI: available / canQueue / blocked.
 */
export function techAvailability(factionId, techId, opts = {}) {
  const content = opts.content || getContent();
  const def = resolveTechDef(content, techId);
  if (!def) {
    return {
      available: false,
      canQueue: false,
      reason: "Неизвестная технология",
    };
  }
  const world = opts.world ?? readLiveBoard();
  const ledger = opts.ledger || readLedger();
  const eco = opts.eco || ensureFactionEco(ledger, factionId);

  if ((eco.unlockedTechs || []).includes(techId)) {
    return { available: false, canQueue: false, reason: "Уже исследовано" };
  }

  const queueGate = canQueueTech(factionId, techId, {
    content,
    world,
    ledger,
    eco,
  });
  if (!queueGate.ok) {
    return {
      available: false,
      canQueue: false,
      reason: queueGate.error || "Заблокировано",
    };
  }

  const stack = researchStackForFaction(factionId, eco, content, world);
  let cost = applyResearchCostMult(def.cost, stack, def.category);
  const faction = (world?.factions || []).find((f) => f.id === factionId);
  cost = applyPathResearchAffinity(cost, def, faction, content).cost;
  const axis = techOfferAxis(def, content);
  if (axis) ensureOffers(eco, content, offerOpts(factionId, eco, content, world));
  const offerBypass = Boolean(axis) && !techInOffer(eco, techId, axis);
  cost = applyOfferBypass(cost, offerBypass);
  const afford = canAfford(eco, cost);
  if (!afford.ok) {
    return {
      available: false,
      canQueue: true,
      reason: afford.error || "Мало ресурсов",
      cost,
      offerBypass,
    };
  }
  return { available: true, canQueue: true, reason: null, cost, offerBypass };
}

/**
 * Replace faction research queue (planned tech ids, max 5).
 * Rejects techs without prerequisites / locks.
 * @returns {{ ok: boolean, error?: string, eco?: object }}
 */
export function setResearchQueue(factionId, queue) {
  const content = getContent();
  const techs = content.technologies || {};
  if (!Array.isArray(queue)) {
    return { ok: false, error: "queue must be an array of techId" };
  }
  if (queue.length > RESEARCH_QUEUE_MAX) {
    return { ok: false, error: `Очередь максимум ${RESEARCH_QUEUE_MAX}` };
  }

  const world = readLiveBoard();
  const ledger = readLedger();
  const eco = ensureFactionEco(ledger, factionId);
  const unlocked = new Set(eco.unlockedTechs || []);
  const seen = new Set();
  const clean = [];

  for (const raw of queue) {
    const techId = String(raw || "");
    if (!techId) continue;
    const def = resolveTechDef(content, techId);
    if (!def) {
      return { ok: false, error: `Неизвестная технология: ${techId}` };
    }
    if (unlocked.has(techId)) continue;
    if (seen.has(techId)) continue;
    const gate = canQueueTech(factionId, techId, {
      content,
      world,
      ledger,
      eco,
    });
    if (!gate.ok) {
      return {
        ok: false,
        error: `${def.name || techId}: ${gate.error}`,
      };
    }
    seen.add(techId);
    clean.push(techId);
  }

  eco.researchQueue = clean;
  writeLedger(ledger);
  return { ok: true, eco: publicEcoSlice(eco) };
}

/**
 * Accelerate a queued tech: pay 150% cognitio cost, unlock immediately.
 */
export function accelerateResearch(factionId, techId, meta = {}) {
  const content = getContent();
  const def = resolveTechDef(content, techId);
  if (!def) return { ok: false, error: "Неизвестная технология" };

  const world = meta.world ?? readLiveBoard();
  const ledger = readLedger();
  const eco = ensureFactionEco(ledger, factionId);

  if (!(eco.researchQueue || []).includes(techId)) {
    return { ok: false, error: "Технология не в очереди" };
  }

  const gate = canQueueTech(factionId, techId, {
    content,
    world,
    ledger,
    eco,
  });
  if (!gate.ok) return gate;

  const stack = researchStackForFaction(factionId, eco, content, world);
  const baseCost = applyResearchCostMult(def.cost, stack, def.category);
  const rushCost = {};
  for (const [cur, amt] of Object.entries(baseCost || {})) {
    rushCost[cur] = Math.ceil(Number(amt || 0) * 1.5);
  }
  const afford = canAfford(eco, rushCost);
  if (!afford.ok) return afford;

  const turn = meta.turn ?? null;
  for (const [cur, amt] of Object.entries(rushCost)) {
    const n = Number(amt || 0);
    if (!n) continue;
    adjustStock(ledger, factionId, cur, -n, {
      turn,
      reason: "research_rush",
      intentId: meta.intentId || techId,
    });
  }

  if (!Array.isArray(eco.unlockedTechs)) eco.unlockedTechs = [];
  eco.unlockedTechs.push(techId);
  applyUnlockEffects(eco, def.effects);
  removeFromResearchQueue(eco, techId);
  writeLedger(ledger);

  if (world) {
    applyUnitUpgradeEffectsToWorld(world, factionId, def.effects || []);
  }

  return {
    ok: true,
    tech: def,
    cost: rushCost,
    eco: publicEcoSlice(eco),
    worldMutated: Boolean(world && (def.effects || []).some((e) => e?.effect === "unit_upgrade")),
  };
}

/** Remove a techId from the queue if present (after manual or auto research). */
export function removeFromResearchQueue(eco, techId) {
  if (!Array.isArray(eco.researchQueue) || !techId) return;
  eco.researchQueue = eco.researchQueue.filter((id) => id !== techId);
}

/**
 * Build prerequisite path (root → target) with total cognitio cost of missing techs.
 * Applies research_cost_mult when eco / factionId / stack is provided.
 * @param {string} techId
 * @param {string[]} unlockedTechs
 * @param {object} content
 * @param {{ eco?: object, factionId?: string, world?: object, stack?: object }} [opts]
 */
export function researchPathTo(techId, unlockedTechs, content, opts = {}) {
  const safeContent = content || getContent();
  const unlocked = new Set(unlockedTechs || []);
  const path = [];
  const visiting = new Set();

  function walk(id) {
    if (!id || unlocked.has(id) || visiting.has(id)) return;
    const def = resolveTechDef(safeContent, id);
    if (!def) return;
    visiting.add(id);
    for (const pre of def.prerequisites || []) walk(pre);
    visiting.delete(id);
    if (!unlocked.has(id) && !path.includes(id)) path.push(id);
  }

  walk(techId);

  let stack = opts.stack || null;
  if (!stack && (opts.eco || opts.factionId)) {
    const factionId = opts.factionId || null;
    const world = opts.world ?? readLiveBoard();
    const eco =
      opts.eco ||
      (factionId ? ensureFactionEco(readLedger(), factionId) : null);
    if (factionId && eco) {
      stack = researchStackForFaction(factionId, eco, content || getContent(), world);
    }
  }

  let totalCognitio = 0;
  const steps = path.map((id) => {
    const def = resolveTechDef(safeContent, id);
    const rawCost = def?.cost || {};
    const adjusted = stack
      ? applyResearchCostMult(rawCost, stack, def?.category)
      : rawCost;
    const cost = Number(adjusted["currency.cognitio"] ?? 0);
    totalCognitio += cost;
    return {
      techId: id,
      name: def?.name || id,
      cost,
      category: def?.category,
      era: def?.era,
    };
  });
  return { steps, totalCognitio, missing: steps.length };
}
