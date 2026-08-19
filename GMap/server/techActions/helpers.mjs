/**
 * Tech-research shared helpers: def resolution, property/lock gates,
 * cost math, modifier stack. Extracted from ../techActions.mjs.
 */
import { getContent } from "../contentLoader.mjs";
import {
  buildModifierStack,
  resolvePlanetRaceComposition,
  collectRaceEffects,
} from "../modifierStack.mjs";
import { factionCanAccessTech } from "../techPool.mjs";
import {
  factionCanUseLineage,
  hybridLineageId,
  canHybridizePair,
} from "../hybridRegistry.mjs";
import { collectTechModifierEffects } from "../techGrades.mjs";
import { applyOpenPathEffect } from "../techPaths.mjs";
import { resolveVariant } from "../variantResolver.mjs";

export { collectTechModifierEffects };

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

/** Resolve tech from live tree or alchemy combos. */
export function resolveTechDef(content, techId) {
  if (!techId) return null;
  return (
    content?.technologies?.[techId] ||
    content?.tech_combos?.[techId] ||
    null
  );
}

/** Offers/tick/unlocks: stubs stay out of the live table. */
export function isLiveResearchDef(def) {
  return Boolean(def) && !def.catalogPending;
}

/**
 * Drop catalogPending / missing ids from unlockedTechs and related bags.
 * Mutates eco. Returns dropped ids (empty if already clean).
 */
export function pruneNonLiveUnlockedTechs(eco, content) {
  const before = Array.isArray(eco?.unlockedTechs) ? eco.unlockedTechs : [];
  const keep = [];
  const dropped = [];
  for (const id of before) {
    if (isLiveResearchDef(resolveTechDef(content, id))) keep.push(id);
    else dropped.push(id);
  }
  if (!dropped.length) return dropped;
  eco.unlockedTechs = keep;
  const drop = new Set(dropped);
  if (Array.isArray(eco.unlockedUpgrades)) {
    eco.unlockedUpgrades = eco.unlockedUpgrades.filter((u) => {
      const sid = String(u || "");
      return ![...drop].some((id) => sid === id || sid.startsWith(`${id}.`));
    });
  }
  if (eco.techGrades && typeof eco.techGrades === "object") {
    for (const id of drop) delete eco.techGrades[id];
  }
  if (eco.techSockets && typeof eco.techSockets === "object") {
    for (const id of drop) delete eco.techSockets[id];
  }
  if (Array.isArray(eco.researchQueue)) {
    eco.researchQueue = eco.researchQueue.filter((row) => {
      const tid = typeof row === "string" ? row : row?.techId;
      return !drop.has(tid);
    });
  }
  if (Array.isArray(eco.acquiredTechs)) {
    eco.acquiredTechs = eco.acquiredTechs.filter((row) => {
      const tid = typeof row === "string" ? row : row?.techId;
      return !drop.has(tid);
    });
  }
  return dropped;
}

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
 * `fillOnly` slots are outfit/deposit matching after the building exists.
 * Properties the building itself unlocks via effects are excluded (no chicken-egg).
 */
export function collectRequiredProperties(consumerDef) {
  const props = new Set();
  for (const p of consumerDef?.requireProperties || []) props.add(p);
  for (const slot of consumerDef?.slots || []) {
    if (slot.fillOnly) continue;
    for (const p of slot.require?.properties || []) props.add(p);
  }
  for (const e of [
    ...(consumerDef?.effects || []),
    ...(consumerDef?.extra_effects || []),
  ]) {
    if (e.effect === "unlock_property" && e.args?.property) {
      props.delete(e.args.property);
    }
  }
  return props;
}

/** Tier / property unlocks granted by completing a building. */
export function collectBuildingUnlockEffects(def) {
  return [...(def?.effects || []), ...(def?.extra_effects || [])].filter(
    (e) => e.effect === "unlock_tech_tier" || e.effect === "unlock_property",
  );
}

export function propertyLabel(content, propId) {
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
    const val = Number(v || 0);
    if (val > 0) {
      out[k] = Math.max(1, Math.ceil(val * mult));
    }
  }
  return out;
}

export function researchStackForFaction(factionId, eco, content, world) {
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

export function checkTechLocks(def, factionId, eco, content, world) {
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
  if (!Array.isArray(eco.openPaths)) eco.openPaths = [];
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
    } else if (e.effect === "open_path") {
      applyOpenPathEffect(eco, e.args?.pathId);
    }
  }
}

/**
 * Remove one unlocked tech and related bags. Does not recompute tiers.
 * @returns {boolean} true if the tech was present
 */
