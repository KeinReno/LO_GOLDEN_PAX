/**
 * Peer market order book (v1.2) — venues: contacts | common.
 * Contacts: match only with trade/alliance corridor.
 * Common: match among common-market members.
 */
import path from "node:path";
import { DATA_DIR, readJson, writeJson } from "./tableStore.mjs";
import { readLedger, writeLedger, ensureFactionEco, adjustStock } from "./ledger.mjs";
import { hasTradeChannel } from "./factionIntel.mjs";
import { setKnowledgeLevel } from "./intel.mjs";
import { isCommonMarketMember } from "./marketMembership.mjs";

export const MARKET_ORDERS_PATH = path.join(DATA_DIR, "market-orders.json");
export const MARKET_HISTORY_PATH = path.join(DATA_DIR, "market-history.json");

function floor(n) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.floor(x) : 0;
}

export function readMarketOrders() {
  const raw = readJson(MARKET_ORDERS_PATH, null);
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.offers)) {
    return { offers: [] };
  }
  return { offers: raw.offers };
}

export function writeMarketOrders(data) {
  writeJson(MARKET_ORDERS_PATH, { offers: data.offers ?? [] });
}

function publicOffer(o) {
  return {
    id: o.id,
    factionId: o.factionId,
    side: o.side,
    giveCurrency: o.giveCurrency,
    giveAmount: o.giveAmount,
    wantCurrency: o.wantCurrency,
    wantAmount: o.wantAmount,
    createdTurn: o.createdTurn,
    venue: o.venue === "common" ? "common" : "contacts",
  };
}

function readHistory() {
  const raw = readJson(MARKET_HISTORY_PATH, null);
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.ticks)) {
    return { ticks: [] };
  }
  return { ticks: raw.ticks };
}

function writeHistory(store) {
  writeJson(MARKET_HISTORY_PATH, { ticks: (store.ticks || []).slice(-200) });
}

function recordMatchTick(turn, giveCurrency, wantCurrency, giveAmount, wantAmount) {
  if (!giveCurrency || !wantCurrency || giveAmount < 1) return;
  const price = wantAmount / giveAmount;
  const store = readHistory();
  store.ticks.push({
    turn: turn ?? 0,
    pair: `${giveCurrency}->${wantCurrency}`,
    price,
    volume: giveAmount,
    at: new Date().toISOString(),
  });
  writeHistory(store);
}

/** Price history for charts (last N ticks per pair). */
export function getMarketHistory(limit = 24) {
  // Walk full store then trim per-pair — seeded quotes alone are ~1k ticks.
  const ticks = readHistory().ticks;
  const byPair = {};
  for (const t of ticks) {
    if (!t?.pair) continue;
    if (!byPair[t.pair]) byPair[t.pair] = [];
    byPair[t.pair].push(t);
  }
  for (const k of Object.keys(byPair)) {
    byPair[k] = byPair[k].slice(-limit);
  }
  return { pairs: byPair };
}

/** Unfiltered open book (master / internal). */
export function getOpenMarketBook() {
  return readMarketOrders()
    .offers.filter((o) => o.status === "open")
    .map(publicOffer);
}

/**
 * Player-facing book filtered by venue.
 * @param {"contacts"|"common"|"all"} [venue]
 */
export function getOpenMarketBookForFaction(
  viewerFactionId,
  world,
  tradePartnerIds,
  venue = "all",
) {
  const partners = new Set(tradePartnerIds ?? []);
  if (tradePartnerIds == null && world) {
    for (const f of world.factions ?? []) {
      if (f.id !== viewerFactionId && hasTradeChannel(world, viewerFactionId, f.id)) {
        partners.add(f.id);
      }
    }
  }
  const inCommon = isCommonMarketMember(viewerFactionId);
  return readMarketOrders()
    .offers.filter((o) => {
      if (o.status !== "open") return false;
      const v = o.venue === "common" ? "common" : "contacts";
      if (venue === "contacts" && v !== "contacts") return false;
      if (venue === "common" && v !== "common") return false;
      if (o.factionId === viewerFactionId) return true;
      if (v === "common") return inCommon && isCommonMarketMember(o.factionId);
      return partners.has(o.factionId);
    })
    .map(publicOffer);
}

