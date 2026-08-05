/**
 * ModifierStack — collect → merge flats then mults → explain (P1.3).
 */
import { resolveRace } from "./raceRegistry.mjs";
import { collectRaceStateEffects } from "./raceStates.mjs";

/**
 * @typedef {{ effect: string, args?: Record<string, unknown>, source?: { kind: string, id: string, label?: string } }} EffectInstance
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
    case "unit_upgrade":
    case "building_level_mult":
    case "treaty_effect":
      return `${effect}:${JSON.stringify(a)}`;
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
  research: { min: 0.5, max: 1.0 },
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
 * @param {EffectInstance[]} effects
 * @param {{ mergeOrder?: string[], modifierCaps?: Record<string, { min?: number, max?: number }> }} [opts]
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

  /** @type {Record<string, { flat: number, mult: number, value: number, effects: EffectInstance[] }>} */
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
      // For production-like: (base + flat) * mult applied later with base.
      // Channel stores components; value = flat * mult as "modifier magnitude" helper.
      value = flat === 0 && mult === 1 ? 0 : { flat, mult };
    } else {
      value = { flat, mult };
    }

    channels[key] = {
      flat,
      mult,
      value,
      effects: bucket.sources,
    };
  }

  return {
    channels,
    effects: list,
    mergeOrder,
  };
}

/**
 * Apply production-style: (base + flat) * mult
 */
export function applyFlatThenMult(base, channel) {
  if (!channel) return base;
  return (base + (channel.flat || 0)) * (channel.mult ?? 1);
}

/**
 * AP max from rules + stack
 */
export function resolveApMax(apPerTurn, stack) {
  const ch = stack.channels.ap;
  const flat = ch?.flat ?? 0;
  const mult = ch?.mult ?? 1;
  return Math.max(0, Math.floor((apPerTurn + flat) * mult));
}

export function explainStack(stack) {
  return Object.entries(stack.channels).map(([key, ch]) => ({
    channel: key,
    flat: ch.flat,
    mult: ch.mult,
    sources: (ch.effects || []).map((e) => ({
      effect: e.effect,
      args: e.args,
      source: e.source ?? null,
    })),
  }));
}

/**
 * Resolve planet population race mix for trait / habitability modifiers.
 * @param {{ raceComposition?: { raceId: string, percent: number }[] }} planet
 * @param {{ primaryRaceId?: string, primaryRace?: string, dominantRaceId?: string, dominantRace?: string } | null} [faction]
 */
export function resolvePlanetRaceComposition(planet, faction = null) {
  if (planet?.raceComposition?.length > 0) {
    return planet.raceComposition;
  }
  const raceId =
    faction?.primaryRaceId ||
    faction?.primaryRace ||
    faction?.dominantRaceId ||
    faction?.dominantRace ||
    "race_human";
  return [{ raceId, percent: 100 }];
}

/**
 * Collect race trait effects weighted by percent (0-100).
 * Uses Race Registry resolveRace (parent/fork composition).
 * Optional opts: factionId, turn — also folds race_states.json modifiers.
 * @param {object} racesContent
 * @param {{ raceId: string, percent: number }[]} composition
 * @param {{ factionId?: string, turn?: number }} [opts]
 */
export function collectRaceEffects(racesContent, composition, opts = {}) {
  const foldState = opts.factionId != null || opts.turn != null;
  const out = [];
  for (const share of composition || []) {
    const race =
      resolveRace(share.raceId, racesContent) || racesContent?.[share.raceId];
    if (!race) continue;
    const w = (share.percent ?? 0) / 100;
    if (w <= 0) continue;
    for (const trait of race.traits || []) {
      for (const eff of trait.effects || []) {
        out.push({
          ...eff,
          args: scaleArgs(eff.effect, eff.args, w),
          source: {
            kind: "race",
            id: `${race.id}:${trait.id}`,
            label: race.name,
          },
        });
      }
    }
    if (foldState) {
      for (const eff of collectRaceStateEffects(share.raceId, opts)) {
        out.push({
          ...eff,
          args: scaleArgs(eff.effect, eff.args || {}, w),
        });
      }
    }
  }
  return out;
}

function scaleArgs(effect, args, w) {
  if (!args || w === 1) return { ...args };
  const a = { ...args };
  if (typeof a.amount === "number" && isFlat(effect)) {
    a.amount = a.amount * w;
  }
  if (typeof a.mult === "number" && isMult(effect)) {
    // interpolate toward 1
    a.mult = 1 + (a.mult - 1) * w;
  }
  return a;
}
