/**
 * Auto-extracted from api.mjs — playersShare routes.
 */
import {
  configureCloudPubToken,
  configureNgrokAuthtoken,
  getPlayerShareStatus,
  startPlayerShare,
  stopPlayerShare,
} from "../playerShare.mjs";
import { checkMasterToken } from "../auth.mjs";
import { readLiveBoard, writeLiveBoard } from "../tableStore.mjs";

/**
 * @returns {Promise<boolean>}
 */
export async function tryHandlePlayersShareRoutes(req, res, url, ctx) {
  if (!(url.pathname.startsWith("/api/players/"))) return false;

  const {
    sendJson,
    readBody,
    requireMaster,
  } = ctx;

  if (url.pathname === "/api/players/share" && req.method === "GET") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    sendJson(res, 200, getPlayerShareStatus());
    return true;
  }

  /** Publish + open tunnel; returns copyable /view URL. */
  if (url.pathname === "/api/players/share" && req.method === "POST") {
    const token = req.headers["x-master-token"];
    if (!checkMasterToken(token)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = await readBody(req);
    if (body?.world?.meta && Array.isArray(body.world.systems)) {
      writeLiveBoard(body.world, { backup: true, reason: "share_publish" });
    } else {
      const published = readLiveBoard();
      if (!published) {
        sendJson(res, 400, {
          error:
            "Карта ещё не опубликована — передай world в теле или нажми «Опубликовать»",
        });
        return true;
      }
    }

    try {
      const hostHeader = String(req.headers.host || "");
      const portFromHost = Number(hostHeader.split(":")[1]);
      const share = await startPlayerShare({
        prefer: body?.prefer,
        force: body?.force === true,
        ngrokAuthtoken: body?.ngrokAuthtoken,
        cloudpubToken: body?.cloudpubToken,
        localPort:
          Number(body?.port) ||
          (Number.isFinite(portFromHost) ? portFromHost : undefined),
      });
      if (!share.viewUrl) {
        sendJson(res, 502, {
          error: share.error || "Туннель не поднялся",
          share,
        });
        return true;
      }
      sendJson(res, 200, { ok: true, ...share });
    } catch (e) {
      sendJson(res, 502, {
        error: e instanceof Error ? e.message : String(e),
        share: getPlayerShareStatus(),
      });
    }
    return true;
  }

  if (url.pathname === "/api/players/ngrok-token" && req.method === "POST") {
    const token = req.headers["x-master-token"];
    if (!checkMasterToken(token)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = await readBody(req);
    try {
      sendJson(res, 200, configureNgrokAuthtoken(body?.token));
    } catch (e) {
      sendJson(res, 400, {
        error: e instanceof Error ? e.message : String(e),
      });
    }
    return true;
  }

  if (url.pathname === "/api/players/cloudpub-token" && req.method === "POST") {
    const token = req.headers["x-master-token"];
    if (!checkMasterToken(token)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = await readBody(req);
    try {
      sendJson(res, 200, configureCloudPubToken(body?.token));
    } catch (e) {
      sendJson(res, 400, {
        error: e instanceof Error ? e.message : String(e),
      });
    }
    return true;
  }

  if (url.pathname === "/api/players/share/stop" && req.method === "POST") {
    const token = req.headers["x-master-token"];
    if (!checkMasterToken(token)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    sendJson(res, 200, stopPlayerShare());
    return true;
  }
  return false;
}
