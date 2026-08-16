import { Router } from "express";
import { tickOpinions } from "../../domain/diplomacy/opinion.mjs";
import { getContent } from "../../contentLoader.mjs";
import { TickOpinionsRequestSchema, TickOpinionsResponseSchema } from "../contract/diplomacy.mjs";
import { requireGm } from "../auth.mjs";
import { parseBody } from "../validate.mjs";

/** Thin HTTP layer only (see CLAUDE.md rule 3) — see server/api/routes/economy.mjs for the pattern. */
export function diplomacyRouter() {
  const router = Router();

  // Processes every faction pair in one call — GM-only, same reasoning as
  // economy's tick-preview (see that route's comment).
  router.post("/diplomacy/tick-opinions", (req, res) => {
    if (!requireGm(req, res)) return;

    const body = parseBody(TickOpinionsRequestSchema, req, res);
    if (!body) return;

    const { factions, relations } = body;
    const result = tickOpinions(factions, relations, getContent());
    res.json(TickOpinionsResponseSchema.parse(result));
  });

  return router;
}
