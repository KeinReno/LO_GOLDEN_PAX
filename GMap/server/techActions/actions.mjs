/**
 * Research-mutating actions: research a tech, reroll an offer, upgrade a
 * grade, fill a socket, GM-grant, research an upgrade.
 * Extracted from ../techActions.mjs.
 */
import { getContent } from "../contentLoader.mjs";
import { readLedger, writeLedger, ensureFactionEco, adjustStock } from "../ledger.mjs";
import { readLiveBoard } from "../tableStore.mjs";
import { applyUnitUpgradeEffectsToWorld } from "../combatResolve.mjs";
import { applyPathResearchAffinity, checkPathGate } from "../techPaths.mjs";
import {
  applyOfferBypass,
  ensureOffers,
  regenerateAxisOffer,
  rerollOffer,
  techInOffer,
  techOfferAxis,
} from "../techOffers.mjs";
import { prepareGradeUpgrade } from "../techGrades.mjs";
import { prepareSocketFill } from "../techSockets.mjs";
import { normalizeOfferAxis } from "../techDirections.mjs";
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
import { removeFromResearchQueue } from "./queue.mjs";

function findUpgrade(techDef, upgradeId) {
  return (techDef?.upgrades || []).find((u) => u.id === upgradeId) || null;
}

function findUpgradeAcrossTechs(content, upgradeId) {
  for (const tech of Object.values(content?.technologies || {})) {
    const u = findUpgrade(tech, upgradeId);
    if (u) return { tech, upgrade: u };
  }
  return null;
}

/**
 * Research a technology for a faction.
 * @returns {{ ok: boolean, error?: string, eco?: object, tech?: object }}
 */
export function researchTech(factionId, techId, meta = {}) {
  const content = getContent();
  const def = resolveTechDef(content, techId);
  if (!def) return { ok: false, error: "Неизвестная технология" };

  const world = meta.world ?? readLiveBoard();
  const ledger = readLedger();
  const eco = ensureFactionEco(ledger, factionId);

  if ((eco.unlockedTechs || []).includes(techId)) {
    return { ok: false, error: "Уже исследовано" };
  }

  for (const pre of def.prerequisites || []) {
    if (!(eco.unlockedTechs || []).includes(pre)) {
      const preName = content.technologies?.[pre]?.name || pre;
      return { ok: false, error: `Нужна технология: ${preName}` };
    }
  }

  const lock = checkTechLocks(def, factionId, eco, content, world);
  if (!lock.ok) return lock;

  const pathGate = checkPathGate(def, eco, content);
  if (!pathGate.ok) return pathGate;

  const stack = researchStackForFaction(factionId, eco, content, world);
  let cost = applyResearchCostMult(def.cost, stack, def.category);
  const faction = (world?.factions || []).find((f) => f.id === factionId);
  cost = applyPathResearchAffinity(cost, def, faction, content).cost;
  const axis = techOfferAxis(def);
  const opts = offerOpts(factionId, eco, content, world);
  if (axis) ensureOffers(eco, content, opts);
  const offerBypass = Boolean(axis) && !techInOffer(eco, techId, axis);
  cost = applyOfferBypass(cost, offerBypass);
  const afford = canAfford(eco, cost);
  if (!afford.ok) return afford;

  const turn = meta.turn ?? null;
  for (const [cur, amt] of Object.entries(cost || {})) {
    const n = Number(amt || 0);
    if (!n) continue;
    adjustStock(ledger, factionId, cur, -n, {
      turn,
      reason: "research",
      intentId: meta.intentId || techId,
    });
  }

  if (!Array.isArray(eco.unlockedTechs)) eco.unlockedTechs = [];
  eco.unlockedTechs.push(techId);
  applyUnlockEffects(eco, def.effects);
  removeFromResearchQueue(eco, techId);
  if (axis) regenerateAxisOffer(eco, content, axis, opts);
  writeLedger(ledger);

  if (world) {
    applyUnitUpgradeEffectsToWorld(world, factionId, def.effects || [], content);
  }

  return {
    ok: true,
    eco: publicEcoSlice(eco),
    tech: def,
    offerBypass,
    worldMutated: Boolean(world && (def.effects || []).some((e) => e?.effect === "unit_upgrade")),
  };
}

/**
 * One reroll per direction offer generation. Regenerates 3 frontier candidates.
 * `axis` is a direction id; legacy A–F maps to Industry.
 */
export function rerollResearchOffer(factionId, axis, meta = {}) {
  const content = getContent();
  const world = meta.world ?? readLiveBoard();
  const ledger = readLedger();
  const eco = ensureFactionEco(ledger, factionId);
  const opts = offerOpts(factionId, eco, content, world, { rng: meta.rng });
  const result = rerollOffer(eco, content, axis, opts);
  if (!result.ok) return result;
  writeLedger(ledger);
  const dir = normalizeOfferAxis(axis, content) || axis;
  return { ok: true, eco: publicEcoSlice(eco), offer: eco.currentOffers?.[dir] };
}

/**
 * Instant grade step 1→5 for a researched gradeable tech.
 */
