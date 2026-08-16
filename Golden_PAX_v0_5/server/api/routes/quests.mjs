import { Router } from "express";
import { rollRecurringQuests, selectYearlyQuestPool, expireQuests, canRollYearlyQuests, pickRandomSystemId } from "../../domain/quests/questTick.mjs";
import { catalogQuestToInstance } from "../../domain/quests/quest.mjs";
import { getContent } from "../../contentLoader.mjs";
import {
  RollYearlyQuestsRequestSchema,
  RollYearlyQuestsResponseSchema,
  ExpireQuestsRequestSchema,
  ExpireQuestsResponseSchema,
} from "../contract/quests.mjs";
import { requireActor, requireGm, actorCanActForFaction } from "../auth.mjs";
import { parseBody } from "../validate.mjs";

function toFilterContext(ctx) {
  return {
    era: ctx.era,
    warCount: ctx.warCount,
    hasRefugees: ctx.hasRefugees,
    borderWithWar: ctx.borderWithWar,
    hasRace: (raceId) => ctx.raceIds.includes(raceId),
    hasBuilding: (buildingId) => ctx.buildingIds.includes(buildingId),
    lowLoyaltyRace: (raceId) => ctx.lowLoyaltyRaceIds.includes(raceId),
    arcActive: (arcId) => ctx.activeArcIds.includes(arcId),
  };
}

/** Thin HTTP layer only (see CLAUDE.md rule 3) — see server/api/routes/economy.mjs for the pattern. */
export function questsRouter() {
  const router = Router();

  router.post("/quests/roll-yearly", (req, res) => {
    const actor = requireActor(req, res);
    if (!actor) return;

    const body = parseBody(RollYearlyQuestsRequestSchema, req, res);
    if (!body) return;

    if (!actorCanActForFaction(actor, body.factionId)) {
      return res.status(403).json({ error: "forbidden_faction" });
    }

    const { factionId, turn, ctx, systemIds, lastRollTurn } = body;
    if (!canRollYearlyQuests(lastRollTurn, turn)) {
      return res.status(409).json({ error: "already_rolled" });
    }

    const { count, roll } = rollRecurringQuests();
    const defs = Object.values(getContent().yearly_quests || {});
    const picked = selectYearlyQuestPool(defs, toFilterContext(ctx), count);
    const expiresTurn = turn + 1;
    const quests = picked.map((def) => catalogQuestToInstance(def, factionId, pickRandomSystemId(systemIds), turn, expiresTurn));

    res.json(RollYearlyQuestsResponseSchema.parse({ roll, count: quests.length, quests }));
  });

  // Batch turn-processing over an arbitrary set of quests (not scoped to
  // one faction in the request shape) — GM-only, same reasoning as
  // economy's tick-preview.
  router.post("/quests/expire", (req, res) => {
    if (!requireGm(req, res)) return;

    const body = parseBody(ExpireQuestsRequestSchema, req, res);
    if (!body) return;

    const result = expireQuests(body.quests, body.turn);
    res.json(ExpireQuestsResponseSchema.parse(result));
  });

  return router;
}
