/**
 * Auto-extracted from api.mjs — fogIntel routes.
 */
import {
  readFog,
  paintFog,
  addPermanentReveal,
} from "../fogStore.mjs";
import { readLiveBoard, bumpTableRevision, getVersionPayload } from "../tableStore.mjs";
import { setKnowledgeLevel, publicIntelPayload } from "../intel.mjs";

/**
 * @returns {Promise<boolean>}
 */
export async function tryHandleFogIntelRoutes(req, res, url, ctx) {
  if (!(url.pathname === "/api/fog" || url.pathname.startsWith("/api/fog/") || url.pathname === "/api/intel/set")) return false;

  const {
    sendJson,
    readBody,
    requireMaster,
  } = ctx;

  if (url.pathname === "/api/fog" && req.method === "GET") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    sendJson(res, 200, readFog());
    return true;
  }

  if (url.pathname === "/api/fog/paint" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = await readBody(req);
    if (!body?.factionId || !Array.isArray(body.systemIds)) {
      sendJson(res, 400, { error: "factionId + systemIds[]" });
      return true;
    }
    const fog = paintFog(
      body.factionId,
      body.systemIds,
      body.mode === "erase" ? "erase" : "paint",
    );
    bumpTableRevision();
    sendJson(res, 200, { ok: true, fog, version: getVersionPayload() });
    return true;
  }

  if (url.pathname === "/api/fog/reveal" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = await readBody(req);
    if (!body?.factionId || !body?.systemId) {
      sendJson(res, 400, { error: "factionId + systemId" });
      return true;
    }
    const fog = addPermanentReveal(body.factionId, body.systemId);
    bumpTableRevision();
    sendJson(res, 200, { ok: true, fog });
    return true;
  }

  if (url.pathname === "/api/intel/set" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = await readBody(req);
    if (!body?.factionId || !body?.entityType || !body?.entityId) {
      sendJson(res, 400, {
        error: "factionId + entityType + entityId + level",
      });
      return true;
    }
    const world = readLiveBoard();
    const turn = world?.meta?.turn ?? 0;
    const changed = setKnowledgeLevel(
      body.factionId,
      body.entityType,
      body.entityId,
      body.level ?? 1,
      { source: body.source || "gm", turn },
    );
    bumpTableRevision();
    sendJson(res, 200, {
      ok: true,
      changed,
      intel: publicIntelPayload(body.factionId),
    });
    return true;
  }
  return false;
}
