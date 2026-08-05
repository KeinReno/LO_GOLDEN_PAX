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
import { applyUnitUpgradeEffectsToWorld } from "./combatResolve.mjs";
import { getContent } from "./contentLoader.mjs";
import { updateIntelFromDiplomacy } from "./intel.mjs";
import {
  ensureAlchemyState,
  transferRecipe,
} from "./alchemyActions.mjs";

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

/**
 * Mutual treaties — only via pending offer (other player must accept).
 * Unilateral stances (war / embargo / break) apply immediately — never as a deal.
 */
export const MUTUAL_TREATIES = new Set([
  "trade",
  "alliance",
  "nap",
  "research_pact",
  "migration_treaty",
  "truce",
  "vassal",
]);

/** Hostile / withdrawing actions — fait accompli, no counterparty consent. */
export const UNILATERAL_STANCES = new Set(["war", "embargo", "break"]);

function getEdgeRelation(world, aId, bId) {
  const [x, y] = aId < bId ? [aId, bId] : [bId, aId];
  return (
    (world.diplomacy ?? []).find((d) => d.aId === x && d.bId === y)?.relation ??
    "neutral"
  );
}

function cancelPendingOffersBetween(aId, bId, turn, reason) {
  const store = readDiploOffers();
  let changed = false;
  for (let i = 0; i < store.offers.length; i++) {
    const o = store.offers[i];
    if (o.status !== "pending") continue;
    const pair =
      (o.fromFactionId === aId && o.toFactionId === bId) ||
      (o.fromFactionId === bId && o.toFactionId === aId);
    if (!pair) continue;
    refundEscrow(o, turn, reason);
    store.offers[i] = {
      ...o,
      status: "cancelled",
      resolvedAt: new Date().toISOString(),
      escrowed: false,
      cancelReason: reason,
    };
    changed = true;
  }
  if (changed) writeDiploOffers(store);
}

/** Techs with race/trait locks or non-transferable acquired records stay private. */
function isShareableTechId(techId, eco, content) {
  const def = content?.technologies?.[techId];
  if (!def) return false;
  if (def.raceLock || def.factionTraitLock) return false;
  const acq = (eco?.acquiredTechs || []).find((a) => a.techId === techId);
  if (acq && (acq.transferable === false || acq.source === "historical")) {
    return false;
  }
  return true;
}

function shareableTechIds(eco, content) {
  return (eco?.unlockedTechs || []).filter((tid) =>
    isShareableTechId(tid, eco, content),
  );
}

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
    } else if (raw.kind === "tech") {
      const techId = String(raw.techId || "");
      if (!techId) continue;
      out.push({ kind: "tech", techId });
    } else if (raw.kind === "fleet") {
      const fleetId = String(raw.fleetId || "");
      if (!fleetId) continue;
      out.push({ kind: "fleet", fleetId });
    } else if (raw.kind === "legion") {
      const legionId = String(raw.legionId || "");
      if (!legionId) continue;
      out.push({ kind: "legion", legionId });
    } else if (raw.kind === "system") {
      const systemId = String(raw.systemId || "");
      if (!systemId) continue;
      out.push({ kind: "system", systemId });
    }
  }
  return out;
}

/** Validate asset ownership (fleets / legions / systems / shareable techs). */
function validateAssets(world, factionId, items, ledger) {
  const content = getContent();
  const eco = ledger ? ensureFactionEco(ledger, factionId) : null;
  for (const item of items || []) {
    if (item.kind === "fleet") {
      const f = (world.fleets || []).find((x) => x.id === item.fleetId);
      if (!f || f.factionId !== factionId) {
        return { ok: false, error: `флот недоступен: ${item.fleetId}` };
      }
    } else if (item.kind === "legion") {
      const l = (world.legions || []).find((x) => x.id === item.legionId);
      if (!l || l.factionId !== factionId) {
        return { ok: false, error: `легион недоступен: ${item.legionId}` };
      }
    } else if (item.kind === "system") {
      const s = (world.systems || []).find((x) => x.id === item.systemId);
      if (!s || s.ownerFactionId !== factionId) {
        return { ok: false, error: `система недоступна: ${item.systemId}` };
      }
    } else if (item.kind === "tech") {
      if (!eco || !isShareableTechId(item.techId, eco, content)) {
        return { ok: false, error: `технологию нельзя передать: ${item.techId}` };
      }
      if (!(eco.unlockedTechs || []).includes(item.techId)) {
        return { ok: false, error: `нет технологии: ${item.techId}` };
      }
    } else if (item.kind === "recipe") {
      const recipeId = item.recipeId;
      if (!recipeId || !content.tech_recipes?.[recipeId]) {
        return { ok: false, error: `неизвестный рецепт: ${recipeId}` };
      }
      if (!eco) return { ok: false, error: `экономика недоступна: ${recipeId}` };
      const al = ensureAlchemyState(eco);
      if (!(al.discoveredRecipes || []).includes(recipeId)) {
        return { ok: false, error: `нет рецепта: ${recipeId}` };
      }
    }
  }
  return { ok: true };
}

