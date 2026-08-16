/**
 * Economic-track relations for peg-to-peg exchange.
 *
 * NOT a port. GMap has one relation per faction pair and no currency-union
 * / exchange-deal types. Political relations stay in `treaties.mjs`; this
 * module names the two economic types, attaches bilateral deal terms, and
 * settles barter vs exchange-deal stock transfers. Track split lives in
 * `treaties.mjs` (`track` on each stance; same-track replaces).
 *
 * Three coexisting mechanisms (grill Q3):
 *   barterStrategicSwap     — 1:1-or-any raw `map.*` transfer, no treaty
 *   applyExchangeDeal       — `currency_exchange` with a frozen quote
 *   applyCurrencyUnion      — `currency_union`; caller persists adopted peg
 */
import { syncTreatiesFromEdge, stanceTrack } from "./treaties.mjs";
import { adjustStock } from "../economy/adjustStock.mjs";
import { strategicResourceIdSet } from "../economy/currencyPeg.mjs";

export const EXCHANGE_DEAL = "currency_exchange";
export const CURRENCY_UNION = "currency_union";

function isEconomicStance(stances, relation) {
  return stanceTrack(stances?.[relation]) === "economic";
}

/**
 * Formal bilateral exchange-rate deal. `unitsQuotePerBase` is how many
 * units of `quotePeg` one unit of `basePeg` buys (first-pass default 1).
 * Frozen on the treaty — it does not float with `pegExchangeRate`.
 */
export function applyExchangeDeal(factionA, factionB, turn, stances, dealTerms = {}) {
  if (!isEconomicStance(stances, EXCHANGE_DEAL)) {
    return { ok: false, error: "not_economic_relation", factionA, factionB };
  }
  const unitsQuotePerBase = Number(dealTerms.unitsQuotePerBase);
  const result = syncTreatiesFromEdge(factionA, factionB, EXCHANGE_DEAL, turn, stances, {
    treatyExtras: {
      basePeg: dealTerms.basePeg || factionA.pegResourceId || factionA.treasuryPeg || null,
      quotePeg: dealTerms.quotePeg || factionB.pegResourceId || factionB.treasuryPeg || null,
      unitsQuotePerBase: unitsQuotePerBase > 0 ? unitsQuotePerBase : 1,
    },
  });
  return { ok: true, ...result, relation: EXCHANGE_DEAL };
}

/**
 * Currency-union / absorption. Domain returns `adoptedPeg` (host's peg);
 * persistence of the joining faction's peg is the campaign-store caller's
 * job (domain never touches DB).
 */
export function applyCurrencyUnion(joining, host, turn, stances) {
  if (!isEconomicStance(stances, CURRENCY_UNION)) {
    return { ok: false, error: "not_economic_relation", factionA: joining, factionB: host };
  }
  const result = syncTreatiesFromEdge(joining, host, CURRENCY_UNION, turn, stances);
  const adoptedPeg = host.pegResourceId || host.treasuryPeg || null;
  return { ok: true, ...result, relation: CURRENCY_UNION, adoptedPeg };
}

export function findEconomicTreaty(faction, otherId, type) {
  return (faction?.diplomacy?.treaties || []).find((t) => t.withFactionId === otherId && t.type === type) || null;
}

function transfer(fromEco, toEco, currencyId, amount, meta) {
  const qty = Math.floor(Number(amount) || 0);
  if (qty <= 0) return { ok: false, error: "invalid_amount", fromEco, toEco };
  const debit = adjustStock(fromEco, currencyId, -qty, { ...meta, reason: meta.reason || "barter" });
  if (debit.appliedDelta !== -qty) {
    return { ok: false, error: "insufficient_stock", fromEco, toEco };
  }
  const credit = adjustStock(toEco, currencyId, qty, { ...meta, reason: meta.reason || "barter" });
  return {
    ok: true,
    fromEco: { ...fromEco, stocks: debit.stocks },
    toEco: { ...toEco, stocks: credit.stocks },
    journal: [debit.journalEntry, credit.journalEntry].filter(Boolean),
  };
}

/**
 * Direct barter of a raw strategic resource. No treaty, no conversion.
 * `give` moves from `fromEco` → `toEco`; optional `receive` is the reverse
 * leg (atomic: both succeed or neither applies).
 */
