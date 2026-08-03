/**
 * Player↔player diplomatic deal offers (pending inbox).
 * Accept applies resource swaps + optional relation change immediately.
 */
import path from "node:path";
import {
  DATA_DIR,
  readJson,
  writeJson,
  bumpTableRevision,
  readLiveBoard,
  writeLiveBoard,
} from "./tableStore.mjs";
import {
  readLedger,
  writeLedger,
  ensureFactionEco,
  adjustStock,
} from "./ledger.mjs";

export const DIPLO_OFFERS_PATH = path.join(DATA_DIR, "diplo-offers.json");

const TREATIES = new Set([
  "neutral",
  "trade",
  "alliance",
  "truce",
  "war",
  "vassal",
]);

function emptyStore() {
  return { offers: [] };
}

export function readDiploOffers() {
  const raw = readJson(DIPLO_OFFERS_PATH, null);
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.offers)) {
    return emptyStore();
  }
  return { offers: raw.offers };
}

export function writeDiploOffers(store) {
  writeJson(DIPLO_OFFERS_PATH, { offers: store.offers ?? [] });
}

function newId() {
  return `diplo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function floor(n) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.floor(x) : 0;
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    if (raw.kind === "resource") {
      const amount = floor(raw.amount);
      if (!raw.currencyId || amount <= 0) continue;
      out.push({
        kind: "resource",
        currencyId: String(raw.currencyId),
        amount,
      });
    } else if (raw.kind === "treaty") {
      const treaty = String(raw.treaty || "");
      if (!TREATIES.has(treaty)) continue;
      out.push({ kind: "treaty", treaty });
    }
  }
  return out;
}

function publicOffer(o) {
  return {
    id: o.id,
    fromFactionId: o.fromFactionId,
    toFactionId: o.toFactionId,
    status: o.status,
    give: o.give ?? [],
    want: o.want ?? [],
    note: o.note || "",
    createdTurn: o.createdTurn ?? 0,
    createdAt: o.createdAt,
    resolvedAt: o.resolvedAt ?? null,
  };
}

/** Inbox slice for a faction (pending only for badges; include recent resolved). */
export function getDiploOffersForFaction(factionId) {
  const { offers } = readDiploOffers();
  const incoming = [];
  const outgoing = [];
  for (const o of offers) {
    if (o.toFactionId === factionId && o.status === "pending") {
      incoming.push(publicOffer(o));
    } else if (o.fromFactionId === factionId && o.status === "pending") {
      outgoing.push(publicOffer(o));
    }
  }
  return { incoming, outgoing };
}

export function countIncomingDiploOffers(factionId) {
  return getDiploOffersForFaction(factionId).incoming.length;
}

/**
 * @returns {{ ok: true, offer } | { ok: false, error: string }}
 */
export function createDiploOffer({
  fromFactionId,
  toFactionId,
  give,
  want,
  note,
  turn,
  knownOk,
}) {
  if (!fromFactionId || !toFactionId || fromFactionId === toFactionId) {
    return { ok: false, error: "некорректный адресат" };
  }
  if (knownOk === false) {
    return { ok: false, error: "держава неизвестна — нет контакта" };
  }
  const giveItems = normalizeItems(give);
  const wantItems = normalizeItems(want);
  if (giveItems.length === 0 && wantItems.length === 0) {
    return { ok: false, error: "добавьте хотя бы один пункт сделки" };
  }

  // Escrow giver resources immediately so they can't double-spend.
  const ledger = readLedger();
  ensureFactionEco(ledger, fromFactionId);
  for (const item of giveItems) {
    if (item.kind !== "resource") continue;
    const have = ledger.factions[fromFactionId].stocks[item.currencyId] ?? 0;
    if (have < item.amount) {
      return {
        ok: false,
        error: `недостаточно ${item.currencyId} (есть ${have})`,
      };
    }
  }
  for (const item of giveItems) {
    if (item.kind !== "resource") continue;
    adjustStock(ledger, fromFactionId, item.currencyId, -item.amount, {
      turn,
      reason: "diplo_offer_escrow",
    });
  }
  writeLedger(ledger);

  const offer = {
    id: newId(),
    fromFactionId,
    toFactionId,
    status: "pending",
    give: giveItems,
    want: wantItems,
    note: note || "",
    createdTurn: turn ?? 0,
    createdAt: new Date().toISOString(),
    escrowed: true,
  };
  const store = readDiploOffers();
  store.offers.push(offer);
  writeDiploOffers(store);
  bumpTableRevision();
  return { ok: true, offer: publicOffer(offer) };
}

function refundEscrow(offer, turn, reason) {
  if (!offer.escrowed) return;
  const ledger = readLedger();
  ensureFactionEco(ledger, offer.fromFactionId);
  for (const item of offer.give || []) {
    if (item.kind !== "resource") continue;
    adjustStock(ledger, offer.fromFactionId, item.currencyId, item.amount, {
      turn,
      reason,
      offerId: offer.id,
    });
  }
  writeLedger(ledger);
}

function setDiplomacyRelation(world, aId, bId, relation) {
  const [x, y] = aId < bId ? [aId, bId] : [bId, aId];
  const list = world.diplomacy ?? [];
  const idx = list.findIndex((d) => d.aId === x && d.bId === y);
  if (idx >= 0) {
    list[idx] = { ...list[idx], relation };
  } else {
    list.push({
      id: `dip_${x}_${y}`,
      aId: x,
      bId: y,
      relation,
    });
  }
  world.diplomacy = list;
}

/**
 * @returns {{ ok: true, offer } | { ok: false, error: string }}
 */
export function respondDiploOffer({
  offerId,
  factionId,
  accept,
  turn,
}) {
  const store = readDiploOffers();
  const idx = store.offers.findIndex((o) => o.id === offerId);
  if (idx < 0) return { ok: false, error: "предложение не найдено" };
  const offer = store.offers[idx];
  if (offer.status !== "pending") {
    return { ok: false, error: "предложение уже закрыто" };
  }

  if (!accept) {
    if (offer.toFactionId !== factionId && offer.fromFactionId !== factionId) {
      return { ok: false, error: "чужое предложение" };
    }
    refundEscrow(offer, turn, "diplo_offer_refund");
    store.offers[idx] = {
      ...offer,
      status: offer.fromFactionId === factionId ? "cancelled" : "rejected",
      resolvedAt: new Date().toISOString(),
      escrowed: false,
    };
    writeDiploOffers(store);
    bumpTableRevision();
    return { ok: true, offer: publicOffer(store.offers[idx]) };
  }

  if (offer.toFactionId !== factionId) {
    return { ok: false, error: "принять может только адресат" };
  }

  const ledger = readLedger();
  ensureFactionEco(ledger, offer.fromFactionId);
  ensureFactionEco(ledger, offer.toFactionId);

  for (const item of offer.want || []) {
    if (item.kind !== "resource") continue;
    const have = ledger.factions[offer.toFactionId].stocks[item.currencyId] ?? 0;
    if (have < item.amount) {
      return {
        ok: false,
        error: `недостаточно ${item.currencyId} для ответа (есть ${have})`,
      };
    }
  }

  // Deliver escrowed give → toFaction; take want from to → from.
  for (const item of offer.give || []) {
    if (item.kind !== "resource") continue;
    adjustStock(ledger, offer.toFactionId, item.currencyId, item.amount, {
      turn,
      reason: "diplo_deal_receive",
      offerId: offer.id,
    });
  }
  for (const item of offer.want || []) {
    if (item.kind !== "resource") continue;
    adjustStock(ledger, offer.toFactionId, item.currencyId, -item.amount, {
      turn,
      reason: "diplo_deal_pay",
      offerId: offer.id,
    });
    adjustStock(ledger, offer.fromFactionId, item.currencyId, item.amount, {
      turn,
      reason: "diplo_deal_receive",
      offerId: offer.id,
    });
  }
  writeLedger(ledger);

  const treatyItem = [...(offer.give || []), ...(offer.want || [])].find(
    (i) => i.kind === "treaty",
  );
  if (treatyItem) {
    const world = readLiveBoard();
    if (world) {
      setDiplomacyRelation(
        world,
        offer.fromFactionId,
        offer.toFactionId,
        treatyItem.treaty,
      );
      writeLiveBoard(world, { backup: false, reason: "diplo_deal" });
    }
  }

  store.offers[idx] = {
    ...offer,
    status: "accepted",
    resolvedAt: new Date().toISOString(),
    escrowed: false,
  };
  writeDiploOffers(store);
  bumpTableRevision();
  return { ok: true, offer: publicOffer(store.offers[idx]) };
}
