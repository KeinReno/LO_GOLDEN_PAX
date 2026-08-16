/**
 * Economic-track relations (barter / frozen quote / currency union).
 *
 * Political treaties stay on world.diplomacy edges + opinionTick.
 * This module keys economic treaties by (pair, track) via syncTreatiesFromEdge.
 * Union income is additive metal/supply (fx EC × currencyPeg) — not a
 * redirect of A–F category income. Peg conversion + GM dial stay in currencyPeg.mjs.
 */
import {
  syncTreatiesFromEdge,
  breakTreaty,
  stanceTrack,
  treatyTrack,
  TRACK_ECONOMIC,
} from "./opinionTick.mjs";
import {
  ensureFactionEco,
  adjustStock,
  readLedger,
  writeLedger,
} from "./ledger.mjs";
import {
  resolveTreasuryPeg,
  notePegSwitch,
  pegExchangeRate,
  pegTransitionMultiplier,
} from "./currencyPeg.mjs";
import { getContent } from "./contentLoader.mjs";
import {
  unitsQuotePerBase as fxUnitsQuotePerBase,
  refreshFxExchange,
  readFxExchangeState,
} from "./fxExchange.mjs";

export const EXCHANGE_DEAL = "currency_exchange";
export const CURRENCY_UNION = "currency_union";

const DEFAULT_UNION_SHARE = 0.1;

function strategicResourceIdSet(content) {
  const c = content || {};
  const ids = new Set(c.economy_schema?.resource_ranks?.strategic || []);
  for (const def of Object.values(c.map_resources || {})) {
    if (!def?.id) continue;
    if (def.rank === "strategic" || def.strategic === true) ids.add(def.id);
  }
  return ids;
}

function stancesOf(content) {
  return content?.diplomacy_stances || getContent()?.diplomacy_stances || {};
}

function isEconomicStance(stances, relation) {
  return stanceTrack(stances?.[relation]) === TRACK_ECONOMIC;
}

export function findEconomicTreaty(faction, otherId, type) {
  return (
    (faction?.diplomacy?.treaties || []).find(
      (t) =>
        t.withFactionId === otherId &&
        t.type === type &&
        treatyTrack(t) === TRACK_ECONOMIC,
    ) || null
  );
}

export function unionIncomeShare(content) {
  const n = Number(content?.economy_balance?.currencyPeg?.unionIncomeShare);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_UNION_SHARE;
  return Math.min(1, n);
}

