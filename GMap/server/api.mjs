import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  configureCloudPubToken,
  configureNgrokAuthtoken,
  getPlayerShareStatus,
  startPlayerShare,
  stopPlayerShare,
} from "./playerShare.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(__dirname, "../data");
export const PUBLISHED_PATH = path.join(DATA_DIR, "published.json");
export const ORDERS_PATH = path.join(DATA_DIR, "player-orders.json");
export const DRAFT_PATH = path.join(DATA_DIR, "campaign-draft.json");
export const LORE_PATH = path.resolve(
  __dirname,
  "../public/campaigns/lo_golden_pax.json",
);

const MASTER_TOKEN = process.env.GMAP_MASTER_TOKEN || "master2142";

export function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJson(file, data) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
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
        sendJson(res, 200, { ok: true });
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
          const world = body.world;
          world.meta.updatedAt = new Date().toISOString();
          writeJson(PUBLISHED_PATH, world);
        } else {
          const published = readJson(PUBLISHED_PATH, null);
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
        const world = readJson(PUBLISHED_PATH, null);
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
        const token = req.headers["x-master-token"];
        if (token !== MASTER_TOKEN) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const world = await readBody(req);
        if (world?.meta) {
          world.meta.updatedAt = new Date().toISOString();
        }
        writeJson(PUBLISHED_PATH, world);
        // Keep player orders across republish (they are turn proposals)
        sendJson(res, 200, {
          ok: true,
          turn: world.meta?.turn ?? 0,
          updatedAt: world.meta?.updatedAt ?? null,
        });
        return;
      }

      /** Lightweight poll for player clients — no secrets. */
      if (url.pathname === "/api/map-version" && req.method === "GET") {
        const world = readJson(PUBLISHED_PATH, null);
        if (!world) {
          sendJson(res, 404, { error: "Карта ещё не опубликована" });
          return;
        }
        sendJson(res, 200, {
          turn: world.meta?.turn ?? 0,
          updatedAt: world.meta?.updatedAt ?? null,
          systems: Array.isArray(world.systems) ? world.systems.length : 0,
        });
        return;
      }

      /** Re-fetch fog-filtered map without full re-login UI. */
      if (url.pathname === "/api/view-refresh" && req.method === "POST") {
        const body = await readBody(req);
        const world = readJson(PUBLISHED_PATH, null);
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
          ...filtered,
        });
        return;
      }

      if (url.pathname === "/api/login" && req.method === "POST") {
        const body = await readBody(req);
        const world = readJson(PUBLISHED_PATH, null);
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
          ...filtered,
        });
        return;
      }

      if (url.pathname === "/api/orders" && req.method === "POST") {
        const body = await readBody(req);
        const world = readJson(PUBLISHED_PATH, null);
        if (!world) {
          sendJson(res, 404, { error: "Карта ещё не опубликована" });
          return;
        }
        const faction = (world.factions ?? []).find((f) => f.id === body.factionId);
        if (!faction || faction.password !== body.password) {
          sendJson(res, 401, { error: "Неверный пароль" });
          return;
        }
        const orders = readJson(ORDERS_PATH, []);
        const order = {
          id: body.id || `ord_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          factionId: faction.id,
          type: body.type,
          turn: world.meta?.turn ?? 0,
          status: "pending",
          fleetId: body.fleetId,
          fromSystemId: body.fromSystemId,
          toSystemId: body.toSystemId,
          note: body.note || "",
          createdAt: new Date().toISOString(),
        };
        orders.push(order);
        writeJson(ORDERS_PATH, orders);
        sendJson(res, 200, { ok: true, order });
        return;
      }

      if (url.pathname === "/api/orders" && req.method === "GET") {
        const token = req.headers["x-master-token"];
        if (token !== MASTER_TOKEN) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        sendJson(res, 200, readJson(ORDERS_PATH, []));
        return;
      }

      if (url.pathname === "/api/orders/clear" && req.method === "POST") {
        const token = req.headers["x-master-token"];
        if (token !== MASTER_TOKEN) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        writeJson(ORDERS_PATH, []);
        sendJson(res, 200, { ok: true });
        return;
      }

      /** Persist master map edits into lore seed + local draft (flat WorldState).
       *  Also publishes for players so /view picks up changes immediately. */
      if (url.pathname === "/api/save-campaign" && req.method === "POST") {
        const token = req.headers["x-master-token"];
        if (token !== MASTER_TOKEN) {
          sendJson(res, 401, { error: "Неверный мастер-токен" });
          return;
        }
        const world = await readBody(req);
        if (!world?.meta || !Array.isArray(world.systems)) {
          sendJson(res, 400, { error: "Ожидается flat WorldState (meta + systems)" });
          return;
        }
        world.meta.updatedAt = new Date().toISOString();
        writeJson(DRAFT_PATH, world);
        const loreDir = path.dirname(LORE_PATH);
        if (!fs.existsSync(loreDir)) fs.mkdirSync(loreDir, { recursive: true });
        writeJson(LORE_PATH, world);
        writeJson(PUBLISHED_PATH, world);
        sendJson(res, 200, {
          ok: true,
          published: true,
          systems: world.systems.length,
          turn: world.meta?.turn ?? 0,
          savedAt: world.meta.updatedAt,
          updatedAt: world.meta.updatedAt,
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
