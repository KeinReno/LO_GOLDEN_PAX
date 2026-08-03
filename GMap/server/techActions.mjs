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
} from "./modifierStack.mjs";
import { readLiveBoard } from "./tableStore.mjs";
import { applyUnitUpgradeEffectsToWorld } from "./combatResolve.mjs";

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
  // Active research_pact treaties (stored on faction.diplomacy or world treaties)
  for (const t of faction?.diplomacy?.treaties || []) {
    if (t.type !== "research_pact" && t.id !== "research_pact") continue;
    for (const e of t.effects || []) {
      if (e.effect === "treaty_effect" && e.args?.effect) {
        effects.push({
          effect: e.args.effect,
          args: e.args.args || {},
          source: {
            kind: "treaty",
            id: t.id || "research_pact",
            label: "Научный пакт",
          },
        });
      } else {
        effects.push({
          ...e,
          source: {
            kind: "treaty",
            id: t.id || "research_pact",
            label: "Научный пакт",
          },
        });
      }
    }
  }
  return buildModifierStack(effects, {
    mergeOrder: content?.rules?.economyMergeOrder,
  });
}

function checkTechLocks(def, factionId, eco, content, world) {
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

function publicEcoSlice(eco) {
  return {
    unlockedTechs: [...(eco.unlockedTechs || [])],
    unlockedUpgrades: [...(eco.unlockedUpgrades || [])],
    techTiers: { ...eco.techTiers },
    unlockedProperties: [...(eco.unlockedProperties || [])],
    stocks: { ...eco.stocks },
  };
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
  writeLedger(ledger);

  return {
    ok: true,
    eco: publicEcoSlice(eco),
    tech: def,
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
