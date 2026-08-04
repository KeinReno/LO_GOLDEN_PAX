/**
 * Technology research: spend Cognitio → unlock techs / upgrades / tiers / properties.
 */
import { getContent } from "./contentLoader.mjs";
import {
  readLedger,
  writeLedger,
  ensureFactionEco,
  adjustStock,
} from "./ledger.mjs";
import {
  buildModifierStack,
  resolvePlanetRaceComposition,
  collectRaceEffects,
} from "./modifierStack.mjs";
import { readLiveBoard } from "./tableStore.mjs";
import { applyUnitUpgradeEffectsToWorld } from "./combatResolve.mjs";
import { factionCanAccessTech } from "./techPool.mjs";
import {
  factionCanUseLineage,
  hybridLineageId,
  canHybridizePair,
} from "./hybridRegistry.mjs";

export const DEFAULT_TECH_TIERS = { A: 1, B: 1, C: 1, D: 1, E: 1, F: 1 };

const RACE_LOCK_MIN_SHARE = 30;

/** Early-game properties available without research (keep list small). */
const BASE_PROPERTIES = new Set([
  "strong",
  "malleable",
  "fuel",
  "energy",
  "toxic",
  "weapon",
]);

/**
 * @param {object} eco - faction economy ledger slice
 * @param {string} prop - property id from economy_schema
 */
export function factionHasProperty(eco, prop) {
  if (BASE_PROPERTIES.has(prop)) return true;
  return (eco?.unlockedProperties || []).includes(prop);
}

/**
 * Properties required to *construct* a building (construction slots only).
 * Upkeep slots are operational cost after build — not a build gate.
 * Properties the building itself unlocks via effects are excluded (no chicken-egg).
 */
function collectRequiredProperties(consumerDef) {
  const props = new Set();
  for (const slot of consumerDef?.slots || []) {
    for (const p of slot.require?.properties || []) props.add(p);
  }
  for (const e of consumerDef?.effects || []) {
    if (e.effect === "unlock_property" && e.args?.property) {
      props.delete(e.args.property);
    }
  }
  return props;
}

function propertyLabel(content, propId) {
  return content?.economy_schema?.properties?.[propId]?.label || propId;
}

function traitIdsOf(faction) {
  const out = [];
  for (const t of faction?.traits || []) {
    if (typeof t === "string") out.push(t);
    else if (t?.id) out.push(String(t.id));
  }
  return out;
}

/**
 * Weighted race share (%) across owned inhabited planets.
 */
export function factionRaceSharePercent(world, factionId, raceId) {
  if (!world || !raceId) return 0;
  const faction = (world.factions || []).find((f) => f.id === factionId) ?? null;
  let weighted = 0;
  let popSum = 0;
  for (const sys of world.systems || []) {
    if (sys.ownerFactionId !== factionId) continue;
    for (const p of sys.planets || []) {
      const pop = Number(p.population || 0);
      if (pop <= 0) continue;
      popSum += pop;
      const mix = resolvePlanetRaceComposition(p, faction);
      for (const share of mix) {
        if (share.raceId === raceId) {
          weighted += pop * ((share.percent ?? 0) / 100);
        }
      }
    }
  }
  if (popSum <= 0) return 0;
  return (weighted / popSum) * 100;
}

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
 * Non-unlock modifier effects from researched techs + upgrades (for ModifierStack).
 */
export function collectTechModifierEffects(eco, content) {
  const effects = [];
  const techs = content?.technologies || {};
  const unlockedUpgrades = new Set(eco?.unlockedUpgrades || []);

  for (const id of eco?.unlockedTechs || []) {
    const def = techs[id];
    if (!def) continue;
    for (const e of def.effects || []) {
      if (e.effect === "unlock_tech_tier" || e.effect === "unlock_property") {
        continue;
      }
      effects.push({
        ...e,
        source: { kind: "tech", id, label: def.name },
      });
    }
    for (const u of def.upgrades || []) {
      if (!unlockedUpgrades.has(u.id)) continue;
      for (const e of u.effects || []) {
        if (e.effect === "unlock_tech_tier" || e.effect === "unlock_property") {
          continue;
        }
        effects.push({
          ...e,
          source: { kind: "tech_upgrade", id: u.id, label: u.name },
        });
      }
    }
  }
  return effects;
}

