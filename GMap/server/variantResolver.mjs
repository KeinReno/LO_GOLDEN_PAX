/**
 * Variant System — resolve racial/factional variants of buildings, units, ships.
 *
 * Supports:
 * 1. Spec form: base entity with `variants: [id…]` + variant entries with `base`, `tags`, overrides
 * 2. Legacy form: `raceVariants: { [raceId]: { … } }` on the base def (units/ships)
 */

/**
 * @typedef {{ raceId: string, percent?: number }} RaceShare
 */

/**
 * Min race share (0–100) required to unlock a racial variant.
 * @param {object} rules
 */
export function variantRaceThreshold(rules) {
  const v = rules?.variants?.minRacePercent;
  return typeof v === "number" ? v : 20;
}

/**
 * Normalize race id comparisons (race_belator ↔ belator).
 * @param {string} id
 */
export function normalizeRaceKey(id) {
  const s = String(id || "");
  return s.startsWith("race_") ? s : `race_${s}`;
}

/**
 * Race ids present at/above threshold.
 * @param {RaceShare[]} composition
 * @param {number} thresholdPercent
 * @returns {Set<string>}
 */
export function racesMeetingThreshold(composition, thresholdPercent) {
  const set = new Set();
  for (const share of composition || []) {
    const pct = Number(share.percent) || 0;
    if (pct >= thresholdPercent) {
      set.add(normalizeRaceKey(share.raceId));
    }
  }
  return set;
}

/**
 * List available variants for a base entity id.
 *
 * @param {"buildings"|"units"|"ships"} kind
 * @param {string} baseId
 * @param {RaceShare[]} composition
 * @param {object} content
 * @param {object} [rules]
 * @returns {{ baseId: string, available: Array<{ id: string, def: object, raceTag?: string|null, legacy?: boolean }>, threshold: number }}
 */
export function listAvailableVariants(
  kind,
  baseId,
  composition,
  content,
  rules = {},
) {
  const catalog = content?.[kind] || {};
  const base = catalog[baseId];
  const threshold = variantRaceThreshold(rules);
  const present = racesMeetingThreshold(composition, threshold);
  const available = [];

  if (!base) {
    return { baseId, available, threshold };
  }

  // Always offer generic base
  available.push({ id: baseId, def: base, raceTag: null });

  // Spec: variants[] pointing at separate entries
  const variantIds = Array.isArray(base.variants) ? base.variants : [];
  for (const vid of variantIds) {
    const vdef = catalog[vid];
    if (!vdef) continue;
    const tags = (vdef.tags || []).map(normalizeRaceKey);
    const raceTag =
      tags.find((t) => t.startsWith("race_")) ||
      (vdef.raceId ? normalizeRaceKey(vdef.raceId) : null);
    if (raceTag && !present.has(raceTag)) continue;
    if (raceTag || tags.includes("general") || tags.length === 0) {
      available.push({ id: vid, def: mergeVariant(base, vdef), raceTag });
    }
  }

  // Also pick up orphan variant entries that declare base === baseId
  for (const [id, def] of Object.entries(catalog)) {
    if (id === baseId) continue;
    if (def?.base !== baseId && def?.kind !== "variant") continue;
    if (variantIds.includes(id)) continue;
    if (def.kind === "variant_base") continue;
    const tags = (def.tags || []).map(normalizeRaceKey);
    const raceTag =
      tags.find((t) => t.startsWith("race_")) ||
      (def.raceId ? normalizeRaceKey(def.raceId) : null);
    if (raceTag && !present.has(raceTag)) continue;
    available.push({ id, def: mergeVariant(base, def), raceTag });
  }

  // Legacy raceVariants map
  const legacy = base.raceVariants || {};
  for (const [raceId, patch] of Object.entries(legacy)) {
    const key = normalizeRaceKey(raceId);
    if (!present.has(key)) continue;
    const id = `${baseId}.${raceId.replace(/^race_/, "")}`;
    available.push({
      id,
      def: mergeLegacyRaceVariant(base, patch, key),
      raceTag: key,
      legacy: true,
    });
  }

  return { baseId, available, threshold };
}

/**
 * Resolve one concrete variant (or base) for build/combat.
 *
 * @param {"buildings"|"units"|"ships"} kind
 * @param {string} entityId — base or variant id
 * @param {object} content
 * @param {{ composition?: RaceShare[], rules?: object, preferredRaceId?: string }} [opts]
 */
