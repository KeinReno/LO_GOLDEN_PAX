/**
 * ModifierStack — collect effect instances → merge into per-channel flat+mult
 * → apply to a base number. Ported from GMap/server/modifierStack.mjs's
 * `buildModifierStack`/`applyFlatThenMult`/`channelKey`/`isMult`/`isFlat`/
 * `DEFAULT_MODIFIER_CAPS` (all exported+pure there — byte-parity tested).
 *
 * `applyProductionChannel`/`applyUpkeepChannel`/`mergeChannels` are
 * behavior-derived from GMap/server/economyTick.mjs (module-private there,
 * not directly diffable) — this is GMap's real per-category application
 * step, re-derived from reading that source, not guessed.
 *
 * Phase 1+court scope (2026-08-15, see notes/2026-08-14-court-governance-grill.md
 * and COURT_AND_NPC_ROSTER_SPEC.md): `production:*`/`upkeep:*` feed
 * domain/planets/flowIncome.mjs (tech + faction-scope court effects);
 * `combat_role:${role}` (Tech Tree 2.0) and `stat:${stat}` (court Part 4)
 * feed domain/combat/resolveExchange.mjs; `pop_growth` feeds
 * domain/economy/populationGrowth.mjs. `npc_task:*` is read directly by
 * domain/court/npcTasks.mjs, not through this stack's consumers.
 * `move_cost` feeds domain/forces/movement.mjs (opts.effects).
 *
 * Still produced-not-consumed: `loyalty:*` (no accumulator — schema.sql
 * has zero loyalty columns).
 * `stability` is consumed by domain/court/stability.mjs (new design; GMap
 * never did). GMap's race/culture/faith/tax/deficit/POI/treaty/faction-trait
 * fold-in is still unwired.
 */

function channelKey(effect, args = {}) {
  const a = args || {};
  switch (effect) {
    case "production_flat":
    case "production_mult":
      return `production:${a.resource || "*"}`;
    case "upkeep_flat":
    case "upkeep_mult":
      return `upkeep:${a.resource || "*"}`;
    case "ap_add":
    case "ap_mult":
      return "ap";
    case "cost_flat":
    case "cost_mult":
      return `cost:${a.tag || a.resource || "*"}`;
    case "move_cost_mult":
      return "move_cost";
    case "pop_growth_flat":
    case "pop_growth_mult":
      return "pop_growth";
    case "pop_cap_flat":
      return "pop_cap";
    case "stability_add":
      return "stability";
    case "habitability_mult":
      return "habitability";
    case "stat_mult":
      return `stat:${a.stat || "*"}`;
    case "tax_pressure":
      return "tax_pressure";
    case "loyalty_add":
    case "loyalty_mult":
      return `loyalty:${a.raceId || "*"}`;
    case "logistics_range_add":
    case "logistics_disconnected_penalty":
      return `logistics:${a.kind || "default"}`;
    case "diplomacy_opinion_add":
    case "diplomacy_trust_decay_mult":
      return `diplomacy:${a.towardFactionId || "*"}`;
    case "research_cost_mult":
      return `research:${a.category || "*"}`;
    case "npc_task_speed_mult":
      return `npc_task:${a.kind || "*"}`;
    case "revolt_risk":
      return "revolt_risk";
    case "power_mind_strike":
      return "power:mind";
    case "power_will_sway":
      return "power:will";
    case "combat_role_mult":
      return `combat_role:${a.role || "*"}`;
    default:
      return `${effect}:${JSON.stringify(a)}`;
  }
}

/** Composite / non-mergeable effects that must not be treated as mult/flat. */
const OTHER_EFFECTS = new Set([
  "logistics_disconnected_penalty",
  "revolt_risk",
  "unit_upgrade",
  "treaty_effect",
  "forbid_intent",
  "allow_intent",
  "power_mind_strike",
  "power_will_sway",
  "unlock_property",
  "unlock_tech_tier",
  "slot_require",
  "flow_convert",
  "combat_stat_from_slot",
]);

function isMult(effect) {
  if (OTHER_EFFECTS.has(effect)) return false;
  return effect.endsWith("_mult") || effect === "habitability_mult";
}

function isFlat(effect) {
  if (OTHER_EFFECTS.has(effect)) return false;
  return (
    effect.endsWith("_flat") ||
    effect === "ap_add" ||
    effect === "stability_add" ||
    effect === "tax_pressure" ||
    effect === "loyalty_add" ||
    effect === "diplomacy_opinion_add" ||
    effect === "logistics_range_add"
  );
}