/**
 * Research cost after research_cost_mult channels (category-specific then global).
 */
export function applyResearchCostMult(cost, stack, category) {
  const out = { ...(cost || {}) };
  const catCh = stack?.channels?.[`research:${category}`];
  const allCh = stack?.channels?.["research:*"];
  let mult = 1;
  if (catCh?.mult != null) mult *= catCh.mult;
  if (allCh?.mult != null) mult *= allCh.mult;
  if (mult === 1) return out;
  for (const [k, v] of Object.entries(out)) {
    out[k] = Math.max(1, Math.ceil(Number(v || 0) * mult));
  }
  return out;
}

function researchStackForFaction(factionId, eco, content, world) {
  const effects = collectTechModifierEffects(eco, content);
  const faction = (world?.factions || []).find((f) => f.id === factionId);
  const traitCatalog = content?.faction_traits?.traits || content?.faction_traits || {};
  for (const tid of traitIdsOf(faction)) {
    const def = traitCatalog[tid];
    if (!def) continue;
    for (const e of def.effects || []) {
      effects.push({
        ...e,
        source: { kind: "faction_trait", id: tid, label: def.name || tid },
      });
    }
  }
  // Active research_pact treaties — prefer unwrapped treaty_effect; skip duplicate direct mults
  for (const t of faction?.diplomacy?.treaties || []) {
    if (t.type !== "research_pact" && t.id !== "research_pact") continue;
    const unwrapped = [];
    const direct = [];
    for (const e of t.effects || []) {
      if (e.effect === "treaty_effect" && e.args?.effect) {
        unwrapped.push({
          effect: e.args.effect,
          args: e.args.args || {},
          source: {
            kind: "treaty",
            id: t.id || "research_pact",
            label: "Научный пакт",
          },
        });
      } else {
        direct.push({
          ...e,
          source: {
            kind: "treaty",
            id: t.id || "research_pact",
            label: "Научный пакт",
          },
        });
      }
    }
    effects.push(...(unwrapped.length ? unwrapped : direct));
  }

  // Race research_cost_mult from owned colony populations
  if (world && content?.races) {
    for (const sys of world.systems || []) {
      if (sys.ownerFactionId !== factionId) continue;
      for (const p of sys.planets || []) {
        if ((p.population ?? 0) <= 0) continue;
        const composition = p.raceComposition || [];
        for (const e of collectRaceEffects(content.races, composition, {
          factionId,
          turn: world.meta?.turn ?? 0,
        })) {
          if (e.effect === "research_cost_mult") effects.push(e);
        }
      }
    }
  }

  return buildModifierStack(effects, {
    mergeOrder: content?.rules?.economyMergeOrder,
  });
}

