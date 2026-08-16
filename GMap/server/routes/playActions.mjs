/**
 * Auto-extracted from api.mjs — playActions routes.
 */
import { applyPlanetAction } from "../planetActions.mjs";
import { applyQuestAction } from "../questActions.mjs";
import {
  applySystemAction,
  listStationCatalog,
} from "../systemActions.mjs";
import {
  createOrderFromIntent,
  shouldCreateEtaOrder,
  intentCategory,
} from "../orderEngine.mjs";
import {
  readIntents,
  writeIntents,
  submitIntent,
} from "../intents.mjs";
import { readLiveBoard, writeLiveBoard, readJson, writeJson, ORDERS_PATH, INTENTS_PATH } from "../tableStore.mjs";
import { getContent } from "../contentLoader.mjs";
import { getFactionPublicEco } from "../ledger.mjs";

/**
 * @returns {Promise<boolean>}
 */
export async function tryHandlePlayActionRoutes(req, res, url, ctx) {
  if (!(url.pathname === "/api/planet/action" || url.pathname === "/api/society/found-lineage" || url.pathname === "/api/quest/action" || url.pathname === "/api/system/action" || url.pathname === "/api/orders" || url.pathname.startsWith("/api/orders/"))) return false;

  const {
    sendJson,
    readBody,
    requireMaster,
    authenticatePlayerFaction,
    playerSessionPayload,
    playerApBudget,
    playerEconomy,
    filterWorldForFaction,
    finalizeSubmittedIntent,
    markIntentApplied,
  } = ctx;

  if (url.pathname === "/api/planet/action" && req.method === "POST") {
    const body = await readBody(req);
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Карта ещё не опубликована" });
      return true;
    }
    const auth = authenticatePlayerFaction(body, world, req);
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    if (!auth.faction) {
      sendJson(res, 400, { error: "factionId required (player auth)" });
      return true;
    }
    const faction = auth.faction;
    const eco = getFactionPublicEco(faction.id);
    const apBudget = playerApBudget(world, faction.id, eco);
    const result = applyPlanetAction({
      world,
      factionId: faction.id,
      action: body.action,
      systemId: body.systemId,
      planetId: body.planetId,
      buildingId: body.buildingId,
      instanceId: body.instanceId,
      colonyType: body.colonyType,
      sourcePlanetId: body.sourcePlanetId,
      zone: body.zone,
      note: body.note,
      apMax: apBudget.apMax,
      slotRole: body.slotRole,
      slotResourceId: body.slotResourceId,
      name: body.name,
      assignedLabor: body.assignedLabor,
      fromInstanceId: body.fromInstanceId,
      transferAmount: body.transferAmount,
    });
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }
    const filtered = filterWorldForFaction(world, faction.id);
    sendJson(res, 200, {
      ok: true,
      intent: result.intent,
      cost: result.cost ?? null,
      building: result.building ?? null,
      ...playerApBudget(world, faction.id, eco),
      economy: playerEconomy(faction.id, world),
      ...filtered,
    });
    return true;
  }

  if (url.pathname === "/api/society/found-lineage" && req.method === "POST") {
    const body = await readBody(req);
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Карта ещё не опубликована" });
      return true;
    }
    const auth = authenticatePlayerFaction(body, world, req);
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    if (!auth.faction) {
      sendJson(res, 400, { error: "factionId required (player auth)" });
      return true;
    }
    const faction = auth.faction;
    const apBudget = playerApBudget(world, faction.id);
    const { applyFoundHybridLineageInstant } = await import(
      "../hybridActions.mjs"
    );
    const result = applyFoundHybridLineageInstant({
      world,
      factionId: faction.id,
      systemId: body.systemId,
      planetId: body.planetId,
      raceA: body.raceA,
      raceB: body.raceB,
      apMax: apBudget.apMax,
    });
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }
    const filtered = filterWorldForFaction(world, faction.id);
    sendJson(res, 200, {
      ok: true,
      lineageId: result.lineageId,
      intent: result.intent,
      economy: result.economy,
      ...playerApBudget(world, faction.id),
      ...filtered,
    });
    return true;
  }

  /** Instant quest actions: yearly dice / choice / quest dice (A9). */
  if (url.pathname === "/api/quest/action" && req.method === "POST") {
    const body = await readBody(req);
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Карта ещё не опубликована" });
      return true;
    }
    const auth = authenticatePlayerFaction(body, world, req);
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    if (!auth.faction) {
      sendJson(res, 400, { error: "factionId required (player auth)" });
      return true;
    }
    const result = applyQuestAction({
      world,
      factionId: auth.faction.id,
      action: body.action,
      questId: body.questId,
      choiceId: body.choiceId,
      specIndex: body.specIndex,
      note: body.note,
      message: body.message,
    });
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }
    const fresh = readLiveBoard() || world;
    sendJson(res, 200, {
      ok: true,
      ...result,
      ...playerSessionPayload(fresh, auth.faction),
    });
    return true;
  }

  /** System stations + ship/unit production. */
  if (url.pathname === "/api/system/action" && req.method === "POST") {
    const body = await readBody(req);
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Карта ещё не опубликована" });
      return true;
    }
    const auth = authenticatePlayerFaction(body, world, req);
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    if (!auth.faction) {
      sendJson(res, 400, { error: "factionId required (player auth)" });
      return true;
    }
    const faction = auth.faction;
    const eco = getFactionPublicEco(faction.id);
    const apBudget = playerApBudget(world, faction.id, eco);
    const result = applySystemAction({
      world,
      factionId: faction.id,
      action: body.action,
      systemId: body.systemId,
      stationKind: body.stationKind,
      stationId: body.stationId,
      shipId: body.shipId,
      unitId: body.unitId,
      count: body.count,
      fleetId: body.fleetId,
      legionId: body.legionId,
      planetId: body.planetId,
      beltAngle: body.beltAngle,
      name: body.name,
      note: body.note,
      apMax: apBudget.apMax,
      forceApMax: apBudget.forceApMax,
    });
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }
    const filtered = filterWorldForFaction(world, faction.id);
    sendJson(res, 200, {
      ok: true,
      intent: result.intent,
      station: result.station ?? null,
      fleet: result.fleet ?? null,
      legion: result.legion ?? null,
      stationsCatalog: listStationCatalog(),
      ...playerApBudget(world, faction.id, eco),
      economy: playerEconomy(faction.id, world),
      ...filtered,
    });
    return true;
  }

  if (url.pathname === "/api/orders" && req.method === "POST") {
    const body = await readBody(req);
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Карта ещё не опубликована" });
      return true;
    }
    const auth = authenticatePlayerFaction(body, world, req);
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    if (!auth.faction) {
      sendJson(res, 400, { error: "factionId required (player auth)" });
      return true;
    }
    const faction = auth.faction;
    const apBudget = playerApBudget(world, faction.id);
    const defId = body.type?.startsWith("intent.")
      ? body.type
      : `intent.${body.type}`;
    const result = submitIntent({
      factionId: faction.id,
      defId,
      payload: {
        fleetId: body.fleetId,
        legionId: body.legionId,
        fromSystemId: body.fromSystemId,
        toSystemId: body.toSystemId,
      },
      note: body.note,
      source: "map",
      turn: world.meta?.turn ?? 0,
      apMax: apBudget.apMax,
      forceApMax: apBudget.forceApMax,
      world,
    });
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }

    const def = getContent().intents?.[defId];
    let intentOut = result.intent;
    let worldOut = world;
    let etaOrder = null;

    const finalized = finalizeSubmittedIntent(world, result.intent, def);
    if (!finalized.ok) {
      const list = readIntents().filter((i) => i.id !== result.intent.id);
      writeIntents(list);
      sendJson(res, 400, finalized);
      return true;
    }
    worldOut = finalized.world ?? world;
    etaOrder = finalized.order ?? null;
    if (etaOrder || shouldCreateEtaOrder(def)) {
      intentOut = markIntentApplied(result.intent.id) ?? intentOut;
    } else if (
      def?.instant &&
      (defId === "intent.move_fleet" || defId === "intent.move_legion")
    ) {
      intentOut = markIntentApplied(result.intent.id) ?? intentOut;
    }

    // Legacy shape for ViewerPage
    const order = etaOrder ?? {
      id: intentOut.id,
      factionId: intentOut.factionId,
      type: body.type,
      turn: intentOut.turn,
      status: intentOut.status,
      fleetId: body.fleetId,
      legionId: body.legionId,
      fromSystemId: body.fromSystemId,
      toSystemId: body.toSystemId,
      note: body.note || "",
      createdAt: intentOut.submittedAt,
      category: intentCategory(def),
    };
    sendJson(res, 200, {
      ok: true,
      order,
      intent: intentOut,
      world: worldOut,
      ...playerApBudget(worldOut, faction.id),
    });
    return true;
  }

  if (url.pathname === "/api/orders" && req.method === "GET") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    sendJson(res, 200, readJson(ORDERS_PATH, []));
    return true;
  }

  if (url.pathname === "/api/orders/clear" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    writeJson(ORDERS_PATH, []);
    writeJson(INTENTS_PATH, []);
    sendJson(res, 200, { ok: true });
    return true;
  }

  /** Persist master map → live SoT (+ draft + lore seed). */
  return false;
}