export function stripTechFromEco(eco, techId) {
  const id = String(techId || "").trim();
  if (!id || !eco) return false;
  const before = Array.isArray(eco.unlockedTechs) ? eco.unlockedTechs : [];
  if (!before.includes(id)) return false;
  eco.unlockedTechs = before.filter((t) => t !== id);
  if (Array.isArray(eco.unlockedUpgrades)) {
    eco.unlockedUpgrades = eco.unlockedUpgrades.filter((u) => {
      const sid = String(u || "");
      return sid !== id && !sid.startsWith(`${id}.`);
    });
  }
  if (eco.techGrades && typeof eco.techGrades === "object") {
    delete eco.techGrades[id];
  }
  if (eco.techSockets && typeof eco.techSockets === "object") {
    delete eco.techSockets[id];
  }
  if (Array.isArray(eco.researchQueue)) {
    eco.researchQueue = eco.researchQueue.filter((row) => {
      const tid = typeof row === "string" ? row : row?.techId;
      return tid !== id;
    });
  }
  if (Array.isArray(eco.acquiredTechs)) {
    eco.acquiredTechs = eco.acquiredTechs.filter((row) => {
      const tid = typeof row === "string" ? row : row?.techId;
      return tid !== id;
    });
  }
  return true;
}

/**
 * Recompute techTiers / properties from unlockedTechs + upgrades + standing buildings.
 */
export function recomputeUnlocksFromTechs(eco, content, factionId = null, world = null) {
  pruneNonLiveUnlockedTechs(eco, content);
  eco.techTiers = { ...DEFAULT_TECH_TIERS };
  eco.unlockedProperties = [];
  eco.openPaths = [];
  const unlockedUpgrades = new Set(eco.unlockedUpgrades || []);

  for (const id of eco.unlockedTechs || []) {
    const def = resolveTechDef(content, id);
    if (!isLiveResearchDef(def)) continue;
    applyUnlockEffects(eco, def.effects);
    for (const u of def?.upgrades || []) {
      if (unlockedUpgrades.has(u.id)) applyUnlockEffects(eco, u.effects);
    }
  }

  if (factionId && world) {
    const faction = (world.factions || []).find((f) => f.id === factionId);
    if (faction) {
      const traitCatalog = content?.faction_traits?.traits || content?.faction_traits || {};
      for (const tid of traitIdsOf(faction)) {
        const def = traitCatalog[tid];
        if (def) applyUnlockEffects(eco, def.effects);
      }
    }
    applyBuildingUnlocksFromWorld(eco, world, factionId, content);
  }
}

function applyBuildingUnlocksFromWorld(eco, world, factionId, content) {
  const pack = content || getContent();
  for (const sys of world.systems || []) {
    for (const p of sys.planets || []) {
      const owner = p.ownerFactionId || sys.ownerFactionId;
      if (owner !== factionId) continue;
      for (const inst of [
        ...(p.surfaceBuildings || []),
        ...(p.orbitalBuildings || []),
      ]) {
        if (inst?.disabled) continue;
        const id = inst.buildingId || inst.baseBuildingId || inst.id;
        if (!id || typeof id !== "string") continue;
        const resolved = resolveVariant("buildings", id, pack, {
          composition: p.raceComposition || [],
        });
        const def = resolved?.def || pack.buildings?.[id];
        if (!def) continue;
        applyUnlockEffects(eco, collectBuildingUnlockEffects(def));
      }
    }
  }
}

export function canAfford(eco, cost) {
  for (const [cur, amt] of Object.entries(cost || {})) {
    const numAmt = Number(amt || 0);
    if (numAmt < 0) return { ok: false, error: "Отрицательная стоимость недопустима" };
    if ((eco.stocks?.[cur] ?? 0) < numAmt) {
      return { ok: false, error: `Не хватает ${cur} (нужно ${numAmt})` };
    }
  }
  return { ok: true };
}

export function publicEcoSlice(eco) {
  return {
    unlockedTechs: [...(eco.unlockedTechs || [])],
    unlockedUpgrades: [...(eco.unlockedUpgrades || [])],
    techGrades: eco.techGrades && typeof eco.techGrades === "object" ? { ...eco.techGrades } : {},
    techSockets: eco.techSockets && typeof eco.techSockets === "object" ? { ...eco.techSockets } : {},
    techTiers: { ...eco.techTiers },
    unlockedProperties: [...(eco.unlockedProperties || [])],
    stocks: { ...eco.stocks },
    researchQueue: [...(eco.researchQueue || [])],
    currentOffers: eco.currentOffers && typeof eco.currentOffers === "object"
      ? { ...eco.currentOffers }
      : {},
  };
}

export function offerOpts(factionId, eco, content, world, extra = {}) {
  const faction = (world?.factions || []).find((f) => f.id === factionId);
  return {
    faction,
    isEligible: (def) =>
      checkTechLocks(def, factionId, eco, content, world).ok,
    ...extra,
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

  const milestoneRole = buildingDef?.requireRoleMilestone;
  if (typeof milestoneRole === "string" && milestoneRole.trim()) {
    const content = getContent();
    const roleId = milestoneRole.trim();
    const ms = content?.role_milestones?.[roleId];
    const need =
      Number(ms?.threshold) ||
      Number(content?.economy_schema?.role_score_pilot?.thresholds?.[roleId]) ||
      0;
    const score = Number(eco?.roleScores?.[roleId]) || 0;
    if (need > 0 && score < need) {
      const label = ms?.label || roleId;
      return {
        ok: false,
        error: `Нужен RoleScore «${label}»: ${score}/${need}`,
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
