/**
 * Treasury peg → metal/supply conversion.
 *
 * NEW design on top of GMap's dead `treasuryPeg` stub (`economyTick.mjs`
 * `resolveTreasuryPeg` recorded a peg and never converted). This is not a
 * port of GMap's `fxExchange.mjs` EC formula — that port still exists for
 * *cross-faction reference quotes* (`fxExchange.mjs` / market rates).
 * Income conversion uses the grill's non-linear dominance formula
 * (`notes/2026-08-13-currency-peg-grill.md` Q4/Q5; `agent-tasks/CURRENCY_PEG_SPEC.md`).
 *
 * `strategicResourceIdSet` / `resolveTreasuryPeg` remain GMap ports (parity
 * tests). Everything below `pegExchangeRate` is NOT a port.
 *
 * First-pass numerics live in `content/core/economy_balance.json` →
 * `currencyPeg` (fallbacks below match that file). Revisit if a 90% holder
 * is too strong vs a 10% holder, or if scarce pegs mint too much metal.
 */
import { instantPegCredit, fxExchangeCfg } from "./fxExchange.mjs";

/** @deprecated use content.economy_balance.currencyPeg — kept as test/fallback defaults. */
export const PEG_TRANSITION_START = 0.5;
export const PEG_TRANSITION_TURNS = 5;
export const PEG_BASE_RATE = 1;
export const PEG_DOMINANCE_K = 1.5;
export const PEG_RARITY_REF = 20;
export const PEG_RARITY_EXP = 0.35;
export const PEG_RATE_MIN = 0.01;
export const PEG_RATE_MAX = 12;
export const GM_PEG_MULT_MIN = 0.8;
export const GM_PEG_MULT_MAX = 1.5;
export const GM_PEG_MULT_DEFAULT = 1;

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function pegCfg(content) {
  const c = content?.economy_balance?.currencyPeg || {};
  return {
    baseRate: num(c.baseRate, PEG_BASE_RATE),
    dominanceK: num(c.dominanceK, PEG_DOMINANCE_K),
    rarityRef: num(c.rarityRef, PEG_RARITY_REF),
    rarityExp: num(c.rarityExp, PEG_RARITY_EXP),
    rateMin: num(c.rateMin, PEG_RATE_MIN),
    rateMax: num(c.rateMax, PEG_RATE_MAX),
    gmMin: num(c.gmMultiplierMin, GM_PEG_MULT_MIN),
    gmMax: num(c.gmMultiplierMax, GM_PEG_MULT_MAX),
    gmDefault: num(c.gmMultiplierDefault, GM_PEG_MULT_DEFAULT),
    transitionStart: num(c.transitionStart, PEG_TRANSITION_START),
    transitionTurns: num(c.transitionTurns, PEG_TRANSITION_TURNS),
  };
}

/**
 * Strategic map resource ids. Ported from GMap/server/flowEngine.mjs's
 * `strategicResourceIdSet` (content argument required — no getContent()).
 */
export function strategicResourceIdSet(content) {
  const ids = new Set(content?.economy_schema?.resource_ranks?.strategic || []);
  for (const def of Object.values(content?.map_resources || {})) {
    if (!def?.id) continue;
    if (def.rank === "strategic" || def.strategic === true) ids.add(def.id);
  }
  return ids;
}

/** Faction treasury peg from the faction object or content bindings. Ported from GMap economyTick.mjs. */
export function resolveTreasuryPeg(fac, content) {
  if (typeof fac?.treasuryPeg === "string" && fac.treasuryPeg.trim()) {
    return fac.treasuryPeg.trim();
  }
  if (typeof fac?.pegResourceId === "string" && fac.pegResourceId.trim()) {
    return fac.pegResourceId.trim();
  }
  const bind = content?.faction_currency_bindings?.bindings?.[fac?.id];
  if (typeof bind?.treasuryPeg === "string" && bind.treasuryPeg.trim()) {
    return bind.treasuryPeg.trim();
  }
  return null;
}

/**
 * Linear ramp from transitionStart → 1.0 over transitionTurns.
 * `pegChangedTurn == null` means this is the faction's first peg (or never
 * pegged) — full strength. Penalty applies only on a later *switch*.
 * NOT a port. Optional `content` reads authored defaults.
 */
export function pegTransitionMultiplier(pegChangedTurn, currentTurn, content) {
  const cfg = pegCfg(content);
  if (pegChangedTurn == null || !Number.isFinite(Number(pegChangedTurn))) return 1;
  const elapsed = Math.max(0, Number(currentTurn) - Number(pegChangedTurn));
  if (elapsed >= cfg.transitionTurns) return 1;
  return cfg.transitionStart + (1 - cfg.transitionStart) * (elapsed / cfg.transitionTurns);
}

/**
 * Bounded GM dial on a peg resource (per-resource, not per-faction).
 * Out-of-range / non-numeric values clamp to `[gmMin, gmMax]`; missing
 * values are 1. NOT a port.
 */
