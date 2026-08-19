/**
 * Tax-tier queueing + stub market currency conversion + direct transfers.
 * Extracted from ../economyTick.mjs.
 */
import { getContent } from "../contentLoader.mjs";
import { readLedger, writeLedger, ensureFactionEco, adjustStock } from "../ledger.mjs";
import { getEffectiveMarketRates } from "../marketRates.mjs";
import { floor } from "./helpers.mjs";

export function queueTaxChange(factionId, taxSlot, tierId) {
  const content = getContent();
  const def = content.taxes?.[taxSlot];
  if (!def) return { ok: false, error: "unknown tax slot" };
  if (!def.tiers?.some((t) => t.id === tierId)) {
    return { ok: false, error: "unknown tier" };
  }
  const ledger = readLedger();
  const eco = ensureFactionEco(ledger, factionId);
  eco.pendingPolicy = eco.pendingPolicy || { taxes: {} };
  eco.pendingPolicy.taxes[taxSlot] = tierId;
  writeLedger(ledger);
  return { ok: true, eco };
}

/** Parse "currency.a → currency.b" from placeholder_rates pair string. */
function parseRatePair(pairStr) {
  const parts = String(pairStr || "")
    .split(/→|->/)
    .map((s) => s.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { from: parts[0], to: parts[1] };
}

/**
 * Resolve stub market rate for from→to. Forward uses sell; inverse uses buy.
 * @returns {{ direction: "forward"|"inverse", sell?: number, buy?: number } | null}
 */
export function lookupMarketRate(fromCurrency, toCurrency, content) {
  const rates = getEffectiveMarketRates(content);
  for (const row of rates) {
    const pair = parseRatePair(row.pair);
    if (!pair) continue;
    if (pair.from === fromCurrency && pair.to === toCurrency) {
      const sell = Number(row.sell ?? row.buy);
      if (!Number.isFinite(sell) || sell <= 0) return null;
      return { direction: "forward", sell, buy: Number(row.buy) };
    }
    if (pair.from === toCurrency && pair.to === fromCurrency) {
      const buy = Number(row.buy ?? row.sell);
      if (!Number.isFinite(buy) || buy <= 0) return null;
      return { direction: "inverse", buy, sell: Number(row.sell) };
    }
  }
  return null;
}

function computeMarketAmounts(rateInfo, amountFrom, amountTo) {
  if (rateInfo.direction === "forward") {
    const sell = rateInfo.sell;
    if (amountFrom != null && amountFrom > 0) {
      const from = floor(amountFrom);
      return { amountFrom: from, amountTo: floor(from * sell) };
    }
    if (amountTo != null && amountTo > 0) {
      const to = floor(amountTo);
      const from = Math.ceil(to / sell);
      return { amountFrom: from, amountTo: to };
    }
  } else {
    const buy = rateInfo.buy;
    if (amountFrom != null && amountFrom > 0) {
      const from = floor(amountFrom);
      return { amountFrom: from, amountTo: floor(from / buy) };
    }
    if (amountTo != null && amountTo > 0) {
      const to = floor(amountTo);
      const from = floor(to * buy);
      return { amountFrom: from, amountTo: to };
    }
  }
  return null;
}

export function marketConvert(
  factionId,
  fromCurrency,
  toCurrency,
  amountFrom,
  amountTo,
  turn,
  intentId,
) {
  if (!fromCurrency || !toCurrency) {
    return { ok: false, error: "currencies required" };
  }
  if (fromCurrency === toCurrency) {
    return { ok: false, error: "same currency" };
  }

  const content = getContent();
  const rateInfo = lookupMarketRate(fromCurrency, toCurrency, content);
  if (!rateInfo) return { ok: false, error: "rate_missing" };

  const amounts = computeMarketAmounts(rateInfo, amountFrom, amountTo);
  if (!amounts || amounts.amountFrom <= 0 || amounts.amountTo <= 0) {
    return { ok: false, error: "amount too small" };
  }

  const ledger = readLedger();
  ensureFactionEco(ledger, factionId);
  const have = ledger.factions[factionId].stocks[fromCurrency] ?? 0;
  if (have < amounts.amountFrom) {
    return { ok: false, error: "insufficient funds" };
  }

  adjustStock(ledger, factionId, fromCurrency, -amounts.amountFrom, {
    turn,
    reason: "market_convert_out",
    intentId,
  });
  adjustStock(ledger, factionId, toCurrency, amounts.amountTo, {
    turn,
    reason: "market_convert_in",
    intentId,
  });
  writeLedger(ledger);
  return { ok: true, ...amounts, rate: rateInfo };
}

export function transferResources(fromId, toId, currencyId, amount, turn, intentId) {
  const amt = floor(amount);
  if (amt <= 0) return { ok: false, error: "amount must be > 0" };
  const ledger = readLedger();
  ensureFactionEco(ledger, fromId);
  ensureFactionEco(ledger, toId);
  const have = ledger.factions[fromId].stocks[currencyId] ?? 0;
  if (have < amt) return { ok: false, error: "insufficient funds" };
  adjustStock(ledger, fromId, currencyId, -amt, {
    turn,
    reason: "transfer_out",
    intentId,
  });
  adjustStock(ledger, toId, currencyId, amt, {
    turn,
    reason: "transfer_in",
    intentId,
  });
  writeLedger(ledger);
  return { ok: true };
}
