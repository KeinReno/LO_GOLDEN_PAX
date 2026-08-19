/**
 * respondDiploOffer: accept/reject a pending offer, settle escrow, transfer
 * assets, apply treaty + opinion effects.
 * Extracted from ../diploOffers.mjs.
 */
import { bumpTableRevision, readLiveBoard, writeLiveBoard } from "../tableStore.mjs";
import { readLedger, writeLedger, ensureFactionEco, adjustStock } from "../ledger.mjs";
import { bumpOpinion, ensureFactionDiplomacy } from "../opinionTick.mjs";
import { recomputeUnlocksFromTechs } from "../techActions.mjs";
import { applyUnitUpgradeEffectsToWorld } from "../combatResolve.mjs";
import { getContent } from "../contentLoader.mjs";
import { updateIntelFromDiplomacy } from "../intel.mjs";
import {
  readDiploOffers,
  writeDiploOffers,
  refundEscrow,
  publicOffer,
  validateAssets,
  transferAssets,
  shareableTechIds,
  setDiplomacyRelation,
  affordResources,
} from "./helpers.mjs";

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

  const wantPay = affordResources(
    ledger.factions[offer.toFactionId]?.stocks,
    offer.want || [],
  );
  if (!wantPay.ok) {
    return {
      ok: false,
      error: `${wantPay.error} для ответа`,
    };
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

  // `world` read here (was previously re-declared further down, after the
  // research_pact block already referenced it — a TDZ ReferenceError on
  // every research_pact accept, found during the file-decomposition pass).
  // recomputeUnlocksFromTechs already null-guards `world` internally, so
  // reusing this single read for both the research-pact block and the
  // transfer/effects block below is safe even when there's no live board.
  const world = readLiveBoard();

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
