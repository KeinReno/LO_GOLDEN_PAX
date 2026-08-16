/**
 * Live GM market rates (override content placeholder_rates), merged with
 * computed fx.* pair rows. Ported from `GMap/server/marketRates.mjs`.
 *
 * GMap reads/writes `data/market-rates.json` and pulls fx rows from the
 * fx-exchange JSON file. This port is pure: override rates and fx rows are
 * arguments; `server/campaign/fxExchangeStore.mjs` persists them.
 * `mergeRateLists` / `normalizeRateRow` match GMap (GM/content row wins
 * for an exact pair). The general `economy_schema.market` order-book is
 * marked `"status": "stub"` in content — out of scope here, same as GMap.
 */

export function getContentDefaultRates(content) {
  return content?.economy_schema?.market?.placeholder_rates ?? [];
}

export function mergeRateLists(base, fxRows) {
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

/** Effective rates: live override, else content defaults, plus computed fx.*. */
export function getEffectiveMarketRates(content, overrideRates, fxRateRows) {
  const base = overrideRates?.length ? overrideRates : getContentDefaultRates(content);
  return mergeRateLists(base, fxRateRows);
}

export function getMarketRatesPayload(content, override, fxState) {
  const rates = getEffectiveMarketRates(content, override?.rates, fxState?.rates);
  return {
    rates,
    source: override?.rates?.length
      ? "override+fx"
      : fxState?.rates?.length
        ? "content+fx"
        : "content",
    updatedAt: override?.updatedAt ?? fxState?.updatedAt ?? null,
    fx: {
      variant: fxState?.variant || content?.economy_schema?.fx_exchange?.variant || null,
      credits: fxState?.credits || {},
      turn: fxState?.turn ?? null,
    },
  };
}

export function normalizeRateRow(row) {
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

/** Validate/clean a GM override array. Persistence is the store's job. */
export function sanitizeMarketRates(rates) {
  if (!Array.isArray(rates)) {
    return { ok: false, error: "rates must be an array" };
  }
  const cleaned = rates.map(normalizeRateRow).filter(Boolean);
  if (cleaned.length === 0) {
    return { ok: false, error: "no valid rates" };
  }
  return { ok: true, rates: cleaned };
}
