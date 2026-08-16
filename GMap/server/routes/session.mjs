/**
 * Auto-extracted from api.mjs — session routes.
 */
import {
  readLiveBoard,
  writeLiveBoard,
  getVersionPayload,
  backupTurnSnapshot,
  getTableMeta,
  setTableMeta,
  bumpTableRevision,
  readJson,
  writeJson,
  DRAFT_PATH,
  LORE_PATH,
} from "../tableStore.mjs";
import {
  readLedger,
  writeLedger,
  ensureAllFactions,
  getFactionPublicEco,
} from "../ledger.mjs";
import { getDataFileSizes } from "../db/storeAdapter.mjs";
import {
  masterTokenInfo,
  checkMasterToken,
  writeMasterTokenFile,
} from "../auth.mjs";
import { loginWithPassword, issueSessionToken } from "../playerAuth.mjs";
import { readIntents } from "../intents.mjs";
import { getContent } from "../contentLoader.mjs";

/**
 * @returns {Promise<boolean>}
 */
export async function tryHandleSessionRoutes(req, res, url, ctx) {
  if (!(url.pathname === "/api/table" || url.pathname.startsWith("/api/table/") || url.pathname === "/api/ledger" || url.pathname.startsWith("/api/ledger/") || url.pathname.startsWith("/api/auth/") || url.pathname === "/api/factions" || url.pathname === "/api/publish" || url.pathname === "/api/map-version" || url.pathname === "/api/view-refresh" || url.pathname === "/api/login" || url.pathname === "/api/save-campaign")) return false;

  const {
    sendJson,
    readBody,
    requireMaster,
    authenticatePlayerFaction,
    requireMasterOrFactionAuth,
    playerSessionPayload,
    playerEconomy,
  } = ctx;

  if (url.pathname === "/api/table" && req.method === "GET") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, {
        error: "Live board пуст — сохраните/опубликуйте кампанию",
        mode: "empty",
      });
      return true;
    }
    sendJson(res, 200, {
      mode: "live",
      world,
      version: getVersionPayload(),
      intents: readIntents().filter((i) => i.status === "pending"),
    });
    return true;
  }

  if (url.pathname === "/api/table/backup" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const world = readLiveBoard();
    const dir = backupTurnSnapshot(world?.meta?.turn ?? 0, "manual");
    sendJson(res, 200, { ok: true, dir });
    return true;
  }


  if (url.pathname === "/api/ledger" && req.method === "GET") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const world = readLiveBoard();
    const ledger = world
      ? ensureAllFactions(readLedger(), world)
      : readLedger();
    if (world) writeLedger(ledger);
    sendJson(res, 200, ledger);
    return true;
  }


  if (url.pathname.startsWith("/api/ledger/") && req.method === "GET") {
    const factionId = url.pathname.split("/")[3];
    const world = readLiveBoard();
    const ledgerAuth = requireMasterOrFactionAuth(req, world, factionId);
    if (!ledgerAuth.ok) {
      sendJson(res, 401, { error: ledgerAuth.error });
      return true;
    }
    if (ledgerAuth.master) {
      sendJson(res, 200, getFactionPublicEco(factionId));
      return true;
    }
    if (ledgerAuth.faction.id !== factionId) {
      sendJson(res, 403, { error: "forbidden_faction" });
      return true;
    }
    sendJson(res, 200, playerEconomy(factionId, world));
    return true;
  }


  if (url.pathname === "/api/auth/info" && req.method === "GET") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    sendJson(res, 200, masterTokenInfo());
    return true;
  }

  if (url.pathname === "/api/auth/token" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const body = await readBody(req);
    const result = writeMasterTokenFile(body?.token);
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }


  if (url.pathname === "/api/factions" && req.method === "GET") {
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Карта ещё не опубликована" });
      return true;
    }
    sendJson(
      res,
      200,
      (world.factions ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        color: f.color,
      })),
    );
    return true;
  }

  if (url.pathname === "/api/publish" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const world = await readBody(req);
    const expectedRevision =
      world?.expectedRevision ?? world?.meta?.tableRevision ?? null;
    const written = writeLiveBoard(world, {
      backup: true,
      reason: "publish",
      expectedRevision:
        expectedRevision != null ? Number(expectedRevision) : undefined,
    });
    if (written?.ok === false && written.conflict) {
      sendJson(res, 409, {
        error: "Конфликт ревизии — перезагрузите стол и опубликуйте снова",
        tableRevision: written.tableRevision,
      });
      return true;
    }
    sendJson(res, 200, {
      ok: true,
      turn: written.turn,
      updatedAt: written.updatedAt,
      tableRevision: written.tableRevision,
    });
    return true;
  }

  /** Lightweight poll for player clients — no secrets. */
  if (url.pathname === "/api/map-version" && req.method === "GET") {
    const version = getVersionPayload();
    if (!version.ok) {
      sendJson(res, 404, { error: "Карта ещё не опубликована", ...version });
      return true;
    }
    sendJson(res, 200, version);
    return true;
  }

  /** Re-fetch fog-filtered map without full re-login UI. */
  if (url.pathname === "/api/view-refresh" && req.method === "POST") {
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
    const extra = {};
    if (auth.via === "password") extra.playerToken = issueSessionToken(auth.faction.id);
    sendJson(res, 200, { ...playerSessionPayload(world, auth.faction), ...extra });
    return true;
  }

  if (url.pathname === "/api/login" && req.method === "POST") {
    const body = await readBody(req);
    const world = readLiveBoard();
    if (!world) {
      sendJson(res, 404, { error: "Карта ещё не опубликована" });
      return true;
    }
    const auth = loginWithPassword(world, body);
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return true;
    }
    sendJson(res, 200, {
      ...playerSessionPayload(world, auth.faction),
      playerToken: auth.playerToken,
    });
    return true;
  }

  /** Instant planet management: build / demolish / colonize / set_colony_type. */

  if (url.pathname === "/api/save-campaign" && req.method === "POST") {
    if (!requireMaster(req)) {
      sendJson(res, 401, { error: "Неверный мастер-токен" });
      return true;
    }
    const world = await readBody(req);
    if (!world?.meta || !Array.isArray(world.systems)) {
      sendJson(res, 400, { error: "Ожидается flat WorldState (meta + systems)" });
      return true;
    }
    const written = writeLiveBoard(world, {
      backup: true,
      reason: "save_campaign",
      alsoDraft: true,
      alsoLore: true,
    });
    sendJson(res, 200, {
      ok: true,
      published: true,
      mode: "live",
      systems: written.world.systems.length,
      turn: written.turn,
      savedAt: written.updatedAt,
      updatedAt: written.updatedAt,
      tableRevision: written.tableRevision,
      paths: [
        "data/campaign-draft.json",
        "public/campaigns/lo_golden_pax.json",
        "data/published.json",
      ],
    });
    return true;
  }

  return false;
}
