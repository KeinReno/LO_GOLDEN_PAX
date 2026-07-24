/**
 * ModifierStack — collect → merge flats then mults → explain (P1.3).
 */

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
    default:
      return `${effect}:${JSON.stringify(a)}`;
  }
}

function isMult(effect) {
  return effect.endsWith("_mult") || effect === "habitability_mult";
}

function isFlat(effect) {
  return (
    effect.endsWith("_flat") ||
    effect === "ap_add" ||
    effect === "stability_add" ||
    effect === "tax_pressure"
  );
}

/**
 * @param {EffectInstance[]} effects
 * @param {{ mergeOrder?: string[] }} [opts]
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
      const n = Number(e.args?.amount ?? 0);
      if (!Number.isNaN(n)) flat += n;
    }
    for (const e of bucket.mults) {
      const n = Number(e.args?.mult ?? 1);
      if (!Number.isNaN(n)) mult *= n;
    }

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
 * Collect race trait effects weighted by percent (0-100).
 * @param {object} racesContent
 * @param {{ raceId: string, percent: number }[]} composition
 */
export function collectRaceEffects(racesContent, composition) {
  const out = [];
  for (const share of composition || []) {
    const race = racesContent?.[share.raceId];
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