export function gmPegMultiplier(raw, content) {
  const cfg = pegCfg(content);
  if (raw == null || raw === "") return cfg.gmDefault;
  const n = Number(raw);
  if (!Number.isFinite(n)) return cfg.gmDefault;
  return Math.min(cfg.gmMax, Math.max(cfg.gmMin, n));
}

export function sumGlobalExtractionTotals(extractionByFaction) {
  const totals = {};
  const values =
    extractionByFaction instanceof Map ? extractionByFaction.values() : Object.values(extractionByFaction || {});
  for (const extracted of values) {
    for (const [id, amount] of Object.entries(extracted || {})) {
      totals[id] = (totals[id] || 0) + (Number(amount) || 0);
    }
  }
  return totals;
}

/** Floor this-turn strategic extraction into `map.*` stock deltas (barter pile). */
export function strategicExtractionStocks(extractionByResource, content) {
  const strategic = strategicResourceIdSet(content);
  const out = {};
  for (const [id, amt] of Object.entries(extractionByResource || {})) {
    if (!strategic.has(id)) continue;
    const units = Math.floor(Number(amt) || 0);
    if (units > 0) out[id] = units;
  }
  return out;
}

/**
 * Non-linear peg strength.
 *
 *   rate = baseRate · share^k · (rarityRef / globalTotal)^rarityExp · gmMult
 *
 * `k > 1` makes dominance superlinear: a 90% holder is more than 9× a 10%
 * holder of the same resource (not a flat/linear share). Rarity is inverse
 * in that resource's galactic volume — scarcer pegs convert harder.
 * Clamped to `[rateMin, rateMax]` so a near-zero global total cannot explode.
 *
 * `globalExtractionTotals` is `{ [resourceId]: galaxyTotal }`.
 * This faction's extraction is `faction.extractionByResource[resourceId]`
 * (or `extras.factionExtraction`).
 */
export function pegExchangeRate(faction, resourceId, globalExtractionTotals, content, extras = {}) {
  const cfg = pegCfg(content);
  if (!resourceId) return 0;
  const global = Number(globalExtractionTotals?.[resourceId] ?? 0);
  if (!(global > 0)) return 0;
  const extracted = Number(
    extras.factionExtraction ?? faction?.extractionByResource?.[resourceId] ?? faction?.extraction ?? 0,
  );
  if (!(extracted > 0)) return 0;
  const share = Math.min(1, extracted / global);
  const dominance = share ** cfg.dominanceK;
  const rarity = (cfg.rarityRef / global) ** cfg.rarityExp;
  const gm = gmPegMultiplier(extras.gmMultiplier ?? extras.gmMultipliers?.[resourceId], content);
  const rate = cfg.baseRate * dominance * rarity * gm;
  return Math.min(cfg.rateMax, Math.max(cfg.rateMin, rate));
}

/**
 * Uncapped amount × rate × transition → metal and supply. Used by
 * `convertPeggedResource`; the `rate` argument is the dominance formula
 * (or any other already-computed multiplier). NOT a port.
 */
export function convertPegExtractionToTreasury(extractionAmount, exchangeCredit, transitionMultiplier = 1) {
  const amount = Math.floor(
    Math.max(0, Number(extractionAmount) || 0) *
      Math.max(0, Number(exchangeCredit) || 0) *
      Math.max(0, Number(transitionMultiplier) || 0),
  );
  if (amount <= 0) return { "currency.metal": 0, "currency.supply": 0 };
  return { "currency.metal": amount, "currency.supply": amount };
}

/**
 * Uncapped peg-extraction → metal/supply using `pegExchangeRate`.
 * `ctx.globalExtractionTotals` should be galaxy-wide; omitted totals treat
 * this faction as the sole extractor (share = 1) so unit tests can call
 * the spec signature without a full campaign.
 */
export function convertPeggedResource(faction, amount, content, ctx = {}) {
  const pegId = resolveTreasuryPeg(faction, content);
  if (!pegId) return { "currency.metal": 0, "currency.supply": 0 };
  const extracted = Math.max(0, Number(amount) || 0);
  const totals =
    ctx.globalExtractionTotals && typeof ctx.globalExtractionTotals === "object"
      ? ctx.globalExtractionTotals
      : { [pegId]: extracted };
  const rate = pegExchangeRate(faction, pegId, totals, content, {
    factionExtraction: extracted,
    gmMultiplier: ctx.gmMultiplier,
    gmMultipliers: ctx.gmMultipliers,
  });
  const transition = pegTransitionMultiplier(faction?.pegChangedTurn, ctx.currentTurn ?? 0, content);
  return convertPegExtractionToTreasury(extracted, rate, transition);
}

/**
 * Convenience: EC for a peg from already-computed credits, falling back to
 * an instant credit when this peg isn't in the EMA table yet. Used by the
 * market/FX layer — not by income conversion.
 */
export function pegExchangeCredit(pegResourceId, fxState, reserves, extraction, content) {
  const existing = fxState?.credits?.[pegResourceId];
  if (Number.isFinite(Number(existing)) && Number(existing) > 0) return Number(existing);
  return instantPegCredit(reserves, extraction, fxExchangeCfg(content));
}
