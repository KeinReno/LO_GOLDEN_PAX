/**
 * Treasury peg → metal/supply conversion.
 *
 * NEW on top of the dead `treasuryPeg` stub in economyTick.mjs (the stub
 * recorded a peg channel and never converted). Not a port of fxExchange.mjs
 * EC quotes — those stay for cross-faction market display.
 *
 * Formula (CURRENCY_PEG_SPEC / grill Q4–Q5; same shape as v0.5):
 *
 *   rate = baseRate · share^k · (rarityRef / globalTotal)^rarityExp · gmMult
 *
 * First-pass numerics (`economy_balance.currencyPeg`, fallbacks below):
 *   k = 1.5, baseRate = 1, rarityRef = 20, rarityExp = 0.35
 *   rate clamp [0.01, 12], GM dial [0.8, 1.5] per peg resource
 *   peg-change ramp: N = 3 turns from transitionStart 0.5 → 1.0 (switch-only;
 *   first peg is full strength). Stored as faction.pegChangedTurn +
 *   lastTreasuryPeg — optional JSON fields, no published.json rewrite.
 *
 * GM dial: `world.meta.gmPegMultipliers[resourceId]`, clamped here.
 * HTTP: `POST /api/gm/peg-multiplier` (GM cockpit, master token).
 */
export const PEG_TRANSITION_START = 0.5;
export const PEG_TRANSITION_TURNS = 3;
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

/** Faction treasury peg from the faction object or content bindings. */
export function resolveTreasuryPeg(fac, content) {
  if (typeof fac?.treasuryPeg === "string" && fac.treasuryPeg.trim()) {
    return fac.treasuryPeg.trim();
  }
  const bind = content?.faction_currency_bindings?.bindings?.[fac?.id];
  if (typeof bind?.treasuryPeg === "string" && bind.treasuryPeg.trim()) {
    return bind.treasuryPeg.trim();
  }
  return null;
}

/**
 * Stamp a switch-only devaluation. First peg (no lastTreasuryPeg) is full
 * strength. Mutates `fac` so writeLiveBoard persists the fields.
 */
export function notePegSwitch(fac, pegId, turn) {
  if (!fac || typeof fac !== "object") return;
  const prev =
    typeof fac.lastTreasuryPeg === "string" && fac.lastTreasuryPeg.trim()
      ? fac.lastTreasuryPeg.trim()
      : null;
  const next = typeof pegId === "string" && pegId.trim() ? pegId.trim() : null;
  if (prev && next && prev !== next) {
    fac.pegChangedTurn = Number.isFinite(Number(turn)) ? Number(turn) : 0;
  }
  fac.lastTreasuryPeg = next;
}

/**
 * Linear ramp from transitionStart → 1.0 over N turns.
 * `pegChangedTurn == null` → full strength (never switched).
 */
export function pegTransitionMultiplier(pegChangedTurn, currentTurn, content) {
  const cfg = pegCfg(content);
  if (pegChangedTurn == null || !Number.isFinite(Number(pegChangedTurn))) return 1;
  const elapsed = Math.max(0, Number(currentTurn) - Number(pegChangedTurn));
  if (elapsed >= cfg.transitionTurns) return 1;
  return cfg.transitionStart + (1 - cfg.transitionStart) * (elapsed / cfg.transitionTurns);
}

/** Bounded GM dial on a peg resource. Missing / invalid → 1. */
export function gmPegMultiplier(raw, content) {
  const cfg = pegCfg(content);
  if (raw == null || raw === "") return cfg.gmDefault;
  const n = Number(raw);
  if (!Number.isFinite(n)) return cfg.gmDefault;
  return Math.min(cfg.gmMax, Math.max(cfg.gmMin, n));
}

/** Persist-safe copy of `world.meta.gmPegMultipliers` (each value clamped). */
export function normalizeGmPegMultipliers(raw, content) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [id, v] of Object.entries(raw)) {
    const key = typeof id === "string" ? id.trim() : "";
    if (!key) continue;
    out[key] = gmPegMultiplier(v, content);
  }
  return out;
}

/**
 * Set one GM peg dial. Clamp lives here, not in the UI.
 * Catalog check runs only when `content.map_resources` is present.
 */
