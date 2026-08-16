import { Router } from "express";
import { getDb } from "../../db/store.mjs";
import { getContent } from "../../contentLoader.mjs";
import { getCampaign, getFaction, bumpTableRevision } from "../../campaign/campaignStore.mjs";
import { loadEconomyAccount, saveEconomyAccount } from "../../campaign/economyStore.mjs";
import { mintPlayerToken } from "../../campaign/playerStore.mjs";
import { resolveTaxSlotId } from "../../domain/economy/taxes.mjs";
import {
  SetTaxesRequestSchema,
  SetTaxesResponseSchema,
  MintPlayerTokenRequestSchema,
  MintPlayerTokenResponseSchema,
} from "../contract/campaign.mjs";
import { requireGm, requireActor, actorCanActForFaction } from "../auth.mjs";
import { parseBody } from "../validate.mjs";
import { getCurrentTurn } from "../../campaign/campaignStore.mjs";

export function factionSelfRouter() {
  const router = Router();

  router.post("/campaign/:campaignId/factions/:factionId/player-token", (req, res) => {
    if (!requireGm(req, res)) return;
    if (req.body == null || typeof req.body !== "object") req.body = {};
    const body = parseBody(MintPlayerTokenRequestSchema, req, res);
    if (!body) return;
    const db = getDb();
    const { campaignId, factionId } = req.params;
    if (!getCampaign(db, campaignId)) return res.status(404).json({ error: "campaign_not_found" });
    const minted = mintPlayerToken(db, campaignId, factionId, {
      displayName: body.displayName,
      token: body.token,
    });
    if (!minted.ok) {
      const status = minted.error === "faction_not_found" ? 404 : 400;
      return res.status(status).json({ error: minted.error });
    }
    bumpTableRevision(db, campaignId);
    res.json(MintPlayerTokenResponseSchema.parse({
      playerId: minted.playerId,
      factionId: minted.factionId,
      token: minted.token,
      displayName: minted.displayName,
    }));
  });

  router.post("/campaign/:campaignId/factions/:factionId/taxes", (req, res) => {
    const actor = requireActor(req, res);
    if (!actor) return;
    const { campaignId, factionId } = req.params;
    if (!actorCanActForFaction(actor, factionId)) {
      return res.status(403).json({ error: "forbidden_faction" });
    }
    const body = parseBody(SetTaxesRequestSchema, req, res);
    if (!body) return;

    const db = getDb();
    if (!getCampaign(db, campaignId)) return res.status(404).json({ error: "campaign_not_found" });
    if (!getFaction(db, campaignId, factionId)) return res.status(404).json({ error: "faction_not_found" });
    const eco = loadEconomyAccount(db, campaignId, factionId);
    if (!eco) return res.status(404).json({ error: "faction_not_found" });

    const content = getContent();
    const slot = resolveTaxSlotId(content, body.slot);
    const def = content.taxes?.[slot];
    if (!def?.tiers) return res.status(400).json({ error: "unknown_tax_slot" });
    if (!def.tiers.some((t) => t.id === body.tierId)) {
      return res.status(400).json({ error: "unknown_tax_tier" });
    }
    eco.taxes = { ...eco.taxes, [slot]: body.tierId };
    saveEconomyAccount(db, campaignId, factionId, eco, { turn: getCurrentTurn(db, campaignId) ?? 0 });
    bumpTableRevision(db, campaignId);
    res.json(SetTaxesResponseSchema.parse({ taxes: eco.taxes }));
  });

  return router;
}
