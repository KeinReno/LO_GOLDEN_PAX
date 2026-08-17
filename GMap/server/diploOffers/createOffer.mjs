/**
 * createDiploOffer: escrow giver resources and file a pending offer.
 * Extracted from ../diploOffers.mjs.
 */
import { bumpTableRevision, readLiveBoard } from "../tableStore.mjs";
import { readLedger, writeLedger, ensureFactionEco, adjustStock } from "../ledger.mjs";
import {
  MUTUAL_TREATIES,
  readDiploOffers,
  writeDiploOffers,
  normalizeItems,
  validateAssets,
  publicOffer,
  newId,
} from "./helpers.mjs";

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
