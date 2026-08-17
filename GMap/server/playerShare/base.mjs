/**
 * Player-share shared state + generic network/process helpers.
 * Extracted from ../playerShare.mjs — no provider-specific logic here.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import https from "node:https";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..", "..");
export const DEV_PORT = Number(process.env.GMAP_PORT || process.env.PORT || 5173);
export const PROD_PORT = Number(process.env.GMAP_SHARE_PORT || 4173);

const g = globalThis;
if (!g.__gmapPlayerShare) {
  g.__gmapPlayerShare = {
    provider: null,
    publicUrl: null,
    lastViewUrl: null,
    child: null,
    prodChild: null,
    startedAt: null,
    error: null,
    starting: false,
    playerHint: null,
    endpointIp: null,
    targetPort: null,
    cloudpubGuid: null,
    logTail: [],
    healthOk: null,
    lastHealthAt: null,
    lastHealthError: null,
    downSince: null,
    reconnectAttempts: 0,
    reconnectInFlight: false,
    watchdogTimer: null,
    wanIp: null,
    wanIpAt: null,
    directViewUrl: null,
    directHint: null,
    urlRotated: false,
    previousViewUrl: null,
  };
}
export const state = g.__gmapPlayerShare;

export function pushLog(line) {
  state.logTail.push(String(line).slice(0, 400));
  if (state.logTail.length > 50) state.logTail.shift();
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function findOnPath(names) {
  for (const name of names) {
    const which = spawnSync(
      process.platform === "win32" ? "where" : "which",
      [name],
      { encoding: "utf8", windowsHide: true },
    );
    if (which.status === 0 && which.stdout.trim()) {
      return which.stdout.trim().split(/\r?\n/)[0].trim();
    }
  }
  return null;
}

export function normalizePublicUrl(raw) {
  let u = String(raw || "").trim().replace(/\/$/, "");
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    const parsed = new URL(u);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

export function extractPublicUrl(text) {
  const patterns = [
    /https:\/\/[a-z0-9.-]+\.cloudpub\.ru(?::\d+)?/i,
    /https:\/\/[a-z0-9.-]+\.loca\.lt/i,
    /https:\/\/[a-z0-9.-]+\.localtunnel\.me/i,
    /https:\/\/[a-z0-9.-]+\.pinggy-free\.link/i,
    /https:\/\/[a-z0-9.-]+\.run\.pinggy\.link/i,
    /https:\/\/[a-z0-9.-]+\.a\.pinggy\.io/i,
    /https:\/\/[a-z0-9.-]+\.pinggy\.io/i,
    /https:\/\/[a-z0-9.-]+\.pinggy\.link/i,
    /https:\/\/[a-z0-9-]+\.ngrok-free\.app/i,
    /https:\/\/[a-z0-9-]+\.ngrok\.app/i,
    /https:\/\/[a-z0-9-]+\.ngrok\.io/i,
    /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return normalizePublicUrl(m[0]);
  }
  return null;
}

export function killChild(child) {
  if (!child) return;
  if (child._tunnel) {
    try {
      child._tunnel.close();
    } catch {
      /* ignore */
    }
    child.killed = true;
    child.exitCode = 0;
    return;
  }
  if (!child.pid || child.pid < 0) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
}

export function killTunnelAgents() {
  if (process.platform === "win32") {
    for (const im of ["cloudflared.exe", "ngrok.exe"]) {
      spawnSync("taskkill", ["/IM", im, "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    }
  }
}

export function childAlive(child) {
  return !!(child && child.exitCode == null && !child.killed);
}

export function httpGetLocal(port, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: urlPath,
        method: "GET",
        timeout: 2500,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve({
              status: res.statusCode,
              body: Buffer.concat(chunks).toString("utf8"),
              json: (() => {
                try {
                  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
                } catch {
                  return null;
                }
              })(),
            });
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.end();
  });
}

export async function localHealthOk(port) {
  try {
    const r = await httpGetLocal(port, "/api/health");
    return !!(r.json && r.json.ok);
  } catch {
    return false;
  }
}

export function fetchText(url, headers = {}) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const lib = u.protocol === "https:" ? https : http;
      const req = lib.request(
        {
          hostname: u.hostname,
          port: u.port || (u.protocol === "https:" ? 443 : 80),
          path: u.pathname + u.search,
          method: "GET",
          timeout: 10000,
          headers: {
            "User-Agent": "GMap-share-check",
            "Bypass-Tunnel-Reminder": "1",
            ...headers,
          },
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            resolve({
              status: res.statusCode || 0,
              body: Buffer.concat(chunks).toString("utf8"),
            });
          });
        },
      );
      req.on("error", () => resolve({ status: 0, body: "" }));
      req.on("timeout", () => {
        req.destroy();
        resolve({ status: 0, body: "" });
      });
      req.end();
    } catch {
      resolve({ status: 0, body: "" });
    }
  });
}

export function parseLocaIp(html) {
  const m =
    html.match(/hosted by:\s*<\/?(?:strong|b|span)[^>]*>\s*([0-9.]+)/i) ||
    html.match(/hosted by:\s*([0-9.]+)/i) ||
    html.match(/IP Address:[\s\S]{0,80}?([0-9]{1,3}(?:\.[0-9]{1,3}){3})/i);
  return m?.[1] || null;
}

