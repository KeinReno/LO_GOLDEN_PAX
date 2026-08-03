/**
 * Technology research: spend Cognitio → unlock techs / tiers / properties.
 */
import { getContent } from "./contentLoader.mjs";
import {
  readLedger,
  writeLedger,
  ensureFactionEco,
  adjustStock,
} from "./ledger.mjs";

export const DEFAULT_TECH_TIERS = { A: 1, B: 1, C: 1, D: 1, E: 1, F: 1 };

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
 * Recompute techTiers / properties from unlockedTechs list (idempotent).
 */
export function recomputeUnlocksFromTechs(eco, content) {
  eco.techTiers = { ...DEFAULT_TECH_TIERS };
  eco.unlockedProperties = [];
  const techs = content?.technologies || {};
  for (const id of eco.unlockedTechs || []) {
    const def = techs[id];
    if (def) applyUnlockEffects(eco, def.effects);
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

/**
 * Research a technology for a faction.
 * @returns {{ ok: boolean, error?: string, eco?: object, tech?: object }}
 */
export function researchTech(factionId, techId, meta = {}) {
  const content = getContent();
  const def = content.technologies?.[techId];
  if (!def) return { ok: false, error: "Неизвестная технология" };

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

  const afford = canAfford(eco, def.cost);
  if (!afford.ok) return afford;

  const turn = meta.turn ?? null;
  for (const [cur, amt] of Object.entries(def.cost || {})) {
    const n = Number(amt || 0);
    if (!n) continue;
    adjustStock(ledger, factionId, cur, -n, {
      turn,
      reason: "research",
      intentId: techId,
    });
  }

  if (!Array.isArray(eco.unlockedTechs)) eco.unlockedTechs = [];
  eco.unlockedTechs.push(techId);
  applyUnlockEffects(eco, def.effects);
  writeLedger(ledger);

  return {
    ok: true,
    eco: {
      unlockedTechs: [...eco.unlockedTechs],
      techTiers: { ...eco.techTiers },
      unlockedProperties: [...(eco.unlockedProperties || [])],
      stocks: { ...eco.stocks },
    },
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
