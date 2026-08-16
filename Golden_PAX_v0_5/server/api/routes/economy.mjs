import { Router } from "express";
import { runEconomyTick } from "../../domain/economy/economyTick.mjs";
import { getContent } from "../../contentLoader.mjs";
import { EconomyTickPreviewRequestSchema, EconomyTickPreviewResponseSchema } from "../contract/economy.mjs";
import { requireGm } from "../auth.mjs";
import { parseBody } from "../validate.mjs";

/**
 * Thin HTTP layer only (see CLAUDE.md rule 3): parse + validate the
 * request, call one domain function, validate + return the response.
 * No game rules live in this file.
 */
export function economyRouter() {
  const router = Router();

  // Processes every faction in one call — a turn-processing action, not a
  // player self-service one, so it's GM-only (see auth.mjs's requireGm).
  router.post("/economy/tick-preview", (req, res) => {
    if (!requireGm(req, res)) return;

    const body = parseBody(EconomyTickPreviewRequestSchema, req, res);
    if (!body) return;

    const { turn, factions } = body;
    const { breakdowns, journal } = runEconomyTick(factions, turn, getContent());
    res.json(EconomyTickPreviewResponseSchema.parse({ turn, breakdowns, journal }));
  });

  return router;
}