function newOfferId() {
  return `mkt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * @returns {{ ok: true, offer } | { ok: false, error: string }}
 */
export function placeMarketOffer(
  factionId,
  side,
  giveCurrency,
  giveAmount,
  wantCurrency,
  wantAmount,
  turn,
  intentId,
  venue = "contacts",
) {
  const give = floor(giveAmount);
  const want = floor(wantAmount);
  const v = venue === "common" ? "common" : "contacts";
  if (!giveCurrency || !wantCurrency) {
    return { ok: false, error: "currencies required" };
  }
  if (giveCurrency === wantCurrency) {
    return { ok: false, error: "same currency" };
  }
  if (give <= 0 || want <= 0) {
    return { ok: false, error: "amount must be > 0" };
  }
  if (side !== "sell" && side !== "buy") {
    return { ok: false, error: "invalid side" };
  }
  if (v === "common" && !isCommonMarketMember(factionId)) {
    return { ok: false, error: "сначала вступите в общий рынок" };
  }

  const ledger = readLedger();
  ensureFactionEco(ledger, factionId);
  const have = ledger.factions[factionId].stocks[giveCurrency] ?? 0;
  if (have < give) {
    return { ok: false, error: "insufficient funds" };
  }

  adjustStock(ledger, factionId, giveCurrency, -give, {
    turn,
    reason: "market_offer_escrow",
    intentId,
  });
  writeLedger(ledger);

  const offer = {
    id: newOfferId(),
    factionId,
    side,
    giveCurrency,
    giveAmount: give,
    wantCurrency,
    wantAmount: want,
    createdTurn: turn ?? 0,
    status: "open",
    escrowGiveAmount: give,
    venue: v,
  };

  const book = readMarketOrders();
  book.offers.push(offer);
  writeMarketOrders(book);
  return { ok: true, offer: publicOffer(offer) };
}

/**
 * @returns {{ ok: true, offer } | { ok: false, error: string }}
 */
export function cancelMarketOffer(offerId, factionId, turn, intentId) {
  if (!offerId) return { ok: false, error: "offerId required" };

  const book = readMarketOrders();
  const idx = book.offers.findIndex((o) => o.id === offerId);
  if (idx < 0) return { ok: false, error: "offer not found" };

  const offer = book.offers[idx];
  if (offer.factionId !== factionId) {
    return { ok: false, error: "not your offer" };
  }
  if (offer.status !== "open") {
    return { ok: false, error: "offer not open" };
  }

  const refund = floor(offer.escrowGiveAmount ?? offer.giveAmount);
  const ledger = readLedger();
  ensureFactionEco(ledger, factionId);
  adjustStock(ledger, factionId, offer.giveCurrency, refund, {
    turn,
    reason: "market_offer_refund",
    intentId,
    offerId,
  });
  writeLedger(ledger);

  book.offers[idx] = {
    ...offer,
    status: "cancelled",
    cancelledTurn: turn ?? null,
    cancelledAt: new Date().toISOString(),
  };
  writeMarketOrders(book);
  return { ok: true, offer: book.offers[idx] };
}

function offersComplement(a, b) {
  if (a.factionId === b.factionId) return false;
  if (a.giveAmount < 1 || a.wantAmount < 1 || b.giveAmount < 1 || b.wantAmount < 1) {
    return false;
  }
  return (
    a.giveCurrency === b.wantCurrency &&
    a.wantCurrency === b.giveCurrency
  );
}

/**
 * Proportional partial fill from A's give-currency unit ratio.
 * @returns {{ fillGive: number, fillWant: number } | null}
 */
export function computePartialFill(a, b) {
  if (a.giveAmount < 1 || b.giveAmount < 1) return null;

  let fillGive = Math.min(a.giveAmount, b.wantAmount);
  if (fillGive < 1) return null;

  let fillWant = floor((fillGive * a.wantAmount) / a.giveAmount);
  if (fillWant < 1) return null;

  if (fillWant > b.giveAmount) {
    fillWant = b.giveAmount;
    fillGive = floor((fillWant * a.giveAmount) / a.wantAmount);
  }

  if (fillGive < 1 || fillWant < 1) return null;
  return { fillGive, fillWant };
}

function markOfferFilled(offer, counterOfferId, turn, at) {
  offer.status = "filled";
  offer.giveAmount = 0;
  offer.wantAmount = 0;
  offer.escrowGiveAmount = 0;
  offer.filledTurn = turn;
  offer.filledAt = at;
  offer.matchedOfferId = counterOfferId;
}

/** @returns {boolean} true when a fill was executed */
function executePartialMatch(ledger, offerA, offerB, turn, journal) {
  const fill = computePartialFill(offerA, offerB);
  if (!fill) return false;

  const { fillGive, fillWant } = fill;
  const escrowA = floor(offerA.escrowGiveAmount ?? offerA.giveAmount);
  const escrowB = floor(offerB.escrowGiveAmount ?? offerB.giveAmount);

  adjustStock(ledger, offerA.factionId, offerA.wantCurrency, fillWant, {
    turn,
    reason: "market_fill_in",
    offerId: offerA.id,
    counterOfferId: offerB.id,
  });
  adjustStock(ledger, offerB.factionId, offerB.wantCurrency, fillGive, {
    turn,
    reason: "market_fill_in",
    offerId: offerB.id,
    counterOfferId: offerA.id,
  });

  offerA.giveAmount -= fillGive;
  offerA.wantAmount -= fillWant;
  offerA.escrowGiveAmount = escrowA - fillGive;

  offerB.giveAmount -= fillWant;
  offerB.wantAmount -= fillGive;
  offerB.escrowGiveAmount = escrowB - fillWant;

  const at = new Date().toISOString();
  const aFilled = offerA.giveAmount < 1;
  const bFilled = offerB.giveAmount < 1;

  if (aFilled) markOfferFilled(offerA, offerB.id, turn, at);
  if (bFilled) markOfferFilled(offerB, offerA.id, turn, at);

  journal.push({
    type: "market_match",
    offerAId: offerA.id,
    offerBId: offerB.id,
    sellerFactionId: offerA.factionId,
    buyerFactionId: offerB.factionId,
    giveCurrency: offerA.giveCurrency,
    giveAmount: fillGive,
    wantCurrency: offerA.wantCurrency,
    wantAmount: fillWant,
    venue: offerA.venue === "common" ? "common" : "contacts",
    partial: !aFilled || !bFilled,
    offerARemainingGive: aFilled ? 0 : offerA.giveAmount,
    offerBRemainingGive: bFilled ? 0 : offerB.giveAmount,
  });

  recordMatchTick(
    turn,
    offerA.giveCurrency,
    offerA.wantCurrency,
    fillGive,
    fillWant,
  );

  // Real trade → mutual economy intel floor (faction level 2)
  setKnowledgeLevel(offerA.factionId, "faction", offerB.factionId, 2, {
    source: "trade",
    turn,
  });
  setKnowledgeLevel(offerB.factionId, "faction", offerA.factionId, 2, {
    source: "trade",
    turn,
  });

  return true;
}

function venuesCompatible(a, b) {
  const va = a.venue === "common" ? "common" : "contacts";
  const vb = b.venue === "common" ? "common" : "contacts";
  return va === vb;
}

function canMatchOffers(world, a, b) {
  if (!venuesCompatible(a, b)) return false;
  const venue = a.venue === "common" ? "common" : "contacts";
  if (venue === "common") {
    return (
      isCommonMarketMember(a.factionId) && isCommonMarketMember(b.factionId)
    );
  }
  if (!world) return true;
  return hasTradeChannel(world, a.factionId, b.factionId);
}

function sortOpenOffers(offers) {
  return offers.sort((a, b) => {
    const ta = a.createdTurn ?? 0;
    const tb = b.createdTurn ?? 0;
    if (ta !== tb) return ta - tb;
    return String(a.id).localeCompare(String(b.id));
  });
}

/**
 * Match complementary open offers (partial fills, loop until idle). Call after transfer/convert intents.
 * @param {number} turn
 * @param {object} [world] live board — required to enforce trade corridors
 * @returns {{ matched: number, journal: object[] }}
 */
export function matchMarketOffers(turn, world = null) {
  const book = readMarketOrders();
  const ledger = readLedger();
  const journal = [];
  let matched = 0;
  let changed = true;

  while (changed) {
    changed = false;
    const open = sortOpenOffers(
      book.offers.filter((o) => o.status === "open" && o.giveAmount >= 1 && o.wantAmount >= 1),
    );

    outer: for (let i = 0; i < open.length; i++) {
      const a = open[i];
      if (a.status !== "open") continue;

      for (let j = i + 1; j < open.length; j++) {
        const b = open[j];
        if (b.status !== "open") continue;
        if (!offersComplement(a, b)) continue;
        if (!canMatchOffers(world, a, b)) continue;

        if (executePartialMatch(ledger, a, b, turn, journal)) {
          matched += 1;
          changed = true;
          break outer;
        }
      }
    }
  }

  if (matched > 0) {
    writeLedger(ledger);
    writeMarketOrders(book);
  }

  return { matched, journal };
}