/** Soft caps so tech stacks cannot explode even_growth pacing. */
export const DEFAULT_MODIFIER_CAPS = {
  production: { min: 0.5, max: 2.0 },
  upkeep: { min: 0.5, max: 1.5 },
  research: { min: 0.5, max: 1.5 },
  cost: { min: 0.75, max: 1.5 },
  "*": { min: 0.25, max: 3.0 },
};

function clampChannelMult(key, mult, caps) {
  const table = caps || DEFAULT_MODIFIER_CAPS;
  const head = String(key || "").split(":")[0];
  const band = table[head] || table["*"];
  if (!band) return mult;
  const lo = Number(band.min ?? 0);
  const hi = Number(band.max ?? Infinity);
  return Math.min(hi, Math.max(lo, mult));
}

/**
 * @param {{effect: string, args?: object, source?: object}[]} effects
 * @param {{ mergeOrder?: string[], modifierCaps?: Record<string, {min?:number,max?:number}> }} [opts]
 */
export function buildModifierStack(effects, opts = {}) {
  const mergeOrder = opts.mergeOrder || ["flat", "mult"];
  const list = Array.isArray(effects) ? effects : [];
  const byChannel = new Map();

  for (const e of list) {
    if (!e?.effect) continue;
    const key = channelKey(e.effect, e.args);
    if (!byChannel.has(key)) {
      byChannel.set(key, { key, flats: [], mults: [], other: [], sources: [] });
    }
    const bucket = byChannel.get(key);
    bucket.sources.push(e);
    if (isFlat(e.effect)) bucket.flats.push(e);
    else if (isMult(e.effect)) bucket.mults.push(e);
    else bucket.other.push(e);
  }

  const channels = {};
  for (const [key, bucket] of byChannel) {
    let flat = 0;
    let mult = 1;
    for (const e of bucket.flats) {
      const n = Number(e.args?.amount ?? e.args?.hops ?? 0);
      if (!Number.isNaN(n)) flat += n;
    }
    for (const e of bucket.mults) {
      const n = Number(e.args?.mult ?? 1);
      if (!Number.isNaN(n)) mult *= n;
    }
    mult = clampChannelMult(key, mult, opts.modifierCaps);

    let value;
    if (mergeOrder[0] === "flat") {
      value = flat === 0 && mult === 1 ? 0 : { flat, mult };
    } else {
      value = { flat, mult };
    }

    channels[key] = { flat, mult, value, effects: bucket.sources };
  }

  return { channels, effects: list, mergeOrder };
}

/** Apply production-style: (base + flat) * mult */
export function applyFlatThenMult(base, channel) {
  if (!channel) return base;
  return (base + (channel.flat || 0)) * (channel.mult ?? 1);
}

export function explainStack(stack) {
  return Object.entries(stack.channels).map(([key, ch]) => ({
    channel: key,
    flat: ch.flat,
    mult: ch.mult,
    sources: (ch.effects || []).map((e) => ({ effect: e.effect, args: e.args, source: e.source ?? null })),
  }));
}

/**
 * Merge a resource-specific channel with its `*` wildcard — behavior-
 * derived from GMap economyTick.mjs's module-private mergeChannels.
 */
export function mergeChannels(specific, wildcard) {
  if (!specific && !wildcard) return null;
  return {
    flat: (specific?.flat || 0) + (wildcard?.flat || 0),
    mult: (specific?.mult ?? 1) * (wildcard?.mult ?? 1),
  };
}

/**
 * Apply a production channel to an already-computed category delta —
 * behavior-derived from GMap economyTick.mjs's module-private
 * applyProductionChannel. Positive deltas get the full (delta+flat)*mult
 * treatment; a non-positive delta only gets the channel's flat bonus
 * (a mult on an already-negative/zero number would be backwards).
 */
export function applyProductionChannel(delta, channel) {
  if (!channel) return delta;
  if (delta > 0) return Math.floor(applyFlatThenMult(delta, channel));
  if (channel.flat) return delta + Math.floor(applyFlatThenMult(0, channel));
  return delta;
}

/**
 * Apply an upkeep channel — behavior-derived from GMap economyTick.mjs's
 * module-private applyUpkeepChannel. Upkeep is `flat * mult`, counted once
 * and subtracted regardless of whether the result goes negative.
 */
export function applyUpkeepChannel(delta, channel) {
  if (!channel) return delta;
  const upkeep = Math.floor(applyFlatThenMult(0, channel));
  return delta - upkeep;
}