function fxCredit(fxState, pegId) {
  const n = Number(fxState?.credits?.[pegId]);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function spendable(ledger, factionId, currencyId) {
  const eco = ensureFactionEco(ledger, factionId);
  const cur = Math.floor(Number(eco.stocks[currencyId] ?? 0) || 0);
  const reserved = eco.stockReserves?.[currencyId];
  const reserveAmt = Math.max(0, Math.floor(Number(reserved?.amount ?? 0) || 0));
  return Math.max(0, cur - reserveAmt);
}

function fac(world, id) {
  return (world.factions ?? []).find((f) => f.id === id) || null;
}

/**
 * Formal bilateral exchange-rate deal. Frozen quote on the treaty —
 * does not float with pegExchangeRate / fx EMA.
 */
export function applyExchangeDeal(world, factionAId, factionBId, turn, dealTerms = {}, content) {
  const c = content || dealTerms.content || getContent();
  const stances = stancesOf(c);
  if (!isEconomicStance(stances, EXCHANGE_DEAL)) {
    return { ok: false, error: "not_economic_relation" };
  }
  const a = fac(world, factionAId);
  const b = fac(world, factionBId);
  if (!a || !b) return { ok: false, error: "faction_not_found" };

  const basePeg = dealTerms.basePeg || resolveTreasuryPeg(a, c) || null;
  const quotePeg = dealTerms.quotePeg || resolveTreasuryPeg(b, c) || null;
  let frozen = Number(dealTerms.unitsQuotePerBase);
  if (!(frozen > 0)) {
    frozen = fxUnitsQuotePerBase(basePeg, quotePeg, dealTerms.fxState || null);
  }
  syncTreatiesFromEdge(world, factionAId, factionBId, EXCHANGE_DEAL, turn, stances, {
    treatyExtras: {
      basePeg,
      quotePeg,
      unitsQuotePerBase: frozen > 0 ? frozen : 1,
    },
  });
  return {
    ok: true,
    relation: EXCHANGE_DEAL,
    factionA: a,
    factionB: b,
    unitsQuotePerBase: frozen > 0 ? frozen : 1,
    basePeg,
    quotePeg,
  };
}

/**
 * Currency-union / absorption. Joiner adopts host treasuryPeg (switch
 * penalty via notePegSwitch). Category A–F income is not redirected.
 */
export function applyCurrencyUnion(world, joiningId, hostId, turn, stancesOrContent, opts = {}) {
  const content =
    opts.content ||
    (stancesOrContent?.economy_balance || stancesOrContent?.diplomacy_stances
      ? stancesOrContent
      : null) ||
    getContent();
  const stances = stancesOrContent?.currency_union
    ? stancesOrContent
    : stancesOf(content);
  if (!isEconomicStance(stances, CURRENCY_UNION)) {
    return { ok: false, error: "not_economic_relation" };
  }
  const joining = fac(world, joiningId);
  const host = fac(world, hostId);
  if (!joining || !host) return { ok: false, error: "faction_not_found" };

  const adoptedPeg = resolveTreasuryPeg(host, content);
  if (!adoptedPeg) return { ok: false, error: "host_has_no_peg" };

  syncTreatiesFromEdge(world, joiningId, hostId, CURRENCY_UNION, turn, stances, {
    treatyExtras: {
      hostPeg: adoptedPeg,
      hostFactionId: hostId,
      joiningFactionId: joiningId,
    },
  });
  notePegSwitch(joining, adoptedPeg, turn);
  joining.treasuryPeg = adoptedPeg;
  return {
    ok: true,
    relation: CURRENCY_UNION,
    adoptedPeg,
    factionA: joining,
    factionB: host,
  };
}

export function breakEconomicTreaty(world, breakerId, otherId, turn, content) {
  breakTreaty(world, breakerId, otherId, turn, stancesOf(content), {
    track: TRACK_ECONOMIC,
  });
  return { ok: true };
}

/**
 * Direct barter of a raw strategic resource. No treaty.
 * `give` from fromId → toId; optional `receive` is the reverse leg (atomic).
 */
export function barterStrategicSwap(ledger, fromId, toId, give, receive, content, meta = {}) {
  const strategic = strategicResourceIdSet(content);
  if (!give?.resourceId || !strategic.has(give.resourceId)) {
    return { ok: false, error: "not_strategic_resource" };
  }
  if (receive?.resourceId && !strategic.has(receive.resourceId)) {
    return { ok: false, error: "not_strategic_resource" };
  }

  const giveAmt = Math.floor(Number(give.amount) || 0);
  const recvAmt = receive ? Math.floor(Number(receive.amount) || 0) : 0;
  if (giveAmt <= 0) return { ok: false, error: "invalid_amount" };
  if (receive && recvAmt <= 0) return { ok: false, error: "invalid_amount" };
  if (spendable(ledger, fromId, give.resourceId) < giveAmt) {
    return { ok: false, error: "insufficient_stock" };
  }
  if (receive && spendable(ledger, toId, receive.resourceId) < recvAmt) {
    return { ok: false, error: "insufficient_stock" };
  }

  adjustStock(ledger, fromId, give.resourceId, -giveAmt, { ...meta, reason: "barter" });
  adjustStock(ledger, toId, give.resourceId, giveAmt, { ...meta, reason: "barter" });
  if (receive) {
    adjustStock(ledger, toId, receive.resourceId, -recvAmt, { ...meta, reason: "barter" });
    adjustStock(ledger, fromId, receive.resourceId, recvAmt, { ...meta, reason: "barter" });
  }
  return {
    ok: true,
    fromStocks: { ...ensureFactionEco(ledger, fromId).stocks },
    toStocks: { ...ensureFactionEco(ledger, toId).stocks },
  };
}

/**
 * Settle a frozen exchange-deal: fromId pays `amount` of basePeg;
 * toId pays floor(amount * unitsQuotePerBase) of quotePeg.
 * Supports passing either (world, ledger, ...) or legacy/direct (ledger, fromId, toId, amount, treaty, meta).
 */
export function settleExchangeDeal(worldOrLedger, ledgerOrFromId, fromIdOrToId, toIdOrAmount, amountOrTreaty, maybeMeta = {}) {
  let world;
  let ledger;
  let fromId;
  let toId;
  let amount;
  let treaty;
  let meta = maybeMeta;

  if (typeof ledgerOrFromId === "string") {
    // legacy call signature: settleExchangeDeal(ledger, fromId, toId, amount, treaty, meta)
    ledger = worldOrLedger;
    fromId = ledgerOrFromId;
    toId = fromIdOrToId;
    amount = toIdOrAmount;
    treaty = amountOrTreaty;
  } else {
    // standard signature: settleExchangeDeal(world, ledger, fromId, toId, amount, meta)
    world = worldOrLedger;
    ledger = ledgerOrFromId;
    fromId = fromIdOrToId;
    toId = toIdOrAmount;
    amount = amountOrTreaty;
    const fromFac = fac(world, fromId);
    treaty = findEconomicTreaty(fromFac, toId, EXCHANGE_DEAL);
  }

  if (!treaty || treaty.type !== EXCHANGE_DEAL) {
    return { ok: false, error: "no_exchange_deal" };
  }

  const basePeg = treaty.basePeg;
  const quotePeg = treaty.quotePeg;
  const rate = Number(treaty.unitsQuotePerBase) > 0 ? Number(treaty.unitsQuotePerBase) : 1;
  if (!basePeg || !quotePeg) return { ok: false, error: "deal_missing_pegs" };

  const giveAmt = Math.floor(Number(amount) || 0);
  const takeAmt = Math.floor(giveAmt * rate);
  if (giveAmt <= 0 || takeAmt <= 0) return { ok: false, error: "invalid_amount" };
  if (spendable(ledger, fromId, basePeg) < giveAmt) {
    return { ok: false, error: "insufficient_stock" };
  }
  if (spendable(ledger, toId, quotePeg) < takeAmt) {
    return { ok: false, error: "insufficient_stock" };
  }

  adjustStock(ledger, fromId, basePeg, -giveAmt, { ...meta, reason: "exchange_deal" });
  adjustStock(ledger, toId, basePeg, giveAmt, { ...meta, reason: "exchange_deal" });
  adjustStock(ledger, toId, quotePeg, -takeAmt, { ...meta, reason: "exchange_deal" });
  adjustStock(ledger, fromId, quotePeg, takeAmt, { ...meta, reason: "exchange_deal" });
  return {
    ok: true,
    giveAmt,
    takeAmt,
    fromStocks: { ...ensureFactionEco(ledger, fromId).stocks },
    toStocks: { ...ensureFactionEco(ledger, toId).stocks },
  };
}

/**
 * Additive union metal/supply for the joiner. Uses currencyPeg conversion
 * of the joiner's own peg extraction, scaled by fx EC(host)/EC(member)
 * and unionIncomeShare. Does not debit category stocks.
 */
export function unionIncomeForJoiner(joining, host, extraction, globals, content, fxState, extras = {}) {
  const memberPeg = resolveTreasuryPeg(joining, content);
  const hostPeg =
    extras.hostPeg || resolveTreasuryPeg(host, content) || null;
  if (!memberPeg || !hostPeg) {
    return { "currency.metal": 0, "currency.supply": 0, fxRatio: 1 };
  }
  const extracted = Math.max(0, Math.floor(Number(extraction?.[memberPeg]) || 0));
  if (!extracted) {
    return { "currency.metal": 0, "currency.supply": 0, fxRatio: 1 };
  }
  const rate = pegExchangeRate(joining, memberPeg, globals, content, {
    factionExtraction: extracted,
    gmMultipliers: extras.gmMultipliers,
  });
  const transition = pegTransitionMultiplier(
    joining?.pegChangedTurn,
    extras.currentTurn ?? 0,
    content,
  );
  const share = unionIncomeShare(content);
  const hostCredit = fxCredit(fxState, hostPeg);
  const memberCredit = fxCredit(fxState, memberPeg);
  const fxRatio = hostCredit / memberCredit;
  const extra = Math.floor(extracted * rate * transition * share * hostCredit);
  return {
    "currency.metal": extra,
    "currency.supply": extra,
    fxRatio,
    unionShare: share,
    rate,
  };
}

/**
 * Tick hook: add union bonus after peg conversion + fx refresh.
 * Mutates ledger + breakdowns. Category A–F channels are left alone.
 */
export function applyCurrencyUnionIncome(
  world,
  ledger,
  breakdowns,
  extractionByPeg,
  content,
  turn,
  fxState,
) {
  const gmPegMultipliers = world.meta?.gmPegMultipliers || {};
  const applied = [];
  for (const joining of world.factions ?? []) {
    const treaties = joining?.diplomacy?.treaties || [];
    for (const t of treaties) {
      if (t.type !== CURRENCY_UNION || treatyTrack(t) !== TRACK_ECONOMIC) continue;
      const hostId = t.hostFactionId || t.withFactionId;
      if (!hostId || hostId === joining.id) continue;
      if (t.joiningFactionId && t.joiningFactionId !== joining.id) continue;
      const host = fac(world, hostId);
      if (!host) continue;
      const bd = breakdowns?.[joining.id];
      const extraction = bd?.flows?.strategicExtraction || {};
      const extra = unionIncomeForJoiner(
        joining,
        host,
        extraction,
        extractionByPeg,
        content,
        fxState,
        {
          hostPeg: t.hostPeg,
          gmMultipliers: gmPegMultipliers,
          currentTurn: turn,
        },
      );
      const pegMetal = extra["currency.metal"] || 0;
      const pegSupply = extra["currency.supply"] || 0;
      if (pegMetal) {
        adjustStock(ledger, joining.id, "currency.metal", pegMetal, {
          turn,
          reason: "currency_union",
        });
      }
      if (pegSupply) {
        adjustStock(ledger, joining.id, "currency.supply", pegSupply, {
          turn,
          reason: "currency_union",
        });
      }
      if (bd?.channels?.["currency.metal"] && pegMetal) {
        bd.channels["currency.metal"].unionConverted = pegMetal;
        bd.channels["currency.metal"].net =
          (bd.channels["currency.metal"].net || 0) + pegMetal;
      }
      if (bd?.channels?.["currency.supply"] && pegSupply) {
        bd.channels["currency.supply"].unionConverted = pegSupply;
        bd.channels["currency.supply"].net =
          (bd.channels["currency.supply"].net || 0) + pegSupply;
      }
      applied.push({
        factionId: joining.id,
        hostId,
        metal: pegMetal,
        supply: pegSupply,
        fxRatio: extra.fxRatio,
      });
    }
  }
  return applied;
}

function refreshFxSafe(content, ledger, turn) {
  try {
    return refreshFxExchange(content, ledger, {}, turn);
  } catch {
    return readFxExchangeState();
  }
}

/** HTTP dispatch: barter | quote | quote-settle | union */
export function executeEconomicRequest(action, world, body, extras = {}) {
  const content = extras.content || getContent();
  const turn = extras.turn ?? world?.meta?.turn ?? 0;
  const ledger = extras.ledger || readLedger();

  if (action === "barter") {
    const result = barterStrategicSwap(
      ledger,
      body?.fromFactionId,
      body?.toFactionId,
      body?.give,
      body?.receive,
      content,
      { turn },
    );
    if (!result.ok) return result;
    if (!extras.ledger) writeLedger(ledger);
    return { ...result, fx: refreshFxSafe(content, ledger, turn) };
  }

  if (action === "quote") {
    return applyExchangeDeal(
      world,
      body?.factionAId,
      body?.factionBId,
      turn,
      {
        basePeg: body?.basePeg,
        quotePeg: body?.quotePeg,
        unitsQuotePerBase: body?.unitsQuotePerBase,
        fxState: extras.fxState || readFxExchangeState(),
        content,
      },
      content,
    );
  }

  if (action === "quote-settle") {
    const result = settleExchangeDeal(
      world,
      ledger,
      body?.fromFactionId,
      body?.toFactionId,
      body?.amount,
      { turn },
    );
    if (!result.ok) return result;
    if (!extras.ledger) writeLedger(ledger);
    return { ...result, fx: refreshFxSafe(content, ledger, turn) };
  }

  if (action === "union") {
    return applyCurrencyUnion(
      world,
      body?.fromFactionId,
      body?.intoFactionId,
      turn,
      content,
    );
  }

  return { ok: false, error: "unknown_action" };
}
