import { Router } from "express";
import { getDb } from "../../db/store.mjs";
import { getContent } from "../../contentLoader.mjs";
import { getCampaign, getFaction, getCurrentTurn, setFactionPeg, bumpTableRevision } from "../../campaign/campaignStore.mjs";
import { loadDiplomacyAccount, saveDiplomacyAccount } from "../../campaign/diplomacyStore.mjs";
import { loadEconomyAccount, saveEconomyAccount } from "../../campaign/economyStore.mjs";
import { loadFxExchangeState, loadMarketRateOverrides, saveMarketRateOverrides, savePegRateOverride } from "../../campaign/fxExchangeStore.mjs";
import { applyExchangeDeal, applyCurrencyUnion, barterStrategicSwap, settleExchangeDeal, findEconomicTreaty, EXCHANGE_DEAL } from "../../domain/diplomacy/economicRelations.mjs";
import { strategicResourceIdSet, gmPegMultiplier } from "../../domain/economy/currencyPeg.mjs";
import { getMarketRatesPayload, sanitizeMarketRates } from "../../domain/economy/marketRates.mjs";
import {
  SetFactionPegRequestSchema,
  SetFactionPegResponseSchema,
  SetMarketRatesRequestSchema,
  MarketRatesResponseSchema,
  CurrencyDealRequestSchema,
  CurrencyDealResponseSchema,
  CurrencyUnionRequestSchema,
  CurrencyUnionResponseSchema,
  SetPegMultiplierRequestSchema,
  SetPegMultiplierResponseSchema,
  BarterRequestSchema,
  BarterResponseSchema,
  SettleDealRequestSchema,
  SettleDealResponseSchema,
} from "../contract/currency.mjs";
import { requireGm, requireActor, actorCanActForFaction } from "../auth.mjs";
import { parseBody } from "../validate.mjs";

/**
 * Campaign currency peg + FX rates. Peg conversion math lives in
 * domain/economy/currencyPeg.mjs; economic relations in
 * domain/diplomacy/economicRelations.mjs. This file is HTTP only.
 *
 * GM sets a faction's peg, the per-resource GM multiplier dial, and
 * pair-rate overrides. Factions (or GM) barter raw strategic stocks,
 * enter a currency-exchange deal (and settle it), or join a currency union.
 */