export function applyGmPegMultiplier(meta, resourceId, multiplier, content, extras = {}) {
  const id = typeof resourceId === "string" ? resourceId.trim() : "";
  if (!id) return { ok: false, error: "resourceId required" };
  if (id === "currency.metal" || id === "currency.supply") {
    return { ok: false, error: "resourceId must be a map resource, not metal/supply" };
  }
  const catalog = content?.map_resources;
  if (catalog && typeof catalog === "object") {
    const known =
      extras.knownIds instanceof Set
        ? extras.knownIds
        : new Set(extras.knownIds || []);
    const inCatalog = Boolean(catalog[id]);
    const alreadySet = Boolean(meta?.gmPegMultipliers?.[id]);
    if (!inCatalog && !known.has(id) && !alreadySet) {
      return { ok: false, error: `unknown resourceId: ${id}` };
    }
  }
  if (multiplier == null || multiplier === "") {
    return { ok: false, error: "multiplier required" };
  }
  const requested = Number(multiplier);
  if (!Number.isFinite(requested)) {
    return { ok: false, error: "multiplier must be a number" };
  }
  const clamped = gmPegMultiplier(requested, content);
  const next = normalizeGmPegMultipliers(meta?.gmPegMultipliers, content);
  next[id] = clamped;
  return {
    ok: true,
    resourceId: id,
    multiplier: clamped,
    requested,
    gmPegMultipliers: next,
  };
}

export function sumGlobalExtractionTotals(extractionByFaction) {
  const totals = {};
  const values =
    extractionByFaction instanceof Map
      ? extractionByFaction.values()
      : Object.values(extractionByFaction || {});
  for (const extracted of values) {
    for (const [id, amount] of Object.entries(extracted || {})) {
      totals[id] = (totals[id] || 0) + (Number(amount) || 0);
    }
  }
  return totals;
}

/**
 * Non-linear peg strength. `k > 1` makes dominance superlinear: a 90% holder
 * is more than 9× a 10% holder of the same resource. Rarity is inverse in
 * galactic volume. Clamped so a near-zero global total cannot explode.
 */
export function pegExchangeRate(faction, resourceId, globalExtractionTotals, content, extras = {}) {
  const cfg = pegCfg(content);
  if (!resourceId) return 0;
  const global = Number(globalExtractionTotals?.[resourceId] ?? 0);
  if (!(global > 0)) return 0;
  const extracted = Number(
    extras.factionExtraction ??
      faction?.extractionByResource?.[resourceId] ??
      faction?.extraction ??
      0,
  );
  if (!(extracted > 0)) return 0;
  const share = Math.min(1, extracted / global);
  const dominance = share ** cfg.dominanceK;
  const rarity = (cfg.rarityRef / global) ** cfg.rarityExp;
  const gm = gmPegMultiplier(extras.gmMultiplier ?? extras.gmMultipliers?.[resourceId], content);
  const rate = cfg.baseRate * dominance * rarity * gm;
  return Math.min(cfg.rateMax, Math.max(cfg.rateMin, rate));
}

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
 * Uncapped peg-extraction → metal/supply. Omitted totals treat this faction
 * as the sole extractor (share = 1) so unit tests can omit a campaign.
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
  const transition = pegTransitionMultiplier(
    faction?.pegChangedTurn,
    ctx.currentTurn ?? 0,
    content,
  );
  return convertPegExtractionToTreasury(extracted, rate, transition);
}

/**
 * Tick helper: stamp a peg switch, then convert this-turn extraction.
 * Call AFTER all factions' strategic extraction is known (complete globals).
 */
export function applyTreasuryPegIncome(
  fac,
  strategicExtraction,
  globalExtractionTotals,
  content,
  extras = {},
) {
  const pegId = resolveTreasuryPeg(fac, content);
  notePegSwitch(fac, pegId, extras.currentTurn);
  if (!pegId || pegId === "currency.metal") {
    return { pegId, extracted: 0, "currency.metal": 0, "currency.supply": 0 };
  }
  const extracted = Math.max(0, Math.floor(Number(strategicExtraction?.[pegId]) || 0));
  const converted = convertPeggedResource(fac, extracted, content, {
    globalExtractionTotals,
    gmMultiplier: extras.gmMultiplier,
    gmMultipliers: extras.gmMultipliers,
    currentTurn: extras.currentTurn,
  });
  return { pegId, extracted, ...converted };
}
