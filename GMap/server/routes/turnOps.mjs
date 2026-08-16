/**
 * Auto-extracted from api.mjs — turnOps routes.
 */
import { processTurn, getLastJournal } from "../processTurn.mjs";
import {
  getTurnHealth,
  runOpsBackup,
  clearTickAlerts,
} from "../opsHealth.mjs";
import { getFactionBriefing } from "../briefingFilter.mjs";
import { readLiveBoard, writeLiveBoard, backupTurnSnapshot, bumpTableRevision, setTableMeta, getTableMeta } from "../tableStore.mjs";
import { getSchedulerStatus } from "../tickScheduler.mjs";

/**
 * @returns {Promise<boolean>}
 */
export async function tryHandleTurnOpsRoutes(req, res, url, ctx) {
  if (!(url.pathname.startsWith("/api/turn/") || url.pathname.startsWith("/api/ops/") || url.pathname === "/api/backup/run" || url.pathname === "/api/player/briefing")) return false;

  const {
    sendJson,
    readBody,
    requireMaster,
    requireMasterOrFactionAuth,
    buildOpsHealthResponse,
  } = ctx;

  if (url.pathname === "/api/turn/tick" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = await readBody(req);
    const result = processTurn({ force: !!body?.force, master: true });
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }

  if (url.pathname === "/api/player/briefing" && req.method === "GET") {
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Карта ещё не опубликована" });
      return true;
    }
    const briefAuth = requireMasterOrFactionAuth(req, world, null);
    if (!briefAuth.ok || briefAuth.master) {
      sendJson(res, 401, { error: briefAuth.error || "Нужен пароль государства" });
      return true;
    }
    const factionId = briefAuth.faction.id;
    sendJson(res, 200, {
      briefing: getFactionBriefing(factionId, world),
      turn: world.meta?.turn ?? null,
    });
    return true;
  }

  if (url.pathname === "/api/turn/journal" && req.method === "GET") {
    const world = readLiveBoard();
    const auth = requireMasterOrFactionAuth(req, world, null);
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    sendJson(res, 200, { journal: getLastJournal(), meta: getTableMeta() });
    return true;
  }

  if (url.pathname === "/api/turn/freeze" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = await readBody(req);
    const meta = setTableMeta({ tickFrozen: !!body?.frozen });
    sendJson(res, 200, { ok: true, meta });
    return true;
  }

  if (
    (url.pathname === "/api/turn/health" ||
      url.pathname === "/api/ops/health") &&
    req.method === "GET"
  ) {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    sendJson(res, 200, buildOpsHealthResponse());
    return true;
  }

  if (url.pathname === "/api/turn/alerts/clear" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    sendJson(res, 200, clearTickAlerts());
    return true;
  }

  if (url.pathname === "/api/backup/run" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = await readBody(req);
    const result = runOpsBackup(body?.reason || "manual");
    sendJson(res, 200, result);
    return true;
  }
  return false;
}
