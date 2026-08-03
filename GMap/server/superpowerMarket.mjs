/**
 * Superpower market vitrine — content-driven listings + purchases.
 */
import { getContent } from "./contentLoader.mjs";
import { getDiplomacyRelation } from "./factionIntel.mjs";
import {
  readLedger,
  writeLedger,
  ensureFactionEco,
  adjustStock,
  publicEconomyPayload,
  getFactionPublicEco,
} from "./ledger.mjs";
import { addPermanentReveal } from "./fogStore.mjs";
import { neighborIds } from "./pathfinding.mjs";

function relationRank(relation, ranks) {
  return Number(ranks?.[relation] ?? ranks?.neutral ?? 1);
}

function expandHops(world, startId, hops) {
  const out = new Set([startId]);
  if (hops <= 0) return out;
  let frontier = [startId];
  for (let d = 0; d < hops; d++) {
    const next = [];
    for (const id of frontier) {
      for (const n of neighborIds(world, id)) {
        if (out.has(n)) continue;
        out.add(n);
        next.push(n);
      }
    }
    frontier = next;
  }
  return out;
}

export function getSuperpowerCatalog(world, viewerFactionId) {
  const pack = getContent().superpower_market || {};
  const ranks = pack.relationRank || {};
  const out = [];
  for (const sp of Object.values(pack.superpowers || {})) {
    if (!sp?.id) continue;
    const fac = (world.factions ?? []).find((f) => f.id === sp.id);
    const relation = getDiplomacyRelation(world, viewerFactionId, sp.id);
    const rank = relationRank(relation, ranks);
    const listings = (sp.listings || []).map((L) => {
      const need = relationRank(L.minRelation || "neutral", ranks);
      return {
        ...L,
        unlocked: rank >= need,
        lockedReason:
          rank >= need
            ? null
            : `нужны отношения ≥ ${L.minRelation || "neutral"} (сейчас ${relation})`,
      };
    });
    out.push({
      id: sp.id,
      title: sp.title || fac?.name || sp.id,
      blurb: sp.blurb || "",
      color: sp.color || fac?.color || null,
      relation,
      listings,
    });
  }
  return out;
}

/**
 * @returns {{ ok: true, result } | { ok: false, error: string }}
 */
export function purchaseSuperpowerListing({
  world,
  factionId,
  listingId,
  systemId,
  turn,
}) {
  const pack = getContent().superpower_market || {};
  const ranks = pack.relationRank || {};
  let listing = null;
  let superpowerId = null;
  for (const sp of Object.values(pack.superpowers || {})) {
    const hit = (sp.listings || []).find((L) => L.id === listingId);
    if (hit) {
      listing = hit;
      superpowerId = sp.id;
      break;
    }
  }
  if (!listing || !superpowerId) {
    return { ok: false, error: "лот не найден" };
  }

  const relation = getDiplomacyRelation(world, factionId, superpowerId);
  const haveRank = relationRank(relation, ranks);
  const needRank = relationRank(listing.minRelation || "neutral", ranks);
  if (haveRank < needRank) {
    return {
      ok: false,
      error: `отношения с сверхдержавой слишком низкие (${relation})`,
    };
  }

  const wantCur = listing.want?.currencyId;
  const wantAmt = Math.floor(Number(listing.want?.amount ?? 0));
  if (!wantCur || wantAmt <= 0) {
    return { ok: false, error: "лот без цены" };
  }

  const ledger = readLedger();
  ensureFactionEco(ledger, factionId);
  const stock = ledger.factions[factionId].stocks[wantCur] ?? 0;
  if (stock < wantAmt) {
    return { ok: false, error: `недостаточно ${wantCur} (есть ${stock})` };
  }

  adjustStock(ledger, factionId, wantCur, -wantAmt, {
    turn,
    reason: "superpower_purchase",
    listingId,
  });

  let revealed = [];
  if (listing.kind === "resource_pack") {
    const giveCur = listing.give?.currencyId;
    const giveAmt = Math.floor(Number(listing.give?.amount ?? 0));
    if (!giveCur || giveAmt <= 0) {
      return { ok: false, error: "лот без товара" };
    }
    adjustStock(ledger, factionId, giveCur, giveAmt, {
      turn,
      reason: "superpower_receive",
      listingId,
    });
    writeLedger(ledger);
    return {
      ok: true,
      result: {
        kind: "resource_pack",
        listingId,
        paid: { currencyId: wantCur, amount: wantAmt },
        received: { currencyId: giveCur, amount: giveAmt },
        economy: publicEconomyPayload(getFactionPublicEco(factionId)),
      },
    };
  }

  if (listing.kind === "service_scout") {
    if (!systemId) {
      return { ok: false, error: "выберите систему для разведки" };
    }
    const sys = (world.systems ?? []).find((s) => s.id === systemId);
    if (!sys) return { ok: false, error: "система не найдена" };
    const hops = Math.max(0, Math.floor(Number(listing.scoutHops ?? 1)));
    const ids = [...expandHops(world, systemId, hops)];
    for (const id of ids) addPermanentReveal(factionId, id);
    writeLedger(ledger);
    revealed = ids;
    return {
      ok: true,
      result: {
        kind: "service_scout",
        listingId,
        paid: { currencyId: wantCur, amount: wantAmt },
        revealedSystemIds: revealed,
        systemId,
        economy: publicEconomyPayload(getFactionPublicEco(factionId)),
      },
    };
  }

  return { ok: false, error: `неизвестный kind: ${listing.kind}` };
}