export function barterStrategicSwap(fromEco, toEco, give, receive, content, meta = {}) {
  const strategic = strategicResourceIdSet(content);
  if (!give?.resourceId || !strategic.has(give.resourceId)) {
    return { ok: false, error: "not_strategic_resource", fromEco, toEco };
  }
  if (receive?.resourceId && !strategic.has(receive.resourceId)) {
    return { ok: false, error: "not_strategic_resource", fromEco, toEco };
  }

  const giveAmt = Math.floor(Number(give.amount) || 0);
  const recvAmt = receive ? Math.floor(Number(receive.amount) || 0) : 0;
  if (giveAmt <= 0) return { ok: false, error: "invalid_amount", fromEco, toEco };
  if (receive && recvAmt <= 0) return { ok: false, error: "invalid_amount", fromEco, toEco };

  const probeGive = adjustStock(fromEco, give.resourceId, -giveAmt, { ...meta, reason: "barter" });
  if (probeGive.appliedDelta !== -giveAmt) return { ok: false, error: "insufficient_stock", fromEco, toEco };
  if (receive) {
    const probeRecv = adjustStock(toEco, receive.resourceId, -recvAmt, { ...meta, reason: "barter" });
    if (probeRecv.appliedDelta !== -recvAmt) return { ok: false, error: "insufficient_stock", fromEco, toEco };
  }

  let a = fromEco;
  let b = toEco;
  const journal = [];
  const outGive = transfer(a, b, give.resourceId, giveAmt, { ...meta, reason: "barter" });
  if (!outGive.ok) return outGive;
  a = outGive.fromEco;
  b = outGive.toEco;
  journal.push(...outGive.journal);
  if (receive) {
    const outRecv = transfer(b, a, receive.resourceId, recvAmt, { ...meta, reason: "barter" });
    if (!outRecv.ok) return { ok: false, error: outRecv.error, fromEco, toEco };
    b = outRecv.fromEco;
    a = outRecv.toEco;
    journal.push(...outRecv.journal);
  }
  return { ok: true, fromEco: a, toEco: b, journal };
}

/**
 * Settle a frozen exchange-deal: `fromEco` pays `amount` of the treaty's
 * `basePeg`; `toEco` pays `floor(amount * unitsQuotePerBase)` of `quotePeg`.
 * Distinct from barter (which has no stored rate).
 */
export function settleExchangeDeal(fromEco, toEco, amount, treaty, meta = {}) {
  if (!treaty || treaty.type !== EXCHANGE_DEAL) {
    return { ok: false, error: "no_exchange_deal", fromEco, toEco };
  }
  const basePeg = treaty.basePeg;
  const quotePeg = treaty.quotePeg;
  const rate = Number(treaty.unitsQuotePerBase) > 0 ? Number(treaty.unitsQuotePerBase) : 1;
  if (!basePeg || !quotePeg) return { ok: false, error: "deal_missing_pegs", fromEco, toEco };
  const giveAmt = Math.floor(Number(amount) || 0);
  const takeAmt = Math.floor(giveAmt * rate);
  if (giveAmt <= 0 || takeAmt <= 0) return { ok: false, error: "invalid_amount", fromEco, toEco };

  const probeGive = adjustStock(fromEco, basePeg, -giveAmt, { ...meta, reason: "exchange_deal" });
  if (probeGive.appliedDelta !== -giveAmt) return { ok: false, error: "insufficient_stock", fromEco, toEco };
  const probeTake = adjustStock(toEco, quotePeg, -takeAmt, { ...meta, reason: "exchange_deal" });
  if (probeTake.appliedDelta !== -takeAmt) return { ok: false, error: "insufficient_stock", fromEco, toEco };

  const outGive = transfer(fromEco, toEco, basePeg, giveAmt, { ...meta, reason: "exchange_deal" });
  if (!outGive.ok) return outGive;
  const outTake = transfer(outGive.toEco, outGive.fromEco, quotePeg, takeAmt, { ...meta, reason: "exchange_deal" });
  if (!outTake.ok) return { ok: false, error: outTake.error, fromEco, toEco };
  return { ok: true, fromEco: outTake.toEco, toEco: outTake.fromEco, journal: [...outGive.journal, ...outTake.journal], giveAmt, takeAmt };
}
