import { Router } from "express";
import { resolveExchange } from "../../domain/combat/resolveExchange.mjs";
import { getContent } from "../../contentLoader.mjs";
import { ResolveExchangeRequestSchema, ResolveExchangeResponseSchema } from "../contract/combat.mjs";
import { requireGm } from "../auth.mjs";
import { parseBody } from "../validate.mjs";

/** Thin HTTP layer only (see CLAUDE.md rule 3) — see server/api/routes/economy.mjs for the pattern. */
export function combatRouter() {
  const router = Router();

  // Adjudicates an outcome between two factions at once — GM-only, same
  // reasoning as economy's tick-preview (see that route's comment).
  router.post("/combat/resolve-exchange", (req, res) => {
    if (!requireGm(req, res)) return;

    const body = parseBody(ResolveExchangeRequestSchema, req, res);
    if (!body) return;

    const { groupsA, groupsB, stanceA, stanceB, factionIdA, factionIdB } = body;
    const result = resolveExchange(groupsA, groupsB, { stanceA, stanceB, factionIdA, factionIdB }, getContent());
    res.json(ResolveExchangeResponseSchema.parse(result));
  });

  return router;
}
