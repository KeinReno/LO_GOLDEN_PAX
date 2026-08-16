/**
 * Race Registry — resolve definitions with parent / fork composition.
 * Content describes races; engine only merges traits + overrides.
 */

/**
 * @typedef {{ id: string, effects?: object[], balanceBudget?: number }} RaceTrait
 * @typedef {{
 *   id: string,
 *   name?: string,
 *   kind?: string,
 *   origin?: string,
 *   parent?: string,
 *   base?: string,
 *   forked_from?: string,
 *   composeParent?: boolean,
 *   traits?: RaceTrait[],
 *   override_traits?: RaceTrait[],
 *   remove_traits?: string[],
 *   state_overrides?: Record<string, unknown>,
 *   tags?: string[],
 *   habitability?: Record<string, number>,
 *   growth?: { baseRate?: number, crowdPenalty?: number },
 *   xenorelations?: Record<string, number>,
 *   reproduction?: { requires?: string },
 *   powerPath?: string[],
 * }} RaceDef
 */

/**
 * Resolve a race id to a fully composed definition.
 * - Fork (`base` / `forked_from`): inherit base, apply remove/override traits + state_overrides.
 * - Parent with `composeParent: true`: stack parent traits under child traits.
 * - Otherwise: return shallow clone of the entry (backward compatible).
 *
 * @param {string} raceId
 * @param {Record<string, RaceDef>} racesContent
 * @param {{ seen?: Set<string> }} [opts]
 * @returns {RaceDef | null}
 */
export function resolveRace(raceId, racesContent, opts = {}) {
  if (!raceId || !racesContent) return null;
  const raw = racesContent[raceId];
  if (!raw) return null;

  const seen = opts.seen || new Set();
  if (seen.has(raceId)) {
    console.warn(`[raceRegistry] cycle at ${raceId}`);
    return { ...raw, traits: [...(raw.traits || [])] };
  }
  seen.add(raceId);

  const forkBaseId = raw.base || raw.forked_from;
  if (forkBaseId) {
    const base = resolveRace(forkBaseId, racesContent, { seen: new Set(seen) });
    if (!base) return { ...raw, traits: [...(raw.traits || [])] };
    return composeFork(base, raw);
  }

  if (raw.parent && raw.composeParent) {
    const parent = resolveRace(raw.parent, racesContent, { seen: new Set(seen) });
    if (!parent) return cloneRace(raw);
    return composeParentChild(parent, raw);
  }

  return cloneRace(raw);
}

/**
 * Resolve all races in content to composed defs (keyed by id).
 * @param {Record<string, RaceDef>} racesContent
 */
export function resolveAllRaces(racesContent) {
  const out = {};
  for (const id of Object.keys(racesContent || {})) {
    out[id] = resolveRace(id, racesContent);
  }
  return out;
}

/**
 * Sum balanceBudget of composed traits.
 * @param {RaceDef | null} race
 */
export function raceTraitBudget(race) {
  return (race?.traits || []).reduce(
    (s, t) => s + (Number(t?.balanceBudget) || 0),
    0,
  );
}

/**
 * Validate trait count / budget against rules.races.
 * @param {RaceDef} raw
 * @param {RaceDef} resolved
 * @param {object} rules
 */
export function validateRaceBudget(raw, resolved, rules = {}) {
  const cfg = rules.races || {};
  const maxBase = cfg.maxTraitsBase ?? 6;
  const maxSub = cfg.maxTraitsSubrace ?? 4;
  const maxForkExtra = cfg.maxForkExtraTraits ?? 3;
  const budgetMin = cfg.budgetMin ?? -2;
  const budgetMax = cfg.budgetMax ?? 2;
  const errors = [];

  const isFork = !!(raw.base || raw.forked_from);
  const isSub = !!(raw.parent || isFork);
  const ownTraits = [
    ...(raw.traits || []),
    ...(raw.override_traits || []),
  ];
  const limit = isSub ? maxSub : maxBase;
  if (ownTraits.length > limit) {
    errors.push(
      `${raw.id}: ${ownTraits.length} own traits > limit ${limit}`,
    );
  }
  if (isFork && (raw.override_traits || []).length > maxForkExtra) {
    errors.push(
      `${raw.id}: fork override_traits > ${maxForkExtra}`,
    );
  }
  const budget = raceTraitBudget(resolved);
  if (budget < budgetMin || budget > budgetMax) {
    errors.push(
      `${raw.id}: composed budget ${budget} outside [${budgetMin},${budgetMax}]`,
    );
  }
  return errors;
}

function cloneRace(raw) {
  return {
    ...raw,
    traits: [...(raw.traits || [])],
    tags: [...(raw.tags || [])],
    habitability: { ...(raw.habitability || {}) },
    growth: { ...(raw.growth || {}) },
    xenorelations: { ...(raw.xenorelations || {}) },
    ...(raw.reproduction ? { reproduction: { ...raw.reproduction } } : {}),
    ...(raw.state_overrides
      ? { state_overrides: deepClone(raw.state_overrides) }
      : {}),
  };
}

function composeParentChild(parent, child) {
  const remove = new Set(child.remove_traits || []);
  const parentTraits = (parent.traits || []).filter((t) => !remove.has(t.id));
  const childTraits = [
    ...(child.traits || []),
    ...(child.override_traits || []),
  ];
  const byId = new Map();
  for (const t of parentTraits) byId.set(t.id, t);
  for (const t of childTraits) byId.set(t.id, t);

  return {
    ...parent,
    ...child,
    id: child.id,
    name: child.name || parent.name,
    parent: child.parent || parent.id,
    tags: unique([...(parent.tags || []), ...(child.tags || [])]),
    traits: [...byId.values()],
    habitability: {
      ...(parent.habitability || {}),
      ...(child.habitability || {}),
      ...(child.state_overrides?.habitability || {}),
    },
    growth: {
      ...(parent.growth || {}),
      ...(child.growth || {}),
      ...(child.state_overrides?.growth || {}),
    },
    xenorelations: {
      ...(parent.xenorelations || {}),
      ...(child.xenorelations || {}),
    },
    reproduction:
      child.reproduction ||
      child.state_overrides?.reproduction ||
      parent.reproduction,
  };
}

function composeFork(base, fork) {
  const remove = new Set(fork.remove_traits || []);
  const kept = (base.traits || []).filter((t) => !remove.has(t.id));
  const overrides = fork.override_traits || fork.traits || [];
  const byId = new Map();
  for (const t of kept) byId.set(t.id, t);
  for (const t of overrides) byId.set(t.id, t);

  const so = fork.state_overrides || {};
  return {
    ...base,
    ...fork,
    id: fork.id,
    name: fork.name || base.name,
    forked_from: fork.forked_from || fork.base || base.id,
    base: fork.base || fork.forked_from || base.id,
    tags: unique([...(base.tags || []), ...(fork.tags || [])]),
    traits: [...byId.values()],
    habitability: {
      ...(base.habitability || {}),
      ...(fork.habitability || {}),
      ...(so.habitability || {}),
    },
    growth: {
      ...(base.growth || {}),
      ...(fork.growth || {}),
      ...(so.growth || {}),
    },
    xenorelations: {
      ...(base.xenorelations || {}),
      ...(fork.xenorelations || {}),
      ...(so.xenorelations || {}),
    },
    reproduction: fork.reproduction || so.reproduction || base.reproduction,
  };
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function deepClone(v) {
  return JSON.parse(JSON.stringify(v ?? {}));
}