export function currencyRouter() {
  const router = Router();

  router.post("/campaign/:campaignId/factions/:factionId/peg", (req, res) => {
    const actor = requireActor(req, res);
    if (!actor) return;
    const { campaignId, factionId } = req.params;
    if (!actorCanActForFaction(actor, factionId)) {
      return res.status(403).json({ error: "forbidden_faction" });
    }
    const body = parseBody(SetFactionPegRequestSchema, req, res);
    if (!body) return;

    const db = getDb();
    if (!getCampaign(db, campaignId)) return res.status(404).json({ error: "campaign_not_found" });
    if (!getFaction(db, campaignId, factionId)) return res.status(404).json({ error: "faction_not_found" });

    if (body.resourceId) {
      const strategic = strategicResourceIdSet(getContent());
      if (!strategic.has(body.resourceId)) {
        return res.status(400).json({ error: "not_strategic_resource" });
      }
    }

    const faction = setFactionPeg(db, campaignId, factionId, body.resourceId, getCurrentTurn(db, campaignId) ?? 0);
    bumpTableRevision(db, campaignId);
    res.json(SetFactionPegResponseSchema.parse(faction));
  });

  router.post("/campaign/:campaignId/currency/peg-multiplier", (req, res) => {
    if (!requireGm(req, res)) return;
    const body = parseBody(SetPegMultiplierRequestSchema, req, res);
    if (!body) return;

    const db = getDb();
    const { campaignId } = req.params;
    if (!getCampaign(db, campaignId)) return res.status(404).json({ error: "campaign_not_found" });
    const content = getContent();
    if (!strategicResourceIdSet(content).has(body.resourceId)) {
      return res.status(400).json({ error: "not_strategic_resource" });
    }
    const multiplier = gmPegMultiplier(body.multiplier, content);
    const multipliers = savePegRateOverride(db, campaignId, body.resourceId, multiplier);
    res.json(SetPegMultiplierResponseSchema.parse({ resourceId: body.resourceId, multiplier, multipliers }));
  });

  router.get("/campaign/:campaignId/market/rates", (req, res) => {
    if (!requireGm(req, res)) return;
    const db = getDb();
    const { campaignId } = req.params;
    if (!getCampaign(db, campaignId)) return res.status(404).json({ error: "campaign_not_found" });
    const payload = getMarketRatesPayload(getContent(), loadMarketRateOverrides(db, campaignId), loadFxExchangeState(db, campaignId));
    res.json(MarketRatesResponseSchema.parse(payload));
  });

  router.post("/campaign/:campaignId/market/rates", (req, res) => {
    if (!requireGm(req, res)) return;
    const body = parseBody(SetMarketRatesRequestSchema, req, res);
    if (!body) return;

    const db = getDb();
    const { campaignId } = req.params;
    if (!getCampaign(db, campaignId)) return res.status(404).json({ error: "campaign_not_found" });

    const cleaned = sanitizeMarketRates(body.rates);
    if (!cleaned.ok) return res.status(400).json(cleaned);
    const saved = saveMarketRateOverrides(db, campaignId, cleaned.rates);
    const payload = getMarketRatesPayload(getContent(), saved, loadFxExchangeState(db, campaignId));
    res.json(MarketRatesResponseSchema.parse(payload));
  });

  router.post("/campaign/:campaignId/currency/exchange-deal", (req, res) => {
    const body = parseBody(CurrencyDealRequestSchema, req, res);
    if (!body) return;
    const loaded = loadPair(req, res, body.factionAId, body.factionBId);
    if (!loaded) return;
    const { db, campaignId, factionA, factionB } = loaded;
    const aRow = getFaction(db, campaignId, body.factionAId);
    const bRow = getFaction(db, campaignId, body.factionBId);
    const turn = body.turn ?? getCurrentTurn(db, campaignId) ?? 0;
    const result = applyExchangeDeal(
      { ...factionA, pegResourceId: aRow?.pegResourceId },
      { ...factionB, pegResourceId: bRow?.pegResourceId },
      turn,
      getContent().diplomacy_stances || {},
      { basePeg: body.basePeg, quotePeg: body.quotePeg, unitsQuotePerBase: body.unitsQuotePerBase },
    );
    if (!result.ok) return res.status(400).json({ error: result.error });
    saveDiplomacyAccount(db, campaignId, body.factionAId, result.factionA.diplomacy);
    saveDiplomacyAccount(db, campaignId, body.factionBId, result.factionB.diplomacy);
    res.json(CurrencyDealResponseSchema.parse({ factionA: result.factionA, factionB: result.factionB, relation: result.relation }));
  });

  router.post("/campaign/:campaignId/currency/union", (req, res) => {
    const body = parseBody(CurrencyUnionRequestSchema, req, res);
    if (!body) return;

    const actor = requireActor(req, res);
    if (!actor) return;
    if (!actorCanActForFaction(actor, body.fromFactionId)) {
      return res.status(403).json({ error: "forbidden_faction" });
    }

    const loaded = loadPair(req, res, body.fromFactionId, body.intoFactionId);
    if (!loaded) return;
    const { db, campaignId, factionA, factionB } = loaded;
    const host = getFaction(db, campaignId, body.intoFactionId);
    const turn = body.turn ?? getCurrentTurn(db, campaignId) ?? 0;
    const result = applyCurrencyUnion(
      { ...factionA, pegResourceId: getFaction(db, campaignId, body.fromFactionId)?.pegResourceId },
      { ...factionB, pegResourceId: host?.pegResourceId },
      turn,
      getContent().diplomacy_stances || {},
    );
    if (!result.ok) return res.status(400).json({ error: result.error });
    if (result.adoptedPeg) setFactionPeg(db, campaignId, body.fromFactionId, result.adoptedPeg, turn);
    saveDiplomacyAccount(db, campaignId, body.fromFactionId, result.factionA.diplomacy);
    saveDiplomacyAccount(db, campaignId, body.intoFactionId, result.factionB.diplomacy);
    res.json(CurrencyUnionResponseSchema.parse({ factionA: result.factionA, factionB: result.factionB, relation: result.relation, adoptedPeg: result.adoptedPeg ?? null }));
  });

  router.post("/campaign/:campaignId/currency/barter", (req, res) => {
    const body = parseBody(BarterRequestSchema, req, res);
    if (!body) return;
    const actor = requireActor(req, res);
    if (!actor) return;
    if (!actorCanActForFaction(actor, body.fromFactionId) && !actorCanActForFaction(actor, body.toFactionId)) {
      return res.status(403).json({ error: "forbidden_faction" });
    }

    const db = getDb();
    const { campaignId } = req.params;
    if (!getCampaign(db, campaignId)) return res.status(404).json({ error: "campaign_not_found" });
    const fromEco = loadEconomyAccount(db, campaignId, body.fromFactionId);
    const toEco = loadEconomyAccount(db, campaignId, body.toFactionId);
    if (!fromEco || !toEco) return res.status(404).json({ error: "faction_not_found" });

    const result = barterStrategicSwap(fromEco, toEco, body.give, body.receive, getContent(), {
      turn: getCurrentTurn(db, campaignId) ?? 0,
    });
    if (!result.ok) return res.status(400).json({ error: result.error });
    const turn = getCurrentTurn(db, campaignId) ?? 0;
    saveEconomyAccount(db, campaignId, body.fromFactionId, result.fromEco, { turn, journal: result.journal.filter((j) => j.factionId === body.fromFactionId) });
    saveEconomyAccount(db, campaignId, body.toFactionId, result.toEco, { turn, journal: result.journal.filter((j) => j.factionId === body.toFactionId) });
    res.json(BarterResponseSchema.parse({ fromStocks: result.fromEco.stocks, toStocks: result.toEco.stocks }));
  });

  router.post("/campaign/:campaignId/currency/exchange-settle", (req, res) => {
    const body = parseBody(SettleDealRequestSchema, req, res);
    if (!body) return;
    const loaded = loadPair(req, res, body.fromFactionId, body.toFactionId);
    if (!loaded) return;
    const { db, campaignId, factionA } = loaded;
    const treaty = findEconomicTreaty(factionA, body.toFactionId, EXCHANGE_DEAL);
    const fromEco = loadEconomyAccount(db, campaignId, body.fromFactionId);
    const toEco = loadEconomyAccount(db, campaignId, body.toFactionId);
    if (!fromEco || !toEco) return res.status(404).json({ error: "faction_not_found" });
    const result = settleExchangeDeal(fromEco, toEco, body.amount, treaty, { turn: getCurrentTurn(db, campaignId) ?? 0 });
    if (!result.ok) return res.status(400).json({ error: result.error });
    const turn = getCurrentTurn(db, campaignId) ?? 0;
    saveEconomyAccount(db, campaignId, body.fromFactionId, result.fromEco, { turn, journal: result.journal.filter((j) => j.factionId === body.fromFactionId) });
    saveEconomyAccount(db, campaignId, body.toFactionId, result.toEco, { turn, journal: result.journal.filter((j) => j.factionId === body.toFactionId) });
    res.json(SettleDealResponseSchema.parse({
      fromStocks: result.fromEco.stocks,
      toStocks: result.toEco.stocks,
      giveAmt: result.giveAmt,
      takeAmt: result.takeAmt,
    }));
  });

  return router;
}

function loadPair(req, res, factionAId, factionBId) {
  const actor = requireActor(req, res);
  if (!actor) return null;
  if (!actorCanActForFaction(actor, factionAId) && !actorCanActForFaction(actor, factionBId)) {
    res.status(403).json({ error: "forbidden_faction" });
    return null;
  }

  const db = getDb();
  const { campaignId } = req.params;
  if (!getCampaign(db, campaignId)) {
    res.status(404).json({ error: "campaign_not_found" });
    return null;
  }

  const factionA = { id: factionAId, diplomacy: loadDiplomacyAccount(db, campaignId, factionAId) };
  const factionB = { id: factionBId, diplomacy: loadDiplomacyAccount(db, campaignId, factionBId) };
  if (!factionA.diplomacy || !factionB.diplomacy) {
    res.status(404).json({ error: "faction_not_found" });
    return null;
  }
  return { db, campaignId, factionA, factionB };
}
