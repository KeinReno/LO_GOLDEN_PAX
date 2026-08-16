/**
 * Auto-extracted from api.mjs — economyMisc routes.
 */
import { getContent } from "../contentLoader.mjs";
import { readLiveBoard, writeLiveBoard } from "../tableStore.mjs";
import { getFactionPublicEco, ensureFactionEco, readLedger, writeLedger, ensureAllFactions } from "../ledger.mjs";
import { queueTaxChange } from "../economyTick.mjs";
import { submitIntent, readIntents, writeIntents } from "../intents.mjs";

/**
 * @returns {Promise<boolean>}
 */
export async function tryHandleEconomyMiscRoutes(req, res, url, ctx) {
  if (!(url.pathname === "/api/economy/resource-index" || url.pathname === "/api/economy/resolve-slots" || url.pathname === "/api/economy/flows" || url.pathname === "/api/economy/build-queue" || url.pathname === "/api/economy/preview-build" || url.pathname === "/api/economy/set-tax" || url.pathname === "/api/planet/building-variants")) return false;

  const {
    sendJson,
    readBody,
    requireMaster,
    authenticateEconomyMutation,
    authenticatePlayerFaction,
    requireMasterOrFactionAuth,
    playerEconomy,
    playerApBudget,
  } = ctx;

  if (url.pathname === "/api/economy/resource-index" && req.method === "GET") {
    const { buildResourceIndex } = await import("../slotResolver.mjs");
    sendJson(res, 200, buildResourceIndex(getContent()));
    return true;
  }

  if (url.pathname === "/api/economy/resolve-slots" && req.method === "POST") {
    const body = await readBody(req);
    const c = getContent();
    const { resolveVariant, resolveSlots, buildResourceIndex } = await import(
      "../slotResolver.mjs"
    );
    const idx = buildResourceIndex(c);
    let consumer = null;
    const coll = body.collection === "ship" ? c.ships : body.collection === "unit" ? c.units : c.buildings;
    if (body.id && coll?.[body.id]) consumer = coll[body.id];
    else if (body.id) consumer = resolveVariant(body.id, c);
    if (!consumer) {
      sendJson(res, 404, { error: "consumer not found" });
      return true;
    }
    sendJson(res, 200, {
      consumer,
      slots: resolveSlots(consumer, idx),
    });
    return true;
  }

  if (url.pathname === "/api/economy/flows" && req.method === "GET") {
    const fid = url.searchParams.get("factionId");
    if (!fid) {
      sendJson(res, 400, { error: "factionId required" });
      return true;
    }
    const worldAuth = readLiveBoard();
    const flowAuth = requireMasterOrFactionAuth(req, worldAuth, fid);
    if (!flowAuth.ok) {
      sendJson(res, 401, { error: flowAuth.error });
      return true;
    }
    if (!flowAuth.master && flowAuth.faction?.id !== fid) {
      sendJson(res, 403, { error: "forbidden_faction" });
      return true;
    }
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 503, { error: "live board not loaded" });
      return true;
    }
    const { computeFlowBreakdown } = await import("../economyTick.mjs");
    const ledger = ensureAllFactions(readLedger(), world);
    const eco = ledger.factions[fid] || null;
    sendJson(res, 200, computeFlowBreakdown(world, fid, getContent(), eco));
    return true;
  }


  if (url.pathname === "/api/economy/build-queue" && req.method === "POST") {
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
      sendJson(res, 400, { error: "queue required (array)" });
      return true;
    }
    const { setBuildQueue } = await import("../planetActions.mjs");
    const result = setBuildQueue(body.factionId, body.queue);
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }
    sendJson(res, 200, {
      ok: true,
      queue: result.eco?.buildQueue ?? [],
      economy: playerEconomy(body.factionId, world),
    });
    return true;
  }

  if (url.pathname === "/api/economy/preview-build" && req.method === "POST") {
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
    if (!body.systemId || !body.planetId || !body.buildingId) {
      sendJson(res, 400, {
        error: "systemId, planetId, buildingId required",
      });
      return true;
    }
    const { previewBuild } = await import("../planetActions.mjs");
    const result = await previewBuild({
      world,
      factionId: body.factionId,
      systemId: body.systemId,
      planetId: body.planetId,
      buildingId: body.buildingId,
    });
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }
    sendJson(res, 200, result);
    return true;
  }

  if (url.pathname === "/api/planet/building-variants" && req.method === "POST") {
    const body = await readBody(req);
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Карта ещё не опубликована" });
      return true;
    }
    if (!body.systemId || !body.planetId || !body.buildingId) {
      sendJson(res, 400, {
        error: "systemId, planetId, buildingId required",
      });
      return true;
    }
    const { listBuildingVariantsForPlanet } = await import(
      "../planetActions.mjs"
    );
    const result = listBuildingVariantsForPlanet(
      world,
      body.systemId,
      body.planetId,
      body.buildingId,
    );
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }
    sendJson(res, 200, result);
    return true;
  }

  if (url.pathname === "/api/economy/set-tax" && req.method === "POST") {
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
    // Queue via intent for AP, or master direct queue
    if (isMaster && body.direct) {
      const result = queueTaxChange(
        body.factionId,
        body.taxSlot,
        body.tierId,
      );
      sendJson(res, result.ok ? 200 : 400, result);
      return true;
    }
    const apBudget = playerApBudget(world, body.factionId);
    const result = submitIntent({
      factionId: body.factionId,
      defId: "intent.set_tax",
      payload: { taxSlot: body.taxSlot, tierId: body.tierId },
      note: body.note,
      source: "map",
      turn: world.meta?.turn ?? 0,
      apMax: apBudget.apMax,
      forceApMax: apBudget.forceApMax,
      world,
    });
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }
  return false;
}