export function resolveVariant(kind, entityId, content, opts = {}) {
  const catalog = content?.[kind] || {};
  const direct = catalog[entityId];
  if (direct?.base && catalog[direct.base]) {
    return {
      id: entityId,
      def: mergeVariant(catalog[direct.base], direct),
      baseId: direct.base,
    };
  }
  if (direct) {
    // Prefer preferred race legacy variant when composition allows
    if (opts.preferredRaceId && direct.raceVariants) {
      const list = listAvailableVariants(
        kind,
        entityId,
        opts.composition || [
          { raceId: opts.preferredRaceId, percent: 100 },
        ],
        content,
        opts.rules,
      );
      const match = list.available.find(
        (a) =>
          a.raceTag === normalizeRaceKey(opts.preferredRaceId) && a.legacy,
      );
      if (match) return { id: match.id, def: match.def, baseId: entityId };
    }
    return { id: entityId, def: direct, baseId: entityId };
  }

  // Legacy synthetic id: baseId.suffix
  const dot = String(entityId).lastIndexOf(".");
  if (dot > 0) {
    const baseId = entityId.slice(0, dot);
    const suffix = entityId.slice(dot + 1);
    const base = catalog[baseId];
    if (base?.raceVariants) {
      const raceKey = normalizeRaceKey(suffix);
      const patch =
        base.raceVariants[raceKey] ||
        base.raceVariants[suffix] ||
        base.raceVariants[`race_${suffix}`];
      if (patch) {
        return {
          id: entityId,
          def: mergeLegacyRaceVariant(base, patch, raceKey),
          baseId,
        };
      }
    }
  }

  return null;
}

/**
 * Pick best available variant for a race composition (highest share matching tag).
 */
export function pickBestVariant(kind, baseId, composition, content, rules) {
  const { available } = listAvailableVariants(
    kind,
    baseId,
    composition,
    content,
    rules,
  );
  if (!available.length) return null;
  const ranked = (composition || [])
    .slice()
    .sort((a, b) => (b.percent || 0) - (a.percent || 0));
  for (const share of ranked) {
    const key = normalizeRaceKey(share.raceId);
    const hit = available.find((a) => a.raceTag === key);
    if (hit) return hit;
  }
  return available[0];
}

/**
 * Merge base + variant overrides (spec form).
 */
export function mergeVariant(base, variant) {
  const costMult =
    typeof variant.cost_mult === "number" ? variant.cost_mult : 1;
  const baseCost = base.cost || {};
  const variantCost = variant.cost;
  let cost = variantCost
    ? { ...variantCost }
    : Object.fromEntries(
        Object.entries(baseCost).map(([k, v]) => [
          k,
          Math.round(Number(v) * costMult),
        ]),
      );

  const effects = [
    ...(base.effects || []),
    ...(variant.extra_effects || []),
    ...(variant.effects || []),
  ];
  const upkeep_effects = [
    ...(base.upkeep_effects || []),
    ...(variant.upkeep_effects || []),
  ];

  return {
    ...base,
    ...variant,
    id: variant.id,
    base: base.id,
    kind: variant.kind || base.kind,
    name: variant.name || base.name,
    cost,
    effects,
    upkeep_effects,
    stats: mergeStats(base.stats, variant.extra_stats || variant.stats),
    requires: variant.requires || base.requires,
    self_consume: variant.self_consume || base.self_consume,
    flavor: variant.flavor || base.flavor,
    tags: unique([...(base.tags || []), ...(variant.tags || [])]),
  };
}

function mergeLegacyRaceVariant(base, patch, raceKey) {
  const stats = { ...(base.stats || {}) };
  for (const [k, m] of Object.entries(patch.statsMult || {})) {
    if (typeof stats[k] === "number" && typeof m === "number") {
      stats[k] = stats[k] * m;
    } else if (typeof m === "number" && stats[k] == null) {
      // Keep mult metadata for combat apply path
      stats[k] = m;
    }
  }
  if (patch.extra_stats) {
    for (const [k, v] of Object.entries(patch.extra_stats)) {
      stats[k] = (Number(stats[k]) || 0) + Number(v);
    }
  }
  return {
    ...base,
    id: `${base.id}.${String(raceKey).replace(/^race_/, "")}`,
    base: base.id,
    name: patch.name || base.name,
    stats,
    raceVariants: undefined,
    tags: unique([...(base.tags || []), raceKey]),
    statsMult: patch.statsMult || null,
    flavor: patch.flavor || base.flavor,
  };
}

function mergeStats(baseStats, extra) {
  if (!extra) return baseStats ? { ...baseStats } : undefined;
  const out = { ...(baseStats || {}) };
  for (const [k, v] of Object.entries(extra)) {
    if (typeof v === "number" && typeof out[k] === "number") {
      // extra_stats are deltas; stats replace
      out[k] = out[k] + v;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean))];
}

/** @deprecated alias — prefer listAvailableVariants */
export function resolveVariants(kind, baseId, composition, content, rules) {
  return listAvailableVariants(kind, baseId, composition, content, rules);
}