function checkTechLocks(def, factionId, eco, content, world) {
  const pool = factionCanAccessTech(def, factionId, eco, content, world);
  if (!pool.ok) return pool;

  if (def.raceLock) {
    const share = factionRaceSharePercent(world, factionId, def.raceLock);
    if (share < RACE_LOCK_MIN_SHARE) {
      const raceName = content?.races?.[def.raceLock]?.name || def.raceLock;
      return {
        ok: false,
        error: `Нужно ≥${RACE_LOCK_MIN_SHARE}% населения расы «${raceName}» (сейчас ${Math.floor(share)}%)`,
      };
    }
  }

  if (def.factionTraitLock) {
    const faction = (world?.factions || []).find((f) => f.id === factionId);
    if (!traitIdsOf(faction).includes(def.factionTraitLock)) {
      const traitName =
        content?.faction_traits?.traits?.[def.factionTraitLock]?.name ||
        content?.faction_traits?.[def.factionTraitLock]?.name ||
        def.factionTraitLock;
      return {
        ok: false,
        error: `Нужна черта державы: ${traitName}`,
      };
    }
  }

  const reqProps = def.requireProperties || [];
  for (const prop of reqProps) {
    if (!factionHasProperty(eco, prop)) {
      return {
        ok: false,
        error: `Нужно свойство: ${propertyLabel(content, prop)}`,
      };
    }
  }

  if (Array.isArray(def.hybridOf) && def.hybridOf.length === 2) {
    const pair = canHybridizePair(content, def.hybridOf[0], def.hybridOf[1]);
    if (!pair.ok) return pair;
    const lineageId =
      def.requiresLineage || pair.lineageId || hybridLineageId(def.hybridOf[0], def.hybridOf[1]);
    const line = factionCanUseLineage(world, factionId, lineageId, eco, content);
    if (!line.ok) {
      return {
        ok: false,
        error: `Нужен гибридный линейдж: ${line.error}`,
      };
    }
  } else if (def.requiresLineage) {
    const line = factionCanUseLineage(
      world,
      factionId,
      def.requiresLineage,
      eco,
      content,
    );
    if (!line.ok) {
      return {
        ok: false,
        error: `Нужен линейдж «${def.requiresLineage}»: ${line.error}`,
      };
    }
  }

  return { ok: true };
}
/**
 * Apply unlock effects from a tech (or building) onto faction eco (mutates).
 */
export function applyUnlockEffects(eco, effects) {
  if (!eco.techTiers) eco.techTiers = { ...DEFAULT_TECH_TIERS };
  if (!Array.isArray(eco.unlockedProperties)) eco.unlockedProperties = [];
  for (const e of effects || []) {
    if (e.effect === "unlock_tech_tier") {
      const cat = e.args?.category;
      const to = Number(e.args?.to);
      if (!cat || !Number.isFinite(to)) continue;
      const cur = Number(eco.techTiers[cat] ?? 1);
      if (to > cur) eco.techTiers[cat] = to;
    } else if (e.effect === "unlock_property") {
      const prop = e.args?.property;
      if (prop && !eco.unlockedProperties.includes(prop)) {
        eco.unlockedProperties.push(prop);
      }
    }
  }
}

/**
 * Recompute techTiers / properties from unlockedTechs + upgrades (idempotent).
 */
export function recomputeUnlocksFromTechs(eco, content) {
  eco.techTiers = { ...DEFAULT_TECH_TIERS };
  eco.unlockedProperties = [];
  const techs = content?.technologies || {};
  const unlockedUpgrades = new Set(eco.unlockedUpgrades || []);
  for (const id of eco.unlockedTechs || []) {
    const def = techs[id];
    if (def) applyUnlockEffects(eco, def.effects);
    for (const u of def?.upgrades || []) {
      if (unlockedUpgrades.has(u.id)) applyUnlockEffects(eco, u.effects);
    }
  }
}

function canAfford(eco, cost) {
  for (const [cur, amt] of Object.entries(cost || {})) {
    if ((eco.stocks?.[cur] ?? 0) < Number(amt || 0)) {
      return { ok: false, error: `Не хватает ${cur} (нужно ${amt})` };
    }
  }
  return { ok: true };
}

export const RESEARCH_QUEUE_MAX = 5;

function publicEcoSlice(eco) {
  return {
    unlockedTechs: [...(eco.unlockedTechs || [])],
    unlockedUpgrades: [...(eco.unlockedUpgrades || [])],
    techTiers: { ...eco.techTiers },
    unlockedProperties: [...(eco.unlockedProperties || [])],
    stocks: { ...eco.stocks },
    researchQueue: [...(eco.researchQueue || [])],
  };
}

/**
 * Can this tech be placed in the research queue?
 * Requires prerequisites + race/trait locks. Does NOT require current cognitio.
 */
