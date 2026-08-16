import { Router } from "express";
import { filterBriefingForFaction } from "../../domain/narrative/briefingFilter.mjs";
import { FactionBriefingRequestSchema, FactionBriefingResponseSchema } from "../contract/narrative.mjs";
import { requireActor, actorCanActForFaction } from "../auth.mjs";
import { parseBody } from "../validate.mjs";

/** Thin HTTP layer only (see CLAUDE.md rule 3) — see server/api/routes/economy.mjs for the pattern. */
export function narrativeRouter() {
  const router = Router();

  router.post("/narrative/faction-briefing", (req, res) => {
    const actor = requireActor(req, res);
    if (!actor) return;

    const body = parseBody(FactionBriefingRequestSchema, req, res);
    if (!body) return;

    if (!actorCanActForFaction(actor, body.factionId)) {
      return res.status(403).json({ error: "forbidden_faction" });
    }

    const briefing = filterBriefingForFaction(body.journal, body.factionId, body.world ?? null);
    res.json(FactionBriefingResponseSchema.parse(briefing));
  });

  return router;
}
