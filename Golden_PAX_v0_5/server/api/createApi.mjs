import { Router } from "express";
import { healthRouter } from "./routes/health.mjs";
import { economyRouter } from "./routes/economy.mjs";
import { techRouter } from "./routes/tech.mjs";
import { combatRouter } from "./routes/combat.mjs";
import { diplomacyRouter } from "./routes/diplomacy.mjs";
import { courtRouter } from "./routes/court.mjs";
import { questsRouter } from "./routes/quests.mjs";
import { narrativeRouter } from "./routes/narrative.mjs";
import { campaignRouter } from "./routes/campaign.mjs";
import { forcesRouter } from "./routes/forces.mjs";
import { currencyRouter } from "./routes/currency.mjs";
import { viewerRouter } from "./routes/viewer.mjs";
import { factionSelfRouter } from "./routes/factionSelf.mjs";
import { contentRouter } from "./routes/content.mjs";

/** Mounts all domain routers under one /api router. */
export function createApi() {
  const router = Router();
  router.use(healthRouter());
  router.use(contentRouter());
  router.use(economyRouter());
  router.use(techRouter());
  router.use(combatRouter());
  router.use(diplomacyRouter());
  router.use(courtRouter());
  router.use(questsRouter());
  router.use(narrativeRouter());
  router.use(campaignRouter());
  router.use(viewerRouter());
  router.use(factionSelfRouter());
  router.use(forcesRouter());
  router.use(currencyRouter());
  return router;
}
