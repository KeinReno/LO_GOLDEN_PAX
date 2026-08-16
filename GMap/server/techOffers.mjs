/**
 * Research offers — 3 frontier candidates per player-facing direction.
 * A–F stay the economy mechanic; grouping axis is tech_directions.json.
 * Port of v0.5 offer/reroll/bypass behavior (not files). Legacy A–F
 * offer keys migrate into Industry.
 */
import { getContent } from "./contentLoader.mjs";
import { randomInt } from "node:crypto";
import { checkPathGate, factionPrimaryRaceId, pathOpensFromTech } from "./techPaths.mjs";
import {
  groupOffersByDirection,
  listDirectionIds,
  migrateOfferKeys,
  normalizeOfferAxis,
  resolveTechDirection,
} from "./techDirections.mjs";

export const OFFER_SIZE = 3;
export const OFFER_BYPASS_COGNITIO_MULT = 1.5;
export const RACE_AFFINITY_WEIGHT = 2.5;
export const FALLBACK_OFFER_AXES = Object.freeze([
  "industry",
  "military",
  "culture",
  "commerce",
  "diplomacy",
  "governance",
]);

function defaultRng() {
  return randomInt(0, 1_000_000) / 1_000_000;
}

export function listOfferAxes(content) {
  const ids = listDirectionIds(content || getContent());
  return ids.length ? ids : [...FALLBACK_OFFER_AXES];
}

export function isOfferAxis(value, content) {
  return Boolean(normalizeOfferAxis(value, content || getContent()));
}

function isAlchemyTech(def) {
  if (!def) return false;
  if (def.alchemyOnly) return true;
  const tags = def.tags || [];
  return tags.includes("alchemy") || tags.includes("combo");
}

/**
 * Direction this tech participates in for offers. Null = not in the offer
 * system (listed cost, never a bypass). Breakthroughs that open a path,
 * alchemy, and catalogPending stubs stay out of the efficient 3.
 * Untagged live A–F techs map to Industry via tech_directions.json.
 */
export function techOfferAxis(def, content) {
  if (!def) return null;
  if (def.catalogPending) return null;
  if (isAlchemyTech(def)) return null;
  if (pathOpensFromTech(def)) return null;
  return resolveTechDirection(def, content);
}

function affinityTags(def) {
  if (Array.isArray(def?.raceAffinity) && def.raceAffinity.length) {
    return def.raceAffinity.map(String);
  }
  const tags = (def?.tags || []).filter((t) => String(t).startsWith("race_"));
  if (def?.raceLock) tags.push(String(def.raceLock));
  return tags;
}

export function offerWeight(def, faction) {
  const raceId = factionPrimaryRaceId(faction);
  if (!raceId) return 1;
  return affinityTags(def).includes(raceId) ? RACE_AFFINITY_WEIGHT : 1;
}

/**
 * Techs that can appear in this category's offer: matching category,
 * not catalogPending, not alchemy, not researched, prereqs met, path gate ok.
 */
export function frontierTechs(eco, content, axis, opts = {}) {
  const dir = normalizeOfferAxis(axis, content) || axis;
  const unlocked = eco?.unlockedTechs || [];
  const out = [];
  for (const def of Object.values(content?.technologies || {})) {
    if (!def?.id) continue;
    if (techOfferAxis(def, content) !== dir) continue;
    if (unlocked.includes(def.id)) continue;
    const missing = (def.prerequisites || []).some((pre) => !unlocked.includes(pre));
    if (missing) continue;
    const pathGate = checkPathGate(def, eco, content);
    if (!pathGate.ok) continue;
    if (typeof opts.isEligible === "function" && !opts.isEligible(def)) continue;
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

export function rollOffer(eco, content, axis, opts = {}) {
  const roll = typeof opts.rng === "function" ? opts.rng : defaultRng;
  const excludeSet = new Set(opts.exclude || []);
  let frontier = frontierTechs(eco, content, axis, opts);
  if (excludeSet.size && frontier.length > OFFER_SIZE) {
    const filtered = frontier.filter((id) => !excludeSet.has(id));
    if (filtered.length >= 1) frontier = filtered;
  }
  const candidates = weightedSample(frontier, OFFER_SIZE, roll, (id) => {
    const def = content?.technologies?.[id];
    return offerWeight(def, opts.faction);
  });
  return { candidates, rerolled: false };
}

function offerStale(offer, eco, content, axis, opts = {}) {
  if (!offer || !Array.isArray(offer.candidates)) return true;
  const frontier = new Set(frontierTechs(eco, content, axis, opts));
  for (const id of offer.candidates) {
    if ((eco.unlockedTechs || []).includes(id)) return true;
    if (!frontier.has(id)) return true;
  }
  return false;
}

export function ensureOffers(eco, content, opts = {}) {
  if (!eco.currentOffers || typeof eco.currentOffers !== "object") {
    eco.currentOffers = {};
  }
  let changed = migrateOfferKeys(eco, content);
  for (const axis of listOfferAxes(content)) {
    const offer = eco.currentOffers[axis];
    if (!offerStale(offer, eco, content, axis, opts)) continue;
    eco.currentOffers[axis] = rollOffer(eco, content, axis, opts);
    changed = true;
  }
  return { eco, changed };
}

export function rerollOffer(eco, content, axis, opts = {}) {
  const dir = normalizeOfferAxis(axis, content);
  if (!dir) return { ok: false, error: "unknown direction" };
  ensureOffers(eco, content, opts);
  const offer = eco.currentOffers?.[dir];
  if (offer?.rerolled) return { ok: false, error: "already rerolled this offer" };
  const next = rollOffer(eco, content, dir, {
    ...opts,
    exclude: offer?.candidates || [],
  });
  next.rerolled = true;
  eco.currentOffers = { ...eco.currentOffers, [dir]: next };
  return { ok: true, eco };
}

export function regenerateAxisOffer(eco, content, axis, opts = {}) {
  const dir = normalizeOfferAxis(axis, content);
  if (!dir) return eco;
  eco.currentOffers = {
    ...(eco.currentOffers || {}),
    [dir]: rollOffer(eco, content, dir, opts),
  };
  return eco;
}

export function techInOffer(eco, techId, axis) {
  if (!axis) return true;
  const dir = normalizeOfferAxis(axis) || axis;
  const grouped = groupOffersByDirection(eco?.currentOffers);
  const candidates =
    grouped[dir]?.candidates || eco?.currentOffers?.[dir]?.candidates || [];
  return candidates.includes(techId);
}

export function applyOfferBypass(cost, offerBypass, mult = OFFER_BYPASS_COGNITIO_MULT) {
  const out = { ...(cost || {}) };
  if (!offerBypass) return out;
  const cogn = Number(out["currency.cognitio"] || 0);
  if (cogn) out["currency.cognitio"] = Math.ceil(cogn * mult);
  return out;
}

export function publicOffersSlice(eco, content) {
  return groupOffersByDirection(eco?.currentOffers, content || getContent());
}
