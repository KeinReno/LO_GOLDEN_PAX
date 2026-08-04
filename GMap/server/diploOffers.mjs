/**
 * Player↔player diplomatic deal offers (pending inbox).
 * Accept applies resource swaps + optional relation/treaty change immediately.
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
import {
  syncTreatiesFromEdge,
  bumpOpinion,
  ensureFactionDiplomacy,
} from "./opinionTick.mjs";
import { recomputeUnlocksFromTechs } from "./techActions.mjs";
import { getContent } from "./contentLoader.mjs";
import { updateIntelFromDiplomacy } from "./intel.mjs";

export const DIPLO_OFFERS_PATH = path.join(DATA_DIR, "diplo-offers.json");

const TREATIES = new Set([
  "neutral",
  "trade",
  "alliance",
  "truce",
  "war",
  "vassal",
  "nap",
  "research_pact",
  "migration_treaty",
  "embargo",
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

function setDiplomacyRelation(world, aId, bId, relation, turn) {
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
  const stances = getContent()?.diplomacy_stances || {};
  syncTreatiesFromEdge(world, aId, bId, relation, turn ?? 0, stances);
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

  // Research pact: share unlocked tech catalogs (union both sides).
  if (treatyItem?.treaty === "research_pact") {
    const content = getContent();
    const fromEco = ensureFactionEco(ledger, offer.fromFactionId);
    const toEco = ensureFactionEco(ledger, offer.toFactionId);
    const union = [
      ...new Set([
        ...(fromEco.unlockedTechs || []),
        ...(toEco.unlockedTechs || []),
      ]),
    ];
    fromEco.unlockedTechs = [...union];
    toEco.unlockedTechs = [...union];
    recomputeUnlocksFromTechs(fromEco, content);
    recomputeUnlocksFromTechs(toEco, content);
    writeLedger(ledger);
  }

  const world = readLiveBoard();
  if (world) {
    const hasResources = [...(offer.give || []), ...(offer.want || [])].some(
      (i) => i.kind === "resource",
    );
    if (treatyItem) {
      setDiplomacyRelation(
        world,
        offer.fromFactionId,
        offer.toFactionId,
        treatyItem.treaty,
        turn,
      );
      const fromEco = ensureFactionEco(readLedger(), offer.fromFactionId);
      const toEco = ensureFactionEco(readLedger(), offer.toFactionId);
      updateIntelFromDiplomacy(
        world,
        offer.fromFactionId,
        offer.toFactionId,
        treatyItem.treaty,
        { turn, partnerUnlockedTechs: toEco.unlockedTechs },
      );
      updateIntelFromDiplomacy(
        world,
        offer.toFactionId,
        offer.fromFactionId,
        treatyItem.treaty,
        { turn, partnerUnlockedTechs: fromEco.unlockedTechs },
      );
    } else if (hasResources) {
      updateIntelFromDiplomacy(
        world,
        offer.fromFactionId,
        offer.toFactionId,
        "trade",
        { turn },
      );
      updateIntelFromDiplomacy(
        world,
        offer.toFactionId,
        offer.fromFactionId,
        "trade",
        { turn },
      );
    }
    // Gift / deal opinion bump both ways
    const fromFac = world.factions?.find((f) => f.id === offer.fromFactionId);
    const toFac = world.factions?.find((f) => f.id === offer.toFactionId);
    if (fromFac && toFac) {
      ensureFactionDiplomacy(fromFac);
      ensureFactionDiplomacy(toFac);
      if (hasResources) {
        bumpOpinion(toFac, offer.fromFactionId, 2, turn, "Получен дар / сделка");
        bumpOpinion(fromFac, offer.toFactionId, 2, turn, "Сделка заключена");
      }
      if (treatyItem) {
        bumpOpinion(
          fromFac,
          offer.toFactionId,
          treatyItem.treaty === "war" ? -15 : 5,
          turn,
          `Договор: ${treatyItem.treaty}`,
        );
        bumpOpinion(
          toFac,
          offer.fromFactionId,
          treatyItem.treaty === "war" ? -15 : 5,
          turn,
          `Договор: ${treatyItem.treaty}`,
        );
      }
    }
    writeLiveBoard(world, { backup: false, reason: "diplo_deal" });
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