export function upgradeResearchedTechGrade(factionId, techId, meta = {}) {
  const content = meta.content || getContent();
  const ledger = readLedger();
  const eco = ensureFactionEco(ledger, factionId);
  const prepared = prepareGradeUpgrade(eco, techId, content);
  if (!prepared.ok) return prepared;
  const afford = canAfford(eco, prepared.cost);
  if (!afford.ok) return afford;
  const turn = meta.turn ?? null;
  for (const [cur, amt] of Object.entries(prepared.cost || {})) {
    const n = Number(amt || 0);
    if (!n) continue;
    adjustStock(ledger, factionId, cur, -n, {
      turn,
      reason: "upgrade_tech_grade",
      intentId: meta.intentId || techId,
    });
  }
  eco.techGrades = prepared.techGrades;
  writeLedger(ledger);
  return { ok: true, eco: publicEcoSlice(eco), grade: prepared.nextGrade, techId };
}

/**
 * Instant fill/swap of a researched tech's resource socket (empire-wide).
 */
export function fillResearchedTechSocket(factionId, techId, resourceId, meta = {}) {
  const content = meta.content || getContent();
  const ledger = readLedger();
  const eco = ensureFactionEco(ledger, factionId);
  const prepared = prepareSocketFill(eco, techId, resourceId, content);
  if (!prepared.ok) return prepared;
  const afford = canAfford(eco, prepared.cost);
  if (!afford.ok) return afford;
  const turn = meta.turn ?? null;
  for (const [cur, amt] of Object.entries(prepared.cost || {})) {
    const n = Number(amt || 0);
    if (!n) continue;
    adjustStock(ledger, factionId, cur, -n, {
      turn,
      reason: "fill_tech_socket",
      intentId: meta.intentId || techId,
    });
  }
  eco.techSockets = prepared.techSockets;
  writeLedger(ledger);
  return {
    ok: true,
    eco: publicEcoSlice(eco),
    techId,
    resourceId: prepared.resourceId,
  };
}

/**
 * Master-only: unlock tech without cost / lock / prerequisite checks.
 */
export function gmGrantTech(factionId, techId, meta = {}) {
  const content = getContent();
  const def = resolveTechDef(content, techId);
  if (!def) return { ok: false, error: "Неизвестная технология" };

  const world = meta.world ?? readLiveBoard();
  const ledger = readLedger();
  const eco = ensureFactionEco(ledger, factionId);

  if ((eco.unlockedTechs || []).includes(techId)) {
    return { ok: false, error: "Уже исследовано" };
  }

  if (!Array.isArray(eco.unlockedTechs)) eco.unlockedTechs = [];
  eco.unlockedTechs.push(techId);
  applyUnlockEffects(eco, def.effects);
  removeFromResearchQueue(eco, techId);
  writeLedger(ledger);

  if (world) {
    applyUnitUpgradeEffectsToWorld(world, factionId, def.effects || [], content);
  }

  return {
    ok: true,
    eco: publicEcoSlice(eco),
    tech: def,
    worldMutated: Boolean(
      world && (def.effects || []).some((e) => e?.effect === "unit_upgrade"),
    ),
  };
}

/**
 * Research an upgrade on an already-unlocked tech.
 */
export function researchUpgrade(factionId, techId, upgradeId, meta = {}) {
  const content = meta.content || getContent();
  const def = resolveTechDef(content, techId);
  if (!def) return { ok: false, error: "Неизвестная технология" };

  let up = findUpgrade(def, upgradeId);
  if (!up) {
    // allow lookup by upgradeId alone
    const found = findUpgradeAcrossTechs(content, upgradeId);
    if (!found || found.tech.id !== techId) {
      return { ok: false, error: "Неизвестный апгрейд" };
    }
    up = found.upgrade;
  }

  const world = meta.world ?? readLiveBoard();
  const ledger = readLedger();
  const eco = ensureFactionEco(ledger, factionId);

  if (!(eco.unlockedTechs || []).includes(techId)) {
    return { ok: false, error: "Сначала изучите базовую технологию" };
  }

  if (!Array.isArray(eco.unlockedUpgrades)) eco.unlockedUpgrades = [];
  if (eco.unlockedUpgrades.includes(up.id)) {
    return { ok: false, error: "Апгрейд уже изучен" };
  }

  for (const pre of up.prerequisites || []) {
    const preOk =
      (eco.unlockedTechs || []).includes(pre) ||
      eco.unlockedUpgrades.includes(pre);
    if (!preOk) {
      return { ok: false, error: `Нужен пререквизит: ${pre}` };
    }
  }

  const stack = researchStackForFaction(factionId, eco, content, world);
  const cost = applyResearchCostMult(up.cost, stack, def.category);
  const afford = canAfford(eco, cost);
  if (!afford.ok) return afford;

  const turn = meta.turn ?? null;
  for (const [cur, amt] of Object.entries(cost || {})) {
    const n = Number(amt || 0);
    if (!n) continue;
    adjustStock(ledger, factionId, cur, -n, {
      turn,
      reason: "research_upgrade",
      intentId: meta.intentId || up.id,
    });
  }

  eco.unlockedUpgrades.push(up.id);
  applyUnlockEffects(eco, up.effects);
  if (world) {
    applyUnitUpgradeEffectsToWorld(world, factionId, up.effects, content);
  }
  writeLedger(ledger);

  return {
    ok: true,
    eco: publicEcoSlice(eco),
    upgrade: up,
    tech: def,
    worldMutated: Boolean(world && (up.effects || []).some((e) => e?.effect === "unit_upgrade")),
  };
}
