/**
 * Economy tech HTTP routes — research, offers, grades/sockets, alchemy, path, market.
 * Dispatched from api.mjs via tryHandleEconomyTechRoutes.
 */
import { readLiveBoard, writeLiveBoard } from "../tableStore.mjs";
import { getContent } from "../contentLoader.mjs";
import {
  getFactionPublicEco,
  readLedger,
  ensureFactionEco,
} from "../ledger.mjs";

function isEconomyTechPath(pathname) {
  return (
    pathname === "/api/economy/research" ||
    pathname === "/api/economy/research/revoke" ||
    pathname === "/api/economy/research-upgrade" ||
    pathname === "/api/economy/research-queue" ||
    pathname === "/api/economy/research-accelerate" ||
    pathname === "/api/economy/research-path" ||
    pathname === "/api/economy/tech-market" ||
    pathname.startsWith("/api/economy/tech-offers/") ||
    pathname.startsWith("/api/economy/tech/") ||
    pathname.startsWith("/api/economy/alchemy/")
  );
}

/**
 * @returns {Promise<boolean>} true if handled
 */
export async function tryHandleEconomyTechRoutes(req, res, url, ctx) {
  if (!isEconomyTechPath(url.pathname)) return false;

  const {
    sendJson,
    readBody,
    requireMaster,
    authenticateEconomyMutation,
    playerEconomy,
  } = ctx;

  if (url.pathname === "/api/economy/research" && req.method === "POST") {
    const body = await readBody(req);
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Нет board" });
      return true;
    }
    const auth = authenticateEconomyMutation(body, world, req);
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    const isMaster = Boolean(auth.master);
    if (!body.techId) {
      sendJson(res, 400, { error: "techId required" });
      return true;
    }
    const { researchTech, gmGrantTech } = await import("../techActions.mjs");
    const result =
      isMaster && body.free
        ? gmGrantTech(body.factionId, body.techId, {
            turn: world.meta?.turn ?? null,
            world,
          })
        : researchTech(body.factionId, body.techId, {
            turn: world.meta?.turn ?? null,
            world,
          });
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }
    if (result.worldMutated) {
      writeLiveBoard(world, { backup: false, reason: "research_tech" });
    }
    sendJson(res, 200, {
      ok: true,
      tech: result.tech,
      offerBypass: Boolean(result.offerBypass),
      economy: playerEconomy(body.factionId, world),
    });
    return true;
  }

  if (url.pathname === "/api/economy/research/revoke" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = await readBody(req);
    if (!body.factionId || !body.techId) {
      sendJson(res, 400, { error: "factionId + techId required" });
      return true;
    }
    const world = readLiveBoard();
    const { gmRevokeTech } = await import("../techActions.mjs");
    const result = gmRevokeTech(body.factionId, body.techId, { world });
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }
    sendJson(res, 200, {
      ok: true,
      tech: result.tech,
      economy: world
        ? playerEconomy(body.factionId, world)
        : getFactionPublicEco(body.factionId),
    });
    return true;
  }

  /** tech_tree_2_p2_direction_reroll — player-facing direction axis. */
  if (url.pathname === "/api/economy/tech-offers/direction-reroll" && req.method === "POST") {
    const body = await readBody(req);
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Нет board" });
      return true;
    }
    const auth = authenticateEconomyMutation(body, world, req);
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    const axis = body.direction || body.category;
    if (!axis) {
      sendJson(res, 400, { error: "direction required" });
      return true;
    }
    const { rerollResearchOffer } = await import("../techActions.mjs");
    const result = rerollResearchOffer(body.factionId, axis, { world });
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }
    sendJson(res, 200, {
      ok: true,
      offer: result.offer,
      economy: playerEconomy(body.factionId, world),
    });
    return true;
  }

  if (url.pathname === "/api/economy/tech/upgrade-grade" && req.method === "POST") {
    const body = await readBody(req);
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Нет board" });
      return true;
    }
    const auth = authenticateEconomyMutation(body, world, req);
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    if (!body.techId) {
      sendJson(res, 400, { error: "techId required" });
      return true;
    }
    const { upgradeResearchedTechGrade } = await import("../techActions.mjs");
    const result = upgradeResearchedTechGrade(body.factionId, body.techId, {
      turn: world.meta?.turn ?? null,
      world,
    });
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }
    sendJson(res, 200, {
      ok: true,
      techId: result.techId,
      grade: result.grade,
      economy: playerEconomy(body.factionId, world),
    });
    return true;
  }

  if (url.pathname === "/api/economy/tech/fill-socket" && req.method === "POST") {
    const body = await readBody(req);
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Нет board" });
      return true;
    }
    const auth = authenticateEconomyMutation(body, world, req);
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    if (!body.techId || !body.resourceId) {
      sendJson(res, 400, { error: "techId and resourceId required" });
      return true;
    }
    const { fillResearchedTechSocket } = await import("../techActions.mjs");
    const result = fillResearchedTechSocket(body.factionId, body.techId, body.resourceId, {
      turn: world.meta?.turn ?? null,
      world,
    });
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }
    sendJson(res, 200, {
      ok: true,
      techId: result.techId,
      resourceId: result.resourceId,
      economy: playerEconomy(body.factionId, world),
    });
    return true;
  }

  if (url.pathname === "/api/economy/alchemy/preview" && req.method === "POST") {
    const body = await readBody(req);
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Нет board" });
      return true;
    }
    const auth = authenticateEconomyMutation(body, world, req);
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    const isMaster = Boolean(auth.master);
    if (!body.techA || !body.techB) {
      sendJson(res, 400, { error: "techA + techB required" });
      return true;
    }
    const { previewAlchemyExperiment } = await import("../alchemyActions.mjs");
    const result = previewAlchemyExperiment(
      body.factionId,
      body.techA,
      body.techB,
      { mode: body.mode || "auto", world },
    );
    sendJson(res, result.ok === false ? 400 : 200, result);
    return true;
  }

  if (url.pathname === "/api/economy/alchemy/experiment" && req.method === "POST") {
    const body = await readBody(req);
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Нет board" });
      return true;
    }
    const auth = authenticateEconomyMutation(body, world, req);
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    const isMaster = Boolean(auth.master);
    if (!body.techA || !body.techB) {
      sendJson(res, 400, { error: "techA + techB required" });
      return true;
    }
    const { alchemyExperiment } = await import("../alchemyActions.mjs");
    const result = alchemyExperiment(body.factionId, body.techA, body.techB, {
      mode: body.mode || "auto",
      turn: world.meta?.turn ?? null,
      world,
    });
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }
    if (result.worldMutated) {
      writeLiveBoard(world, { backup: false, reason: "alchemy_experiment" });
    }
    sendJson(res, 200, {
      ...result,
      economy: playerEconomy(body.factionId, world),
    });
    return true;
  }

  if (url.pathname === "/api/economy/alchemy/grant-recipe" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = await readBody(req);
    if (!body.factionId || !body.recipeId) {
      sendJson(res, 400, { error: "factionId + recipeId required" });
      return true;
    }
    const world = readLiveBoard();
    const { grantRecipe } = await import("../alchemyActions.mjs");
    const result = grantRecipe(body.factionId, body.recipeId, {
      turn: world?.meta?.turn ?? null,
    });
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }
    sendJson(res, 200, {
      ...result,
      economy: world
        ? playerEconomy(body.factionId, world)
        : getFactionPublicEco(body.factionId),
    });
    return true;
  }

  if (url.pathname === "/api/economy/alchemy/revoke-recipe" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = await readBody(req);
    if (!body.factionId || !body.recipeId) {
      sendJson(res, 400, { error: "factionId + recipeId required" });
      return true;
    }
    const world = readLiveBoard();
    const { revokeRecipe } = await import("../alchemyActions.mjs");
    const result = revokeRecipe(body.factionId, body.recipeId);
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }
    sendJson(res, 200, {
      ...result,
      economy: world
        ? playerEconomy(body.factionId, world)
        : getFactionPublicEco(body.factionId),
    });
    return true;
  }

  if (url.pathname === "/api/economy/research-upgrade" && req.method === "POST") {
    const body = await readBody(req);
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Нет board" });
      return true;
    }
    const auth = authenticateEconomyMutation(body, world, req);
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    const isMaster = Boolean(auth.master);
    if (!body.techId || !body.upgradeId) {
      sendJson(res, 400, { error: "techId and upgradeId required" });
      return true;
    }
    const { researchUpgrade } = await import("../techActions.mjs");
    const result = researchUpgrade(body.factionId, body.techId, body.upgradeId, {
      turn: world.meta?.turn ?? null,
      world,
    });
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }
    if (result.worldMutated) {
      writeLiveBoard(world, { backup: false, reason: "research_upgrade" });
    }
    sendJson(res, 200, {
      ok: true,
      upgrade: result.upgrade,
      tech: result.tech,
      economy: playerEconomy(body.factionId, world),
    });
    return true;
  }

  if (url.pathname === "/api/economy/research-queue" && req.method === "POST") {
    const body = await readBody(req);
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Нет board" });
      return true;
    }
    const auth = authenticateEconomyMutation(body, world, req);
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    const isMaster = Boolean(auth.master);
    if (!Array.isArray(body.queue)) {
      sendJson(res, 400, { error: "queue required (array of techId)" });
      return true;
    }
    const { setResearchQueue } = await import("../techActions.mjs");
    const result = setResearchQueue(body.factionId, body.queue);
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }
    sendJson(res, 200, {
      ok: true,
      queue: result.eco?.researchQueue ?? [],
      economy: playerEconomy(body.factionId, world),
    });
    return true;
  }

  if (url.pathname === "/api/economy/research-accelerate" && req.method === "POST") {
    const body = await readBody(req);
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Нет board" });
      return true;
    }
    const auth = authenticateEconomyMutation(body, world, req);
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    const isMaster = Boolean(auth.master);
    if (!body.techId) {
      sendJson(res, 400, { error: "techId required" });
      return true;
    }
    const { accelerateResearch } = await import("../techActions.mjs");
    const result = accelerateResearch(body.factionId, body.techId, {
      world,
      turn: world.meta?.turn ?? null,
    });
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }
    if (result.worldMutated) {
      writeLiveBoard(world, { backup: false, reason: "research_rush" });
    }
    sendJson(res, 200, {
      ok: true,
      tech: result.tech,
      cost: result.cost,
      economy: playerEconomy(body.factionId, world),
    });
    return true;
  }

  if (url.pathname === "/api/economy/research-path" && req.method === "POST") {
    const body = await readBody(req);
    if (!body.techId) {
      sendJson(res, 400, { error: "techId required" });
      return true;
    }
    const ledger = readLedger();
    const eco = ensureFactionEco(ledger, body.factionId || "");
    const { researchPathTo } = await import("../techActions.mjs");
    const path = researchPathTo(
      body.techId,
      eco.unlockedTechs || [],
      getContent(),
      {
        eco,
        factionId: body.factionId || null,
        world: readLiveBoard(),
      },
    );
    sendJson(res, 200, { ok: true, ...path });
    return true;
  }

  if (url.pathname === "/api/economy/tech-market" && req.method === "GET") {
    const { listTechMarket } = await import("../techPool.mjs");
    const listings = listTechMarket(getContent());
    sendJson(res, 200, { ok: true, listings });
    return true;
  }
  return false;
}
