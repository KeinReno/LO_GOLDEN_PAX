/**
 * Slot resolver: matches consumer slots (buildings/units/techs) to resources
 * from the economy matrix by properties/category/tier.
 *
 * Core of the new economy model. Pure functions, no side effects.
 *
 * Bottleneck rule: effective tier of a slot = min(tier of all matched resources).
 * Stacking one high-tier resource is useless if a low-tier one is also slotted.
 */
import { getContent } from "./contentLoader.mjs";

/**
 * @typedef {Object} Slot
 * @property {string} role - e.g. "hull", "weapon", "shield", "structure", "crew", "tactic"
 * @property {Object} require - { category?, tier?, properties? }
 * @property {number} count - how many resource units fill this slot
 */

/**
 * @typedef {Object} SlottedResource
 * @property {string} resourceId - map.<key>
 * @property {string} name
 * @property {string} category
 * @property {number} tier
 * @property {string[]} properties
 */

/**
 * Check if a resource satisfies a slot's require spec.
 * @param {Object} resource - from map_resources
 * @param {Object} require - { category?, tier?, properties? }
 * @returns {boolean}
 */
export function isCraftedModule(resource) {
  const id = resource?.id || resource?.resourceId || "";
  return resource?.kind === "module" || String(id).startsWith("module.");
}

export function isMapDeposit(resource) {
  if (!resource) return false;
  if (resource.notDeposit) return false;
  if (resource.category === null) return false;
  return !isCraftedModule(resource);
}

const STUB_DEPOSIT_IDS = new Set([
  "map.energy",
  "map.buildplex",
  "map.trade_value",
  "map.alloys",
]);

export function isPaintDeposit(resource) {
  if (!isMapDeposit(resource)) return false;
  if (resource.stub) return false;
  const id = resource.id || resource.resourceId || "";
  return !STUB_DEPOSIT_IDS.has(id);
}

export function resourceMatchesRequire(resource, require) {
  if (!require) return true;
  // Crafted modules never fill building/ore slots (no theater on the require).
  if (isCraftedModule(resource) && !require.theater) return false;
  if (require.theater && (resource.theater || "") !== require.theater) return false;
  if (require.category && (resource.category || "") !== require.category) return false;
  if (require.properties && require.properties.length > 0) {
    const have = resource.properties || [];
    for (const p of require.properties) {
      if (!have.includes(p)) return false;
    }
  }
  if (require.tier != null) {
    const rt = Number(resource.tier);
    if (rt == null || Number.isNaN(rt)) return false;
    const spec = String(require.tier);
    const m = spec.match(/^(>=|<=|>|<|=)?\s*(\d+)$/);
    if (m) {
      const op = m[1] || ">=";
      const n = Number(m[2]);
      if (op === ">=" && !(rt >= n)) return false;
      if (op === "<=" && !(rt <= n)) return false;
      if (op === ">" && !(rt > n)) return false;
      if (op === "<" && !(rt < n)) return false;
      if (op === "=" && !(rt === n)) return false;
    }
  }
  return true;
}

/**
 * All resources that satisfy a require spec, grouped by category/tier.
 * @param {Object} [content] - cached content (defaults to getContent())
 * @returns {Object} { byCategory: {A: [...], B: [...]}, byTier: {1: [...], ...}, all: [...] }
 */
export function buildResourceIndex(content) {
  const c = content || getContent();
  const all = [];
  const byCategory = {};
  const byCategoryDeposits = {};
  const byTier = {};
  for (const bag of [c.map_resources, c.modules]) {
    for (const [id, def] of Object.entries(bag || {})) {
      if (def.category == null) continue;
      const entry = {
        resourceId: id,
        id,
        name: def.name,
        category: def.category,
        tier: Number(def.tier),
        properties: def.properties || [],
        toxic: !!def.toxic,
        biome_tags: def.biome_tags || [],
        kind: def.kind || null,
        theater: def.theater || null,
        notDeposit: !!def.notDeposit,
        stub: !!def.stub,
      };
      all.push(entry);
      (byCategory[def.category] = byCategory[def.category] || []).push(entry);
      if (isPaintDeposit(entry)) {
        (byCategoryDeposits[def.category] = byCategoryDeposits[def.category] || []).push(entry);
      }
      const t = Number(def.tier);
      (byTier[t] = byTier[t] || []).push(entry);
    }
  }
  return { all, byCategory, byCategoryDeposits, byTier };
}

/**
 * Find all resources matching a single require spec.
 * @param {Object} require
 * @param {Object} [index] - from buildResourceIndex
 * @returns {SlottedResource[]}
 */
