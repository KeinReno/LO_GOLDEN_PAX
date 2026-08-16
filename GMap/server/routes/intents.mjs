/**
 * Auto-extracted from api.mjs — intents routes.
 */
import {
  readIntents,
  writeIntents,
  submitIntent,
  cancelIntent,
} from "../intents.mjs";
import { readLiveBoard, writeLiveBoard } from "../tableStore.mjs";
import { getContent } from "../contentLoader.mjs";
import { applyInstantForceMove } from "../forceMovement.mjs";
import { shouldCreateEtaOrder } from "../orderEngine.mjs";
import { queueTaxChange } from "../economyTick.mjs";
import { setStockReserve } from "../ledger.mjs";

/**
 * @returns {Promise<boolean>}
 */
export async function tryHandleIntentRoutes(req, res, url, ctx) {
  if (!(url.pathname === "/api/intents" || url.pathname.startsWith("/api/intents/"))) return false;

  const {
    sendJson,
    readBody,
    requireMaster,
    authenticatePlayerFaction,
    requireMasterOrFactionAuth,
    playerSessionPayload,
    playerApBudget,
    playerEconomy,
    finalizeSubmittedIntent,
    markIntentApplied,
  } = ctx;

  if (url.pathname === "/api/intents" && req.method === "GET") {
    const world = readLiveBoard();
    const intentAuth = requireMasterOrFactionAuth(req, world, null);
    if (!intentAuth.ok) {
      sendJson(res, 401, { error: intentAuth.error });
      return true;
    }
    if (intentAuth.master) {
      sendJson(res, 200, readIntents());
      return true;
    }
    const factionId = intentAuth.faction.id;
    sendJson(
      res,
      200,
      readIntents().filter((i) => i.factionId === factionId),
    );
    return true;
  }

  if (url.pathname === "/api/intents" && req.method === "POST") {
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
    const faction = auth.faction;
    const apBudget = playerApBudget(world, faction.id);
    const defId =
      body.defId ||
      (body.type?.startsWith("intent.")
        ? body.type
        : `intent.${body.type}`);
    const payload = body.payload || {
      fleetId: body.fleetId,
      legionId: body.legionId,
      fromSystemId: body.fromSystemId,
      toSystemId: body.toSystemId,
    };
    const result = submitIntent({
      factionId: faction.id,
      defId,
      payload,
      note: body.note,
      source: body.source || "map",
      turn: world.meta?.turn ?? 0,
      apMax: apBudget.apMax,
      forceApMax: apBudget.forceApMax,
      world,
    });
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }

    // Honor content instant flag for stock reserves (apply now, skip tick).
    const def = getContent().intents?.[defId];
    let intentOut = result.intent;
    if (defId === "intent.reserve_stock" && def?.instant) {
      const currencyId = String(payload.currencyId || "");
      const applied = setStockReserve(
        faction.id,
        currencyId,
        Number(payload.amount) || 0,
        String(payload.label || "резерв"),
      );
      if (!applied.ok) {
        const list = readIntents().filter((i) => i.id !== result.intent.id);
        writeIntents(list);
        sendJson(res, 400, applied);
        return true;
      }
      const nowIso = new Date().toISOString();
      const list = readIntents();
      for (let i = 0; i < list.length; i++) {
        const row = list[i];
        if (!row || row.factionId !== faction.id) continue;
        if (row.id === result.intent.id) {
          list[i] = { ...row, status: "applied", resolvedAt: nowIso };
          intentOut = list[i];
          continue;
        }
        if (
          row.status === "pending" &&
          row.defId === "intent.reserve_stock" &&
          String(row.payload?.currencyId || "") === currencyId
        ) {
          list[i] = {
            ...row,
            status: "cancelled",
            cancelledAt: nowIso,
            note: `${row.note || ""} · superseded`.trim(),
          };
        }
      }
      writeIntents(list);
    }

    // Queue tax into ledger pendingPolicy immediately so viewer UI updates
    // without waiting for the next turn (rate still takes effect next tick).
    if (defId === "intent.set_tax" && def?.instant) {
      const taxSlot = String(payload.taxSlot || "");
      const tierId = String(payload.tierId || "");
      const queued = queueTaxChange(faction.id, taxSlot, tierId);
      if (!queued.ok) {
        const list = readIntents().filter((i) => i.id !== result.intent.id);
        writeIntents(list);
        sendJson(res, 400, queued);
        return true;
      }
    }

    let worldOut = world;
    if (def && shouldCreateEtaOrder(def)) {
      const finalized = finalizeSubmittedIntent(world, result.intent, def);
      if (!finalized.ok) {
        const list = readIntents().filter((i) => i.id !== result.intent.id);
        writeIntents(list);
        sendJson(res, 400, finalized);
        return true;
      }
      worldOut = finalized.world ?? world;
      intentOut = markIntentApplied(result.intent.id) ?? intentOut;
    }

    sendJson(res, 200, {
      ok: true,
      intent: intentOut,
      order: worldOut?.orders?.find((o) => o.intentId === result.intent.id) ?? null,
      world: worldOut,
      ...playerApBudget(worldOut, faction.id),
      economy: playerEconomy(faction.id, worldOut),
    });
    return true;
  }

  if (
    url.pathname.startsWith("/api/intents/") &&
    url.pathname.endsWith("/cancel") &&
    req.method === "POST"
  ) {
    const body = await readBody(req);
    const intentId = url.pathname.split("/")[3];
    const world = readLiveBoard();
    const auth = authenticatePlayerFaction(body, world, req);
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    const faction = auth.faction;
    const result = cancelIntent(intentId, faction.id);
    if (!result.ok) {
      sendJson(res, 400, result);
      return true;
    }
    const turn = world?.meta?.turn ?? 0;
    sendJson(res, 200, {
      ...result,
      ...playerApBudget(world, faction.id),
      economy: playerEconomy(faction.id, world),
    });
    return true;
  }

  /** Public status for UI (no secrets). Master-only — avoids leaking WAN/tunnel URLs. */
  return false;
}
