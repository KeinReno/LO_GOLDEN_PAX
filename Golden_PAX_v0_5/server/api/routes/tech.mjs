import { Router } from "express";
import { researchTech } from "../../domain/tech/researchTech.mjs";
import { getContent } from "../../contentLoader.mjs";
import { ResearchTechRequestSchema, ResearchTechResponseSchema } from "../contract/tech.mjs";
import { requireActor, actorCanActForFaction } from "../auth.mjs";
import { parseBody } from "../validate.mjs";

/** Thin HTTP layer only (see CLAUDE.md rule 3) — see server/api/routes/economy.mjs for the pattern. */
export function techRouter() {
  const router = Router();

  router.post("/tech/research", (req, res) => {
    const actor = requireActor(req, res);
    if (!actor) return;

    const body = parseBody(ResearchTechRequestSchema, req, res);
    if (!body) return;

    if (!actorCanActForFaction(actor, body.techAccount.factionId)) {
      return res.status(403).json({ error: "forbidden_faction" });
    }

    const { turn, techId, techAccount, stocks, factionPlanets } = body;
    const result = researchTech(techAccount, stocks, techId, getContent(), { turn, factionPlanets });
    res.json(ResearchTechResponseSchema.parse(result));
  });

  return router;
}
