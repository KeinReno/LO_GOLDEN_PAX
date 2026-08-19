/**
 * Diplo-offer store I/O, item normalization/validation/asset transfer,
 * relation-edge writes. Extracted from ../diploOffers.mjs.
 */
import path from "node:path";
import { DATA_DIR, readJson, writeJson } from "../tableStore.mjs";
import { ensureFactionEco } from "../ledger.mjs";
import { syncTreatiesFromEdge, getRelation, TRACK_POLITICAL, findDiplomacyEdge } from "../opinionTick.mjs";
import { getContent } from "../contentLoader.mjs";
import { ensureAlchemyState, transferRecipe } from "../alchemyActions.mjs";
import { recomputeUnlocksFromTechs } from "../techActions.mjs";
import { applyUnitUpgradeEffectsToWorld } from "../combatResolve.mjs";
import { readLedger, writeLedger, adjustStock } from "../ledger.mjs";

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
 * Unilateral stances (war / embargo / break / insult) apply immediately — never as a deal.
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
export const UNILATERAL_STANCES = new Set(["war", "embargo", "break", "insult"]);

export function getEdgeRelation(world, aId, bId) {
  return getRelation(world, aId, bId);
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

export function refundEscrow(offer, turn, reason) {
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

export function cancelPendingOffersBetween(aId, bId, turn, reason) {
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
  if (!def || def.catalogPending) return false;
  if (def.raceLock || def.factionTraitLock) return false;
  const acq = (eco?.acquiredTechs || []).find((a) => a.techId === techId);
  if (acq && (acq.transferable === false || acq.source === "historical")) {
    return false;
  }
  return true;
}

export function resourceNeedByCurrency(items) {
  const need = {};
  for (const item of items || []) {
    if (item.kind !== "resource") continue;
    const id = String(item.currencyId || "");
    const amt = Number(item.amount) || 0;
    if (!id || amt <= 0) continue;
    need[id] = (need[id] || 0) + amt;
  }
  return need;
}

export function affordResources(stocks, items) {
  const need = resourceNeedByCurrency(items);
  for (const [currencyId, amt] of Object.entries(need)) {
    const have = Number(stocks?.[currencyId] ?? 0);
    if (have < amt) {
      return {
        ok: false,
        error: `недостаточно ${currencyId} (есть ${have}, в сделке ${amt})`,
      };
    }
  }
  return { ok: true };
}

function assetKey(item) {
  if (!item || typeof item !== "object") return null;
  if (item.kind === "fleet") return item.fleetId ? `fleet:${item.fleetId}` : null;
  if (item.kind === "legion") return item.legionId ? `legion:${item.legionId}` : null;
  if (item.kind === "system") return item.systemId ? `system:${item.systemId}` : null;
  if (item.kind === "tech") return item.techId ? `tech:${item.techId}` : null;
  if (item.kind === "treaty") return item.treaty ? `treaty:${item.treaty}` : null;
  return null;
}

export function duplicateAssetError(items) {
  const seen = new Set();
  for (const item of items || []) {
    const key = assetKey(item);
    if (!key) continue;
    if (seen.has(key)) {
      return { ok: false, error: `повтор в сделке: ${key}` };
    }
    seen.add(key);
  }
  return { ok: true };
}

export function shareableTechIds(eco, content) {
  return (eco?.unlockedTechs || []).filter((tid) =>
    isShareableTechId(tid, eco, content),
  );
}

export function newId() {
  return `diplo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function floor(n) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.floor(x) : 0;
}

export function normalizeItems(items) {
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
export function validateAssets(world, factionId, items, ledger) {
  const content = getContent();
  const eco = ledger ? ensureFactionEco(ledger, factionId) : null;
  const dup = duplicateAssetError(items);
  if (!dup.ok) return dup;
  const faction = (world.factions || []).find((f) => f.id === factionId);
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
      if (
        s.isCapital ||
        faction?.capitalSystemId === s.id
      ) {
        return { ok: false, error: "столицу нельзя передать сделкой" };
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

export function transferAssets(world, fromId, toId, items, ledger) {
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
      if (s && s.ownerFactionId === fromId) {
        s.ownerFactionId = toId;
        for (const p of s.planets || []) {
          if (!p.ownerFactionId || p.ownerFactionId === fromId) {
            p.ownerFactionId = toId;
          }
        }
        for (const st of s.stations || []) {
          if (!st.factionId || st.factionId === fromId) st.factionId = toId;
        }
      }
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

export function publicOffer(o) {
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

export function setDiplomacyRelation(world, aId, bId, relation, turn) {
  const [x, y] = aId < bId ? [aId, bId] : [bId, aId];
  const list = world.diplomacy ?? [];
  const existing = findDiplomacyEdge(world, aId, bId, TRACK_POLITICAL);
  if (existing) {
    existing.relation = relation;
    existing.track = TRACK_POLITICAL;
  } else {
    list.push({
      id: `dip_${x}_${y}`,
      aId: x,
      bId: y,
      relation,
      track: TRACK_POLITICAL,
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
