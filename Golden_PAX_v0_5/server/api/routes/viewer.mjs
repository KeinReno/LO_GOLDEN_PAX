import { Router } from "express";
import { getDb } from "../../db/store.mjs";
import { getContent } from "../../contentLoader.mjs";
import { getCampaign } from "../../campaign/campaignStore.mjs";
import { buildViewerPayload } from "../../campaign/viewerPayload.mjs";
import { CampaignViewResponseSchema } from "../contract/campaign.mjs";
import { resolveActor } from "../auth.mjs";

/** Player fog view — never the GM /state dump. */
export function viewerRouter() {
  const router = Router();

  router.get("/campaign/:campaignId/view", (req, res) => {
    const actor = resolveActor(req);
    if (!actor) return res.status(401).json({ error: "unauthenticated" });
    if (actor.role === "gm") return res.status(403).json({ error: "player_only" });

    const db = getDb();
    const { campaignId } = req.params;
    if (!getCampaign(db, campaignId)) return res.status(404).json({ error: "campaign_not_found" });
    if (actor.notSeated) return res.status(403).json({ error: "not_seated" });

    const sinceRaw = req.query.sinceRevision;
    const sinceRevision = sinceRaw != null && String(sinceRaw) !== "" ? Number(sinceRaw) : undefined;
    const payload = buildViewerPayload(db, campaignId, actor.factionId, getContent(), { sinceRevision });
    if (payload.error === "campaign_not_found") return res.status(404).json({ error: "campaign_not_found" });
    res.json(CampaignViewResponseSchema.parse(payload));
  });

  return router;
}
