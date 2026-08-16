/**
 * v0.5 FX exchange via Exchange Credit (EC).
 * Pegged fx.* currencies quote through EC = f(global peg reserves, tick extraction).
 * Default inertia: EMA (alpha from economy_schema.fx_exchange).
 */
import path from "node:path";
import {
  DATA_DIR,
  readJson,
  writeJson,
  ensureDataDir,
  bumpTableRevision,
} from "./tableStore.mjs";

export const FX_EXCHANGE_PATH = path.join(DATA_DIR, "fx-exchange.json");

function cfgFromContent(content) {
  const fx = content?.economy_schema?.fx_exchange || {};
  const credit = fx.credit || {};
  return {
    alpha: Math.min(1, Math.max(0.05, Number(fx.alpha) || 0.25)),
    reserveWeight: Number(credit.reserveWeight) || 1,
    extractionWeight: Number(credit.extractionWeight) || 2,
    floor: Math.max(0.01, Number(credit.floor) || 0.25),
  };
}

/** Instant EC for one peg commodity. */
export function instantPegCredit(reserves, extraction, cfg) {
  const r = Math.max(0, Number(reserves) || 0);
  const e = Math.max(0, Number(extraction) || 0);
  const raw =
    cfg.reserveWeight * Math.log1p(r) +
    cfg.extractionWeight * Math.log1p(e);
  return Math.max(cfg.floor, raw);
}

export function readFxExchangeState() {
  ensureDataDir();
  const raw = readJson(FX_EXCHANGE_PATH, null);
  if (!raw || typeof raw !== "object") {
    return { credits: {}, rates: [], updatedAt: null, turn: null, variant: null };
  }
  return {
    credits: raw.credits && typeof raw.credits === "object" ? raw.credits : {},
    rates: Array.isArray(raw.rates) ? raw.rates : [],
    updatedAt: raw.updatedAt ?? null,
    turn: raw.turn ?? null,
    variant: raw.variant ?? null,
  };
}

function peggedFxCurrencies(content) {
  const out = [];
  const map = content?.faction_currencies || {};
  for (const def of Object.values(map)) {
    if (!def?.id || !def.peg) continue;
    out.push({ id: def.id, peg: String(def.peg), name: def.name || def.id });
  }
  return out;
}

function globalPegReserves(ledger, pegId) {
  let sum = 0;
  for (const fac of Object.values(ledger?.factions || {})) {
    sum += Number(fac?.stocks?.[pegId] ?? 0);
  }
  return sum;
}

/**
 * Refresh EMA credits + bilateral fx rates after economy tick.
 * @param {object} extractionByPeg — { [pegResourceId]: number } this turn totals
 */
export function refreshFxExchange(content, ledger, extractionByPeg = {}, turn = null) {
  const cfg = cfgFromContent(content);
  const prev = readFxExchangeState();
  const pegged = peggedFxCurrencies(content);
  const pegIds = [...new Set(pegged.map((p) => p.peg))];
  const credits = { ...prev.credits };

  for (const pegId of pegIds) {
    const reserves = globalPegReserves(ledger, pegId);
    const extraction = Number(extractionByPeg[pegId] || 0);
    const instant = instantPegCredit(reserves, extraction, cfg);
    const old = Number(credits[pegId]);
    const next =
      Number.isFinite(old) && old > 0
        ? cfg.alpha * instant + (1 - cfg.alpha) * old
        : instant;
    credits[pegId] = Math.max(cfg.floor, next);
  }

  /** Pair rates via EC: buy = how many B per 1 A (approx). */
  const rates = [];
  for (let i = 0; i < pegged.length; i++) {
    for (let j = 0; j < pegged.length; j++) {
      if (i === j) continue;
      const a = pegged[i];
      const b = pegged[j];
      if (a.peg === b.peg) continue;
      const ca = credits[a.peg] || cfg.floor;
      const cb = credits[b.peg] || cfg.floor;
      const mid = ca / cb;
      const buy = Math.max(0.01, mid);
      const sell = Math.max(0.01, mid * 0.92);
      rates.push({
        pair: `${a.id} → ${b.id}`,
        buy: Number(buy.toFixed(4)),
        sell: Number(sell.toFixed(4)),
        note: `EC ${a.peg}↔${b.peg} (EMA α=${cfg.alpha})`,
      });
    }
  }

  const updatedAt = new Date().toISOString();
  const state = { credits, rates, updatedAt, turn, variant: "ema_inertia" };
  writeJson(FX_EXCHANGE_PATH, state);
  bumpTableRevision();
  return state;
}

/**
 * Frozen-quote seed: how many units of `quotePeg` one unit of `basePeg` buys,
 * from Exchange Credit (EMA credits). Missing credits → 1.
 */
export function unitsQuotePerBase(basePeg, quotePeg, state = null) {
  if (!basePeg || !quotePeg || basePeg === quotePeg) return 1;
  const credits = (state || readFxExchangeState()).credits || {};
  const ca = Number(credits[basePeg]);
  const cb = Number(credits[quotePeg]);
  if (!(ca > 0) || !(cb > 0)) return 1;
  return Math.max(0.01, ca / cb);
}

/** Fx rate rows for market payload (computed; GM override still wins for non-fx). */
export function getFxRateRows() {
  return readFxExchangeState().rates || [];
}
