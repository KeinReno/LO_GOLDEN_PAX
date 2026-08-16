/**
 * Live GM market rates (override content placeholder_rates).
 * Stored in data/market-rates.json: { rates: [{ pair, buy, sell, note? }] }
 * v0.5: fx.* pairs from fxExchange (EMA) are merged unless GM override covers them.
 */
import path from "node:path";
import {
  DATA_DIR,
  readJson,
  writeJson,
  ensureDataDir,
  bumpTableRevision,
} from "./tableStore.mjs";
import { getFxRateRows, readFxExchangeState } from "./fxExchange.mjs";

export const MARKET_RATES_PATH = path.join(DATA_DIR, "market-rates.json");

/** @typedef {{ pair: string, buy: number, sell: number, note?: string }} MarketRateRow */

export function readMarketRatesFile() {
  ensureDataDir();
  const raw = readJson(MARKET_RATES_PATH, null);
  if (!raw || !Array.isArray(raw.rates) || raw.rates.length === 0) {
    return null;
  }
  return {
    rates: raw.rates,
    updatedAt: raw.updatedAt ?? null,
  };
}

export function getContentDefaultRates(content) {
  return content?.economy_schema?.market?.placeholder_rates ?? [];
}

function mergeRateLists(base, fxRows) {
  const byPair = new Map();
  for (const row of base || []) {
    if (row?.pair) byPair.set(row.pair, row);
  }
  for (const row of fxRows || []) {
    if (!row?.pair) continue;
    // GM/content row wins if already present for that exact pair.
    if (!byPair.has(row.pair)) byPair.set(row.pair, row);
  }
  return [...byPair.values()];
}

/** Effective rates: live override file, else content defaults, plus computed fx.*. */
export function getEffectiveMarketRates(content) {
  const override = readMarketRatesFile();
  const base = override?.rates?.length
    ? override.rates
    : getContentDefaultRates(content);
  return mergeRateLists(base, getFxRateRows());
}

export function getMarketRatesPayload(content) {
  const override = readMarketRatesFile();
  const fxState = readFxExchangeState();
  const rates = getEffectiveMarketRates(content);
  return {
    rates,
    source: override?.rates?.length
      ? "override+fx"
      : fxState.rates?.length
        ? "content+fx"
        : "content",
    updatedAt: override?.updatedAt ?? fxState.updatedAt ?? null,
    fx: {
      variant: fxState.variant || content?.economy_schema?.fx_exchange?.variant || null,
      credits: fxState.credits || {},
      turn: fxState.turn ?? null,
    },
  };
}

function normalizeRateRow(row) {
  const pair = String(row?.pair ?? "").trim();
  const buy = Number(row?.buy);
  const sell = Number(row?.sell);
  if (!pair || !Number.isFinite(buy) || buy <= 0 || !Number.isFinite(sell) || sell <= 0) {
    return null;
  }
  const out = { pair, buy, sell };
  const note = String(row?.note ?? "").trim();
  if (note) out.note = note;
  return out;
}

/** Replace live rates array (master-only). */
export function writeMarketRates(rates) {
  if (!Array.isArray(rates)) {
    return { ok: false, error: "rates must be an array" };
  }
  const cleaned = rates.map(normalizeRateRow).filter(Boolean);
  if (cleaned.length === 0) {
    return { ok: false, error: "no valid rates" };
  }
  const updatedAt = new Date().toISOString();
  writeJson(MARKET_RATES_PATH, { rates: cleaned, updatedAt });
  bumpTableRevision();
  return { ok: true, rates: cleaned, source: "override", updatedAt };
}
