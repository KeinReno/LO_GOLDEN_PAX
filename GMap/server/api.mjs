import {
  configureCloudPubToken,
  configureNgrokAuthtoken,
  getPlayerShareStatus,
  startPlayerShare,
  stopPlayerShare,
} from "./playerShare.mjs";
import {
  DATA_DIR,
  PUBLISHED_PATH,
  ORDERS_PATH,
  DRAFT_PATH,
  LORE_PATH,
  INTENTS_PATH,
  ensureDataDir,
  readJson,
  writeJson,
  readLiveBoard,
  writeLiveBoard,
  getVersionPayload,
  backupTurnSnapshot,
  getTableMeta,
  setTableMeta,
} from "./tableStore.mjs";
import { getContent, getPublicContent, loadContent } from "./contentLoader.mjs";
import {
  buildModifierStack,
  explainStack,
  resolveApMax,
  collectRaceEffects,
} from "./modifierStack.mjs";
import {
  readIntents,
  submitIntent,
  cancelIntent,
  reservedAp,
} from "./intents.mjs";
import { processTurn, getLastJournal } from "./processTurn.mjs";
import { startTickScheduler } from "./tickScheduler.mjs";

export {
  DATA_DIR,
  PUBLISHED_PATH,
  ORDERS_PATH,
  DRAFT_PATH,
  LORE_PATH,
  ensureDataDir,
  readJson,
  writeJson,
};

const MASTER_TOKEN = process.env.GMAP_MASTER_TOKEN || "master2142";

function requireMaster(req) {
  return req.headers["x-master-token"] === MASTER_TOKEN;
}

function factionHasFullMapVision(faction) {
  if (!faction) return false;
  if (faction.fullMapVision === true) return true;
  return faction.id === "faction_belator";
}

function getVisibleSystemIds(world, factionId) {
  const faction = (world.factions ?? []).find((f) => f.id === factionId);
  if (factionHasFullMapVision(faction)) {
    return new Set((world.systems ?? []).map((s) => s.id));
  }
  const visible = new Set();
  for (const s of world.systems ?? []) {
    if (s.ownerFactionId === factionId) visible.add(s.id);
    if ((s.visibleToFactionIds ?? []).includes(factionId)) visible.add(s.id);
  }
  for (const f of world.fleets ?? []) {
    if (f.factionId === factionId) visible.add(f.systemId);
  }
  for (const l of world.legions ?? []) {
    if (l.factionId === factionId) visible.add(l.systemId);
  }
  return visible;
}