export function canQueueTech(factionId, techId, opts = {}) {
  const content = opts.content || getContent();
  const def = content.technologies?.[techId];
  if (!def) return { ok: false, error: "Неизвестная технология", canQueue: false };

  const world = opts.world ?? readLiveBoard();
  const ledger = opts.ledger || readLedger();
  const eco = opts.eco || ensureFactionEco(ledger, factionId);

  if ((eco.unlockedTechs || []).includes(techId)) {
    return { ok: false, error: "Уже исследовано", canQueue: false };
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

  return { ok: true, canQueue: true, def };
}

/**
 * Three-level availability for UI: available / canQueue / blocked.
 */
export function techAvailability(factionId, techId, opts = {}) {
  const content = opts.content || getContent();
  const def = content.technologies?.[techId];
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
  const cost = applyResearchCostMult(def.cost, stack, def.category);
  const afford = canAfford(eco, cost);
  if (!afford.ok) {
    return {
      available: false,
      canQueue: true,
      reason: afford.error || "Мало ресурсов",
      cost,
    };
  }
  return { available: true, canQueue: true, reason: null, cost };
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
    if (!techs[techId]) {
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
        error: `${techs[techId].name || techId}: ${gate.error}`,
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
  const def = content.technologies?.[techId];
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
  const techs = content?.technologies || getContent().technologies || {};
  const unlocked = new Set(unlockedTechs || []);
  const path = [];
  const visiting = new Set();

  function walk(id) {
    if (!id || unlocked.has(id) || visiting.has(id)) return;
    const def = techs[id];
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
    const def = techs[id];
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

/**
 * Research a technology for a faction.
 * @returns {{ ok: boolean, error?: string, eco?: object, tech?: object }}
 */
export function researchTech(factionId, techId, meta = {}) {
  const content = getContent();
  const def = content.technologies?.[techId];
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

  const stack = researchStackForFaction(factionId, eco, content, world);
  const cost = applyResearchCostMult(def.cost, stack, def.category);
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
  writeLedger(ledger);

  if (world) {
    applyUnitUpgradeEffectsToWorld(world, factionId, def.effects || [], content);
  }

  return {
    ok: true,
    eco: publicEcoSlice(eco),
    tech: def,
    worldMutated: Boolean(world && (def.effects || []).some((e) => e?.effect === "unit_upgrade")),
  };
}

/**
 * Research an upgrade on an already-unlocked tech.
 */
export function researchUpgrade(factionId, techId, upgradeId, meta = {}) {
  const content = meta.content || getContent();
  const def = content.technologies?.[techId];
  if (!def) return { ok: false, error: "Неизвестная технология" };

  const upgrade = findUpgrade(def, upgradeId);
  if (!upgrade) {
    // allow lookup by upgradeId alone
    const found = findUpgradeAcrossTechs(content, upgradeId);
    if (!found || found.tech.id !== techId) {
      return { ok: false, error: "Неизвестный апгрейд" };
    }
  }
  const up = upgrade || findUpgrade(def, upgradeId);

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

/**
 * Max usable tier for a category given faction eco (default 1).
 */
export function factionMaxTier(eco, category) {
  if (!eco?.techTiers) return 1;
  return Number(eco.techTiers[category] ?? 1);
}

/**
 * Whether a building is allowed by current tech tiers and unlocked properties.
 */
export function canBuildWithTech(eco, buildingDef) {
  if (buildingDef?.category) {
    const need = Number(buildingDef.tier) || 1;
    // Buildings up to tier+2 of unlock are craftable (unlock raises ceiling; base allows T1–T3 early)
    const max = Math.max(3, factionMaxTier(eco, buildingDef.category) + 1);
    if (need > max) {
      return {
        ok: false,
        error: `Нужен tier ${buildingDef.category}≥${need - 1} (сейчас ${factionMaxTier(eco, buildingDef.category)})`,
      };
    }
  }

  const required = collectRequiredProperties(buildingDef);
  if (required.size === 0) return { ok: true };

  const content = getContent();
  for (const prop of required) {
    if (!factionHasProperty(eco, prop)) {
      return {
        ok: false,
        error: `Нужно свойство: ${propertyLabel(content, prop)}`,
      };
    }
  }
  return { ok: true };
}