export async function inspectPublicUrl(publicUrl) {
  const { status, body } = await fetchText(publicUrl + "/api/health");
  const ip = parseLocaIp(body);
  const isLocaGate =
    /loca\.lt/i.test(publicUrl) &&
    (/IP Address/i.test(body) || /tunnel is hosted by/i.test(body));
  const okJson = /"ok"\s*:\s*true/.test(body);
  const okHttp = status > 0 && status < 500;
  // loca gate still means tunnel is up
  const alive = okJson || isLocaGate || (okHttp && /ngrok|ok|GMap|html/i.test(body));
  return { alive, ip, isLocaGate, status };
}

export async function verifyTunnel(publicUrl) {
  for (let i = 0; i < 6; i++) {
    const meta = await inspectPublicUrl(publicUrl);
    if (meta.alive) return meta;
    await sleep(1000);
  }
  return { alive: false, ip: null, isLocaGate: false, status: 0 };
}

export function looksLikeIpv4(s) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(String(s || "").trim());
}

/** Public WAN IP (white IP). Refreshed on share start / reconnect / watchdog. */
export async function fetchPublicWanIp() {
  const urls = [
    "https://api.ipify.org",
    "https://ifconfig.me/ip",
    "https://icanhazip.com",
  ];
  for (const url of urls) {
    const { status, body } = await fetchText(url);
    const ip = String(body || "")
      .trim()
      .split(/\s+/)[0];
    if (status > 0 && status < 500 && looksLikeIpv4(ip)) return ip;
  }
  return null;
}

export function buildDirectViewUrl(wanIp, port) {
  const host = String(process.env.GMAP_DIRECT_HOST || "").trim();
  const p = Number(port) || PROD_PORT;
  if (host) {
    // Stable DDNS / domain — players keep one bookmark across IP changes.
    return `http://${host.replace(/^https?:\/\//i, "").replace(/\/$/, "")}:${p}/view`;
  }
  if (wanIp && looksLikeIpv4(wanIp)) {
    return `http://${wanIp}:${p}/view`;
  }
  return null;
}

export async function refreshDirectAccess(port = state.targetPort || PROD_PORT) {
  try {
    const wanIp = await fetchPublicWanIp();
    if (wanIp) {
      state.wanIp = wanIp;
      state.wanIpAt = new Date().toISOString();
    }
    state.directViewUrl = buildDirectViewUrl(state.wanIp, port);
    const hasDdns = !!String(process.env.GMAP_DIRECT_HOST || "").trim();
    state.directHint = state.directViewUrl
      ? hasDdns
        ? `Прямой доступ (DDNS): пробрось TCP ${port} на этот ПК. При смене IP обнови запись у провайдера DDNS.`
        : `Прямой IP: пробрось TCP ${port} → этот ПК на роутере. Проверка: LTE (не Wi‑Fi дома) → открыть ссылку. IP обновляется при старте/рестарте шары.`
      : "Белый IP не определился — прямая ссылка недоступна, используй CloudPub.";
    if (state.wanIp) pushLog(`wan ip ${state.wanIp} direct=${state.directViewUrl || "-"}`);
  } catch (e) {
    pushLog(`wan ip fail: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function hintFor(provider, ip) {
  if (provider === "cloudpub") {
    return "CloudPub (РФ) — открой ссылку как есть. Не запускай clo ls / второй clo — это гасит туннель.";
  }
  if (provider === "localtunnel") {
    if (ip) {
      return `На жёлтой странице loca.lt в поле IP введи ровно: ${ip} → Continue. Потом откроется карта.`;
    }
    return "На жёлтой странице loca.lt введи IP, который написан сверху (hosted by) → Continue.";
  }
  if (provider === "ngrok") {
    return "Если будет страница ngrok — нажми Visit Site. Потом /view.";
  }
  if (provider === "cloudflare") {
    return "Если не открывается с МТС — Стоп и снова «Открыть доступ» (попробует CloudPub).";
  }
  return null;
}

export function deriveShareStatus() {
  if (state.starting) return "starting";
  if (state.reconnectInFlight) return "degraded";
  const alive = childAlive(state.child);
  if (state.publicUrl && alive && state.healthOk !== false) return "online";
  if (state.publicUrl || state.lastViewUrl) {
    if (!alive || state.healthOk === false) return "down";
    return "online";
  }
  return "idle";
}

export function waitUrlFromChild(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (url) => {
      if (settled) return;
      settled = true;
      resolve(url);
    };
    const fail = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    const onData = (buf) => {
      const text = buf.toString("utf8");
      pushLog(text);
      const url = extractPublicUrl(text);
      if (url) done(url);
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", fail);
    child.on("exit", (code) => {
      if (!settled) fail(new Error(`Туннель завершился (код ${code})`));
    });
    setTimeout(() => {
      if (!settled) fail(new Error("Таймаут ожидания публичного URL"));
    }, timeoutMs);
  });
}