export function findResourcesForRequire(require, index) {
  const idx = index || buildResourceIndex();
  if (!require) return idx.all.slice();
  const pool = require.category
    ? (idx.byCategory[require.category] || [])
    : idx.all;
  return pool.filter((r) => resourceMatchesRequire(r, require));
}

/**
 * Effective tier of a filled slot = min(tier of all resources in it).
 * This is the anti-multiplicative bottleneck rule.
 * @param {SlottedResource[]} filled
 * @returns {number|null} null if empty
 */
export function slotEffectiveTier(filled) {
  if (!filled || filled.length === 0) return null;
  let min = Infinity;
  for (const r of filled) {
    if (r.tier == null) return null;
    if (r.tier < min) min = r.tier;
  }
  return min === Infinity ? null : min;
}

/**
 * Resolve all slots of a consumer (building/unit/ship) against available resources.
 * Returns per-slot: matched candidates, suggested fill (best by tier), effective tier.
 *
 * "Best by tier" = the lowest-tier resource that satisfies — because of the bottleneck rule,
 * the player is encouraged to fill with the *minimum sufficient* tier to avoid wasting high-tier
 * materials. Here we surface both the min-tier suggestion and the full candidate list so the
 * UI can let the player choose.
 *
 * @param {Object} consumer - building/unit/ship def with `slots` array
 * @param {Object} [index] - from buildResourceIndex
 * @returns {Array<{role, require, count, candidates, suggested, effectiveTier}>}
 */
export function resolveSlots(consumer, index) {
  const idx = index || buildResourceIndex();
  const out = [];
  for (const slot of consumer.slots || []) {
    const candidates = findResourcesForRequire(slot.require, idx);
    // suggested = lowest tier that satisfies (min sufficient)
    let suggested = null;
    for (const r of candidates) {
      if (r.tier == null) continue;
      if (!suggested || r.tier < suggested.tier) suggested = r;
    }
    // effective tier if the suggested fill is used for all `count` slots
    const effectiveTier = suggested ? suggested.tier : null;
    out.push({
      role: slot.role,
      require: slot.require,
      count: slot.count,
      candidates,
      suggested,
      effectiveTier,
    });
  }
  return out;
}

/**
 * Check whether a consumer can be built / fielded given a faction's available resources.
 * A slot is "satisfiable" if at least one candidate exists. The consumer is buildable if
 * every slot is satisfiable AND the faction has enough distinct resources to fill counts.
 *
 * Note: this checks *existence* of candidates, not stock. Stock accounting is done in flowEngine.
 *
 * @param {Object} consumer
 * @param {Object} [index]
 * @returns {{ok: boolean, missing: string[], bottlenecks: string[]}}
 */
export function canBuild(consumer, index) {
  const idx = index || buildResourceIndex();
  const missing = [];
  const bottlenecks = [];
  for (const slot of consumer.slots || []) {
    const candidates = findResourcesForRequire(slot.require, idx);
    if (candidates.length === 0) {
      missing.push(
        `slot '${slot.role}': нет ресурсов для ${JSON.stringify(slot.require)}`,
      );
    } else {
      const minTier = Math.min(...candidates.map((r) => r.tier));
      bottlenecks.push(
        `slot '${slot.role}': минимальный доступный tier = ${minTier}`,
      );
    }
  }
  return { ok: missing.length === 0, missing, bottlenecks };
}

/**
 * Resolve a faction variant against its base generic template.
 * Merges base.slots + variant.extra_slots, base.effects + variant.extra_effects.
 *
 * @param {string} variantId
 * @param {Object} [content]
 * @returns {Object|null} resolved consumer def (or null if not found)
 */
export function resolveVariant(variantId, content) {
  const c = content || getContent();
  const all = { ...c.buildings, ...c.ships, ...c.units };
  const variant = all[variantId];
  if (!variant) return null;
  if (!variant.base) return variant;
  const base = all[variant.base];
  if (!base) return variant;
  return {
    ...base,
    ...variant,
    slots: [...(base.slots || []), ...(variant.extra_slots || [])],
    effects: [...(base.effects || []), ...(variant.extra_effects || [])],
  };
}

/**
 * List all consumer defs (buildings + units + ships) that have `slots`.
 * Useful for UI to enumerate buildable/fieldable items.
 *
 * @param {Object} [content]
 * @returns {Object[]} [{id, kind, name, category, tier, faction, slots, ...}]
 */
export function listSlotConsumers(content) {
  const c = content || getContent();
  const out = [];
  for (const coll of [c.buildings, c.units, c.ships]) {
    for (const def of Object.values(coll || {})) {
      if (def.slots && def.slots.length > 0) {
        out.push({ ...def, _collection: coll === c.buildings ? "building" : coll === c.units ? "unit" : "ship" });
      }
    }
  }
  return out;
}