function transferAssets(world, fromId, toId, items, ledger) {
  const content = getContent();
  for (const item of items || []) {
    if (item.kind === "fleet") {
      const f = (world.fleets || []).find((x) => x.id === item.fleetId);
      if (f && f.factionId === fromId) f.factionId = toId;
    } else if (item.kind === "legion") {
      const l = (world.legions || []).find((x) => x.id === item.legionId);
      if (l && l.factionId === fromId) l.factionId = toId;
    } else if (item.kind === "system") {
      const s = (world.systems || []).find((x) => x.id === item.systemId);
      if (s && s.ownerFactionId === fromId) s.ownerFactionId = toId;
    } else if (item.kind === "tech" && ledger) {
      const fromEco = ensureFactionEco(ledger, fromId);
      const toEco = ensureFactionEco(ledger, toId);
      if (!isShareableTechId(item.techId, fromEco, content)) continue;
      if (!(fromEco.unlockedTechs || []).includes(item.techId)) continue;
      if (!(toEco.unlockedTechs || []).includes(item.techId)) {
        toEco.unlockedTechs = [...(toEco.unlockedTechs || []), item.techId];
        toEco.acquiredTechs = [
          ...(toEco.acquiredTechs || []),
          {
            techId: item.techId,
            source: "diplo_trade",
            transferable: true,
            tradedWith: fromId,
          },
        ];
        recomputeUnlocksFromTechs(toEco, content, toId, world);
        const effects =
          content.technologies?.[item.techId]?.effects ||
          content.tech_combos?.[item.techId]?.effects ||
          [];
        if (effects.length) {
          applyUnitUpgradeEffectsToWorld(world, toId, effects, content);
        }
      }
    } else if (item.kind === "recipe" && ledger) {
      const fromEco = ensureFactionEco(ledger, fromId);
      const toEco = ensureFactionEco(ledger, toId);
      transferRecipe(fromEco, toEco, item.recipeId, content);
    }
  }
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

  const treatyItems = [...giveItems, ...wantItems].filter(
    (i) => i.kind === "treaty",
  );
  for (const t of treatyItems) {
    if (!MUTUAL_TREATIES.has(t.treaty)) {
      return {
        ok: false,
        error:
          t.treaty === "war" || t.treaty === "embargo"
            ? `«${t.treaty}» — одностороннее действие, не сделка. Используйте кнопку в панели «Действия».`
            : `договор «${t.treaty}» нельзя предложить как сделку`,
      };
    }
  }

  // Escrow giver resources immediately so they can't double-spend.
  const ledger = readLedger();
  ensureFactionEco(ledger, fromFactionId);
  const world = readLiveBoard();
  if (world) {
    const assetCheck = validateAssets(world, fromFactionId, giveItems, ledger);
    if (!assetCheck.ok) return assetCheck;
  }
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
  const syncOpts =
    relation === "vassal"
      ? { overlordFactionId: aId, subjectFactionId: bId }
      : {};
  syncTreatiesFromEdge(world, aId, bId, relation, turn ?? 0, stances, syncOpts);
}

/**
 * Unilateral diplomatic act — applies immediately (no accept/reject).
 * stance: "war" | "embargo" | "break" (→ neutral, tears current treaty)
 *
 * @returns {{ ok: true, relation, previous } | { ok: false, error: string }}
 */