function filterWorldForFaction(world, factionId) {
  const visible = getVisibleSystemIds(world, factionId);
  const systems = (world.systems ?? []).filter((s) => visible.has(s.id));
  const systemSet = new Set(systems.map((s) => s.id));
  const links = (world.links ?? []).filter(
    (l) => systemSet.has(l.fromId) && systemSet.has(l.toId),
  );
  const fleets = (world.fleets ?? []).filter(
    (f) => f.factionId === factionId || systemSet.has(f.systemId),
  );
  const legions = (world.legions ?? []).filter(
    (l) => l.factionId === factionId || systemSet.has(l.systemId),
  );
  const playerOrders = readJson(ORDERS_PATH, []).filter(
    (o) => o.factionId === factionId,
  );
  const factions = (world.factions ?? []).map((f) => ({
    ...f,
    password: f.id === factionId ? f.password : "••••",
  }));

  return {
    visibleSystemIds: [...visible],
    world: {
      ...world,
      systems,
      links,
      fleets,
      legions,
      orders: playerOrders,
      factions,
    },
  };
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

/**
 * Connect-style middleware for Vite / Express.
 */
export function createApiMiddleware() {
  ensureDataDir();
  loadContent(["core"]);
  startTickScheduler({
    getCron: () => getContent().rules?.tickCron || "1 0 * * *",
    getTimezone: () => getContent().rules?.tickTimezone || "Europe/Moscow",
    onTick: () => processTurn({ force: false }),
  });

  return async function gmapApi(req, res, next) {
    const url = new URL(req.url || "/", "http://localhost");
    if (!url.pathname.startsWith("/api/")) {
      next?.();
      return;
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, X-Master-Token, X-Faction-Id, X-Faction-Password",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    try {
      if (url.pathname === "/api/health" && req.method === "GET") {
        sendJson(res, 200, {
          ok: true,
          version: getVersionPayload(),
          contentLoadedAt: getContent().loadedAt,
        });
        return;
      }

      if (url.pathname === "/api/content" && req.method === "GET") {
        if (url.searchParams.get("reload") === "1" && requireMaster(req)) {
          loadContent(["core"]);
        }
        sendJson(res, 200, getPublicContent());
        return;
      }

      if (url.pathname === "/api/content/stack-preview" && req.method === "POST") {
        const body = await readBody(req);
        const effects = Array.isArray(body.effects) ? [...body.effects] : [];
        if (body.raceComposition) {
          effects.push(
            ...collectRaceEffects(getContent().races, body.raceComposition),
          );
        }
        const stack = buildModifierStack(effects, {
          mergeOrder: getContent().rules?.economyMergeOrder,
        });
        sendJson(res, 200, {
          apMax: resolveApMax(getContent().rules?.apPerTurn ?? 3, stack),
          explain: explainStack(stack),
          channels: stack.channels,
        });
        return;
      }

      if (url.pathname === "/api/table" && req.method === "GET") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const world = readLiveBoard();
        if (!world) {
          sendJson(res, 404, {
            error: "Live board пуст — сохраните/опубликуйте кампанию",
            mode: "empty",
          });
          return;
        }
        sendJson(res, 200, {
          mode: "live",
          world,
          version: getVersionPayload(),
          intents: readIntents().filter((i) => i.status === "pending"),
        });
        return;
      }

      if (url.pathname === "/api/table/backup" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const world = readLiveBoard();
        const dir = backupTurnSnapshot(world?.meta?.turn ?? 0, "manual");
        sendJson(res, 200, { ok: true, dir });
        return;
      }

      if (url.pathname === "/api/turn/tick" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const body = await readBody(req);
        const result = processTurn({ force: !!body?.force, master: true });
        sendJson(res, result.ok ? 200 : 400, result);
        return;
      }

      if (url.pathname === "/api/turn/journal" && req.method === "GET") {
        sendJson(res, 200, { journal: getLastJournal(), meta: getTableMeta() });
        return;
      }

      if (url.pathname === "/api/turn/freeze" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const body = await readBody(req);
        const meta = setTableMeta({ tickFrozen: !!body?.frozen });
        sendJson(res, 200, { ok: true, meta });
        return;
      }

      if (url.pathname === "/api/intents" && req.method === "GET") {
        if (requireMaster(req)) {
          sendJson(res, 200, readIntents());
          return;
        }
        const factionId = req.headers["x-faction-id"];
        if (!factionId) {
          sendJson(res, 401, { error: "Нужен master token или X-Faction-Id" });
          return;
        }
        sendJson(
          res,
          200,
          readIntents().filter((i) => i.factionId === factionId),
        );
        return;
      }

      if (url.pathname === "/api/intents" && req.method === "POST") {
        const body = await readBody(req);
        const world = readLiveBoard();
        if (!world) {
          sendJson(res, 404, { error: "Карта ещё не опубликована" });
          return;
        }
        const faction = (world.factions ?? []).find((f) => f.id === body.factionId);
        if (!faction || faction.password !== body.password) {
          sendJson(res, 401, { error: "Неверный пароль" });
          return;
        }
        const apMax = resolveApMax(
          getContent().rules?.apPerTurn ?? 3,
          buildModifierStack([]),
        );
        const defId =
          body.defId ||
          (body.type?.startsWith("intent.")
            ? body.type
            : `intent.${body.type}`);
        const result = submitIntent({
          factionId: faction.id,
          defId,
          payload: body.payload || {
            fleetId: body.fleetId,
            legionId: body.legionId,
            fromSystemId: body.fromSystemId,
            toSystemId: body.toSystemId,
          },
          note: body.note,
          source: body.source || "map",
          turn: world.meta?.turn ?? 0,
          apMax,
        });
        if (!result.ok) {
          sendJson(res, 400, result);
          return;
        }
        sendJson(res, 200, {
          ok: true,
          intent: result.intent,
          reservedAp: reservedAp(faction.id, world.meta?.turn ?? 0),
          apMax,
        });
        return;
      }

      if (
        url.pathname.startsWith("/api/intents/") &&
        url.pathname.endsWith("/cancel") &&
        req.method === "POST"
      ) {
        const body = await readBody(req);
        const intentId = url.pathname.split("/")[3];
        const world = readLiveBoard();
        const faction = (world?.factions ?? []).find((f) => f.id === body.factionId);
        if (!faction || faction.password !== body.password) {
          sendJson(res, 401, { error: "Неверный пароль" });
          return;
        }
        const result = cancelIntent(intentId, faction.id);
        sendJson(res, result.ok ? 200 : 400, result);
        return;
      }

      /** Public status for UI (no secrets). */
      if (url.pathname === "/api/players/share" && req.method === "GET") {
        sendJson(res, 200, getPlayerShareStatus());
        return;
      }

      /** Publish + open tunnel; returns copyable /view URL. */
      if (url.pathname === "/api/players/share" && req.method === "POST") {
        const token = req.headers["x-master-token"];
        if (token !== MASTER_TOKEN) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
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
            return;
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
            return;
          }
          sendJson(res, 200, { ok: true, ...share });
        } catch (e) {
          sendJson(res, 502, {
            error: e instanceof Error ? e.message : String(e),
            share: getPlayerShareStatus(),
          });
        }
        return;
      }

      if (url.pathname === "/api/players/ngrok-token" && req.method === "POST") {
        const token = req.headers["x-master-token"];
        if (token !== MASTER_TOKEN) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const body = await readBody(req);
        try {
          sendJson(res, 200, configureNgrokAuthtoken(body?.token));
        } catch (e) {
          sendJson(res, 400, {
            error: e instanceof Error ? e.message : String(e),
          });
        }
        return;
      }

      if (url.pathname === "/api/players/cloudpub-token" && req.method === "POST") {
        const token = req.headers["x-master-token"];
        if (token !== MASTER_TOKEN) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const body = await readBody(req);
        try {
          sendJson(res, 200, configureCloudPubToken(body?.token));
        } catch (e) {
          sendJson(res, 400, {
            error: e instanceof Error ? e.message : String(e),
          });
        }
        return;
      }

      if (url.pathname === "/api/players/share/stop" && req.method === "POST") {
        const token = req.headers["x-master-token"];
        if (token !== MASTER_TOKEN) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        sendJson(res, 200, stopPlayerShare());
        return;
      }

      if (url.pathname === "/api/factions" && req.method === "GET") {
        const world = readLiveBoard();
        if (!world) {
          sendJson(res, 404, { error: "Карта ещё не опубликована" });
          return;
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
        return;
      }

      if (url.pathname === "/api/publish" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const world = await readBody(req);
        const written = writeLiveBoard(world, {
          backup: true,
          reason: "publish",
        });
        sendJson(res, 200, {
          ok: true,
          turn: written.turn,
          updatedAt: written.updatedAt,
          tableRevision: written.tableRevision,
        });
        return;
      }

      /** Lightweight poll for player clients — no secrets. */
      if (url.pathname === "/api/map-version" && req.method === "GET") {
        const version = getVersionPayload();
        if (!version.ok) {
          sendJson(res, 404, { error: "Карта ещё не опубликована", ...version });
          return;
        }
        sendJson(res, 200, version);
        return;
      }

      /** Re-fetch fog-filtered map without full re-login UI. */
      if (url.pathname === "/api/view-refresh" && req.method === "POST") {
        const body = await readBody(req);
        const world = readLiveBoard();
        if (!world) {
          sendJson(res, 404, { error: "Карта ещё не опубликована" });
          return;
        }
        const faction = (world.factions ?? []).find((f) => f.id === body.factionId);
        if (!faction || faction.password !== body.password) {
          sendJson(res, 401, { error: "Неверный пароль государства" });
          return;
        }
        const filtered = filterWorldForFaction(world, faction.id);
        sendJson(res, 200, {
          factionId: faction.id,
          updatedAt: world.meta?.updatedAt ?? null,
          tableRevision: world.meta?.tableRevision ?? 0,
          ...filtered,
        });
        return;
      }

      if (url.pathname === "/api/login" && req.method === "POST") {
        const body = await readBody(req);
        const world = readLiveBoard();
        if (!world) {
          sendJson(res, 404, { error: "Карта ещё не опубликована" });
          return;
        }
        const faction = (world.factions ?? []).find((f) => f.id === body.factionId);
        if (!faction || faction.password !== body.password) {
          sendJson(res, 401, { error: "Неверный пароль государства" });
          return;
        }
        const filtered = filterWorldForFaction(world, faction.id);
        sendJson(res, 200, {
          factionId: faction.id,
          updatedAt: world.meta?.updatedAt ?? null,
          tableRevision: world.meta?.tableRevision ?? 0,
          apMax: resolveApMax(
            getContent().rules?.apPerTurn ?? 3,
            buildModifierStack([]),
          ),
          reservedAp: reservedAp(faction.id, world.meta?.turn ?? 0),
          ...filtered,
        });
        return;
      }

      if (url.pathname === "/api/orders" && req.method === "POST") {
        const body = await readBody(req);
        const world = readLiveBoard();
        if (!world) {
          sendJson(res, 404, { error: "Карта ещё не опубликована" });
          return;
        }
        const faction = (world.factions ?? []).find((f) => f.id === body.factionId);
        if (!faction || faction.password !== body.password) {
          sendJson(res, 401, { error: "Неверный пароль" });
          return;
        }
        const apMax = resolveApMax(
          getContent().rules?.apPerTurn ?? 3,
          buildModifierStack([]),
        );
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
          apMax,
        });
        if (!result.ok) {
          sendJson(res, 400, result);
          return;
        }
        // Legacy shape for ViewerPage
        const order = {
          id: result.intent.id,
          factionId: result.intent.factionId,
          type: body.type,
          turn: result.intent.turn,
          status: result.intent.status,
          fleetId: body.fleetId,
          fromSystemId: body.fromSystemId,
          toSystemId: body.toSystemId,
          note: body.note || "",
          createdAt: result.intent.submittedAt,
        };
        sendJson(res, 200, { ok: true, order, intent: result.intent, apMax });
        return;
      }

      if (url.pathname === "/api/orders" && req.method === "GET") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        sendJson(res, 200, readJson(ORDERS_PATH, []));
        return;
      }

      if (url.pathname === "/api/orders/clear" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        writeJson(ORDERS_PATH, []);
        writeJson(INTENTS_PATH, []);
        sendJson(res, 200, { ok: true });
        return;
      }

      /** Persist master map → live SoT (+ draft + lore seed). */
      if (url.pathname === "/api/save-campaign" && req.method === "POST") {
        if (!requireMaster(req)) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const world = await readBody(req);
        if (!world?.meta || !Array.isArray(world.systems)) {
          sendJson(res, 400, { error: "Ожидается flat WorldState (meta + systems)" });
          return;
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
        return;
      }

      sendJson(res, 404, { error: "Unknown API route" });
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };
}
