import { resolveTechDef } from "./resolveTechDef.mjs";
import { firstMissingPrerequisite } from "./prerequisites.mjs";
import { factionRaceCounts } from "../planets/raceComposition.mjs";

/**
 * NOT a port — new design (notes/2026-08-14-tech-tree-redesign-grill.md Q3–Q6,
 * TECH_TREE_2_INTEGRATION_SPEC.md Priorities 2–4). GMap has no offer/reroll
 * acquisition. A faction holds a persisted 3-candidate offer per player-
 * facing direction; 1 reroll per cycle; researching outside the offer is
 * allowed at a cognitio premium (see researchTech.mjs).
 *
 * Offers are lazy-on-read + persisted-once-generated (`ensureOffers`) so a
 * player is not surprised with a reroll they didn't ask for.
 *
 * Race identity weights the draw (Priority 4). Doctrine/trait weighting is
 * out of scope — no `faction.traits` data model yet. First-pass: a
 * plurality-race match on `raceAffinity` (or `tags` starting `race_`)
 * multiplies sample weight by RACE_AFFINITY_WEIGHT (2.5).
 */

export const TECH_DIRECTIONS = Object.freeze([
  "industry",
  "military",
  "culture",
  "commerce",
  "diplomacy",
  "governance",
]);

export const OFFER_SIZE = 3;
export const OFFER_BYPASS_COGNITIO_MULT = 1.5;
export const RACE_AFFINITY_WEIGHT = 2.5;

function defaultRng() {
  return Math.random();
}

export function isTechDirection(value) {
  return TECH_DIRECTIONS.includes(value);
}

function pluralityRace(counts) {
  let best = null;
  let n = -1;
  for (const [id, count] of Object.entries(counts || {})) {
    const c = Number(count) || 0;
    if (c > n) {
      n = c;
      best = id;
    }
  }
  return n > 0 ? best : null;
}

function affinityTags(def) {
  if (Array.isArray(def?.raceAffinity) && def.raceAffinity.length) return def.raceAffinity;
  return (def?.tags || []).filter((t) => String(t).startsWith("race_"));
}

export function offerWeight(def, factionPlanets) {
  const plurality = pluralityRace(factionRaceCounts(factionPlanets));
  if (!plurality) return 1;
  return affinityTags(def).includes(plurality) ? RACE_AFFINITY_WEIGHT : 1;
}

/**
 * Techs that can appear in this direction's offer: tagged with the
 * direction, not catalogPending, not already researched, all prereqs met.
 */
export function frontierTechs(techAccount, content, direction) {
  const unlocked = techAccount?.unlockedTechs || [];
  const out = [];
  for (const def of Object.values(content?.technologies || {})) {
    if (!def?.id) continue;
    if (def.direction !== direction) continue;
    if (def.catalogPending) continue;
    if (unlocked.includes(def.id)) continue;
    if (firstMissingPrerequisite(def, unlocked)) continue;
    out.push(def.id);
  }
  return out;
}

function weightedSample(ids, k, rng, weightOf) {
  const pool = ids.map((id) => ({ id, w: Math.max(0, Number(weightOf(id)) || 0) }));
  const picked = [];
  const n = Math.min(k, pool.length);
  for (let i = 0; i < n; i++) {
    const total = pool.reduce((s, x) => s + x.w, 0);
    if (total <= 0) {
      picked.push(pool[0].id);
      pool.splice(0, 1);
      continue;
    }
    let r = rng() * total;
    let idx = 0;
    for (; idx < pool.length; idx++) {
      r -= pool[idx].w;
      if (r <= 0) break;
    }
    if (idx >= pool.length) idx = pool.length - 1;
    picked.push(pool[idx].id);
    pool.splice(idx, 1);
  }
  return picked;
}

export function rollOffer(techAccount, content, direction, rng, factionPlanets, { exclude = [] } = {}) {
  const roll = typeof rng === "function" ? rng : defaultRng;
  const excludeSet = new Set(exclude);
  let frontier = frontierTechs(techAccount, content, direction);
  if (excludeSet.size && frontier.length > OFFER_SIZE) {
    const filtered = frontier.filter((id) => !excludeSet.has(id));
    if (filtered.length >= 1) frontier = filtered;
  }
  const candidates = weightedSample(frontier, OFFER_SIZE, roll, (id) => {
    const def = resolveTechDef(content, id);
    return offerWeight(def, factionPlanets);
  });
  return { candidates, rerolled: false };
}

function offerStale(offer, techAccount, content, direction) {
  if (!offer || !Array.isArray(offer.candidates)) return true;
  const frontier = new Set(frontierTechs(techAccount, content, direction));
  for (const id of offer.candidates) {
    if ((techAccount.unlockedTechs || []).includes(id)) return true;
    if (!frontier.has(id)) return true;
  }
  return false;
}

/**
 * Lazily fill any direction with no current offer, or an offer whose
 * candidates are now researched / no longer on the frontier.
 */
export function ensureOffers(techAccount, content, opts = {}) {
  const rng = opts.rng;
  const factionPlanets = opts.factionPlanets;
  let currentOffers = { ...(techAccount.currentOffers || {}) };
  let changed = false;
  for (const direction of TECH_DIRECTIONS) {
    const offer = currentOffers[direction];
    if (!offerStale(offer, techAccount, content, direction)) continue;
    currentOffers[direction] = rollOffer(techAccount, content, direction, rng, factionPlanets);
    changed = true;
  }
  if (!changed) return { techAccount, changed: false };
  return { techAccount: { ...techAccount, currentOffers }, changed: true };
}

export function rerollOffer(techAccount, content, direction, rng, factionPlanets) {
  if (!isTechDirection(direction)) return { ok: false, error: "unknown direction" };
  const ensured = ensureOffers(techAccount, content, { rng, factionPlanets });
  const account = ensured.techAccount;
  const offer = account.currentOffers?.[direction];
  if (offer?.rerolled) return { ok: false, error: "already rerolled this offer" };
  const next = rollOffer(account, content, direction, rng, factionPlanets, {
    exclude: offer?.candidates || [],
  });
  next.rerolled = true;
  return {
    ok: true,
    techAccount: {
      ...account,
      currentOffers: { ...account.currentOffers, [direction]: next },
    },
  };
}

export function regenerateDirectionOffer(techAccount, content, direction, rng, factionPlanets) {
  if (!isTechDirection(direction)) return techAccount;
  const next = rollOffer(techAccount, content, direction, rng, factionPlanets);
  return {
    ...techAccount,
    currentOffers: { ...(techAccount.currentOffers || {}), [direction]: next },
  };
}

export function techInOffer(techAccount, techId, direction) {
  if (!direction) return true;
  const candidates = techAccount?.currentOffers?.[direction]?.candidates || [];
  return candidates.includes(techId);
}