export function applyUnilateralStance({
  fromFactionId,
  toFactionId,
  stance,
  turn,
  knownOk,
}) {
  if (!fromFactionId || !toFactionId || fromFactionId === toFactionId) {
    return { ok: false, error: "некорректный адресат" };
  }
  if (knownOk === false) {
    return { ok: false, error: "держава неизвестна — нет контакта" };
  }
  const action = String(stance || "");
  if (!UNILATERAL_STANCES.has(action)) {
    return { ok: false, error: "неизвестное одностороннее действие" };
  }

  const world = readLiveBoard();
  if (!world) return { ok: false, error: "карта не опубликована" };

  const previous = getEdgeRelation(world, fromFactionId, toFactionId);
  let nextRelation = null;
  let opinionDelta = 0;
  let historyLabel = "";

  if (action === "war") {
    if (previous === "war") {
      return { ok: false, error: "война уже объявлена" };
    }
    nextRelation = "war";
    opinionDelta = -20;
    historyLabel =
      previous === "alliance"
        ? "Объявлена война (союз разорван)"
        : previous === "trade" || previous === "nap" || previous === "research_pact"
          ? `Объявлена война (договор ${previous} разорван)`
          : "Объявлена война";
  } else if (action === "embargo") {
    if (previous === "war") {
      return { ok: false, error: "при войне эмбарго избыточно" };
    }
    if (previous === "embargo") {
      return { ok: false, error: "эмбарго уже действует" };
    }
    nextRelation = "embargo";
    opinionDelta = -10;
    historyLabel = "Введено эмбарго";
  } else if (action === "break") {
    if (
      previous === "neutral" ||
      previous === "war" ||
      previous === "embargo"
    ) {
      return {
        ok: false,
        error: "нечего разрывать — нет дружественного договора",
      };
    }
    nextRelation = "neutral";
    const stances = getContent()?.diplomacy_stances || {};
    const decay = Number(stances[previous]?.trustDecayOnBreak ?? 10);
    opinionDelta = -Math.max(5, decay);
    historyLabel = `Разорван договор: ${previous}`;
  } else {
    return { ok: false, error: "неизвестное действие" };
  }

  setDiplomacyRelation(
    world,
    fromFactionId,
    toFactionId,
    nextRelation,
    turn ?? 0,
  );

  // Pending mutual deals between the pair become moot under hostility / break.
  cancelPendingOffersBetween(
    fromFactionId,
    toFactionId,
    turn,
    `diplo_unilateral_${action}`,
  );

  const fromFac = world.factions?.find((f) => f.id === fromFactionId);
  const toFac = world.factions?.find((f) => f.id === toFactionId);
  if (fromFac && toFac) {
    ensureFactionDiplomacy(fromFac);
    ensureFactionDiplomacy(toFac);
    bumpOpinion(toFac, fromFactionId, opinionDelta, turn, historyLabel);
    bumpOpinion(
      fromFac,
      toFactionId,
      Math.floor(opinionDelta / 2),
      turn,
      historyLabel,
    );
  }

  updateIntelFromDiplomacy(world, fromFactionId, toFactionId, nextRelation, {
    turn,
  });
  updateIntelFromDiplomacy(world, toFactionId, fromFactionId, nextRelation, {
    turn,
  });

  writeLiveBoard(world, { backup: false, reason: `diplo_${action}` });
  bumpTableRevision();

  return {
    ok: true,
    relation: nextRelation,
    previous,
    message: historyLabel,
  };
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

  const worldPre = readLiveBoard();
  if (worldPre) {
    const giveOk = validateAssets(
      worldPre,
      offer.fromFactionId,
      offer.give || [],
      ledger,
    );
    if (!giveOk.ok) return giveOk;
    const wantOk = validateAssets(
      worldPre,
      offer.toFactionId,
      offer.want || [],
      ledger,
    );
    if (!wantOk.ok) return wantOk;
  }

  const treatyItem = [...(offer.give || []), ...(offer.want || [])].find(
    (i) => i.kind === "treaty",
  );
  if (
    treatyItem &&
    (treatyItem.treaty === "war" ||
      treatyItem.treaty === "embargo" ||
      treatyItem.treaty === "neutral")
  ) {
    return {
      ok: false,
      error:
        "это предложение устарело (война/эмбарго не оформляются как сделка). Отклоните его.",
    };
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

  // Research pact: share only transferable / non-exclusive techs (not race/trait locks).
  let researchPactNewTechs = null;
  if (treatyItem?.treaty === "research_pact") {
    const content = getContent();
    const fromEco = ensureFactionEco(ledger, offer.fromFactionId);
    const toEco = ensureFactionEco(ledger, offer.toFactionId);
    const fromPrev = new Set(fromEco.unlockedTechs || []);
    const toPrev = new Set(toEco.unlockedTechs || []);
    const fromShare = shareableTechIds(fromEco, content);
    const toShare = shareableTechIds(toEco, content);
    const fromNext = [
      ...new Set([...(fromEco.unlockedTechs || []), ...toShare]),
    ];
    const toNext = [
      ...new Set([...(toEco.unlockedTechs || []), ...fromShare]),
    ];
    fromEco.unlockedTechs = fromNext;
    toEco.unlockedTechs = toNext;
    recomputeUnlocksFromTechs(fromEco, content, offer.fromFactionId, world);
    recomputeUnlocksFromTechs(toEco, content, offer.toFactionId, world);
    writeLedger(ledger);
    researchPactNewTechs = {
      content,
      fromPrev,
      toPrev,
      fromNext,
      toNext,
    };
  }

  const world = readLiveBoard();
  if (world) {
    transferAssets(
      world,
      offer.fromFactionId,
      offer.toFactionId,
      offer.give || [],
      ledger,
    );
    transferAssets(
      world,
      offer.toFactionId,
      offer.fromFactionId,
      offer.want || [],
      ledger,
    );
    writeLedger(ledger);

    if (researchPactNewTechs) {
      const { content, fromPrev, toPrev, fromNext, toNext } =
        researchPactNewTechs;
      for (const tid of fromNext) {
        if (fromPrev.has(tid)) continue;
        const effects = content.technologies?.[tid]?.effects || [];
        if (!effects.length) continue;
        applyUnitUpgradeEffectsToWorld(
          world,
          offer.fromFactionId,
          effects,
          content,
        );
      }
      for (const tid of toNext) {
        if (toPrev.has(tid)) continue;
        const effects = content.technologies?.[tid]?.effects || [];
        if (!effects.length) continue;
        applyUnitUpgradeEffectsToWorld(
          world,
          offer.toFactionId,
          effects,
          content,
        );
      }
    }
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
