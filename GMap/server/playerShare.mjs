/**
 * One-click player share: publish map + public tunnel.
 * Prefers production server (dist) so Vite HMR doesn't white-screen through tunnels.
 * Order: CloudPub (RF) → Cloudflare → ngrok → localtunnel.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import https from "node:https";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEV_PORT = Number(process.env.GMAP_PORT || process.env.PORT || 5173);
const PROD_PORT = Number(process.env.GMAP_SHARE_PORT || 4173);

const g = globalThis;
if (!g.__gmapPlayerShare) {
  g.__gmapPlayerShare = {
    provider: null,
    publicUrl: null,
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
  };
}
const state = g.__gmapPlayerShare;

function pushLog(line) {
  state.logTail.push(String(line).slice(0, 400));
  if (state.logTail.length > 50) state.logTail.shift();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function findOnPath(names) {
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

function normalizePublicUrl(raw) {
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

function extractPublicUrl(text) {
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

function cloudpubTokenPath() {
  return path.join(ROOT, "data", "cloudpub-token.txt");
}

function cloudpubClientTomlPath() {
  return path.join(
    process.env.APPDATA || path.join(os.homedir(), "AppData/Roaming"),
    "cloudpub",
    "client.toml",
  );
}

function readCloudPubTokenFromToml() {
  const yml = cloudpubClientTomlPath();
  if (!fs.existsSync(yml)) return null;
  try {
    const m = fs.readFileSync(yml, "utf8").match(/^\s*token\s*=\s*"([^"]+)"/m);
    return m?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

function getCloudPubToken() {
  const fromEnv = String(
    process.env.GMAP_CLOUDPUB_TOKEN || process.env.CLOUDPUB_TOKEN || "",
  ).trim();
  if (fromEnv) return fromEnv;
  try {
    const p = cloudpubTokenPath();
    if (fs.existsSync(p)) {
      const t = fs.readFileSync(p, "utf8").trim();
      if (t) return t;
    }
  } catch {
    /* ignore */
  }
  return readCloudPubTokenFromToml();
}

function hasCloudPubToken() {
  return !!getCloudPubToken();
}

/** Save CloudPub API token (local file + clo set token when binary exists). */
export function configureCloudPubToken(token) {
  const t = String(token || "").trim();
  if (!t || t.length < 10) {
    throw new Error("Слишком короткий CloudPub API-ключ");
  }
  fs.mkdirSync(path.dirname(cloudpubTokenPath()), { recursive: true });
  fs.writeFileSync(cloudpubTokenPath(), `${t}\n`, "utf8");
  const bin = findCloBin();
  if (bin) {
    spawnSync(bin, ["set", "token", t], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 15000,
    });
  }
  return { ok: true, path: cloudpubTokenPath() };
}

function findCloBin() {
  const bundled = path.join(
    ROOT,
    "tools",
    "cloudpub",
    process.platform === "win32" ? "clo.exe" : "clo",
  );
  if (fs.existsSync(bundled)) return bundled;
  const fromPath = findOnPath(["clo", "clo.exe"]);
  if (fromPath) return fromPath;
  const candidates = [
    path.join(process.env.LOCALAPPDATA || "", "cloudpub", "clo.exe"),
    path.join(process.env.ProgramFiles || "", "cloudpub", "clo.exe"),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

function parseCloudPubLs(text) {
  const rows = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = line.match(
      /^(online|offline)\s+([0-9a-f-]{36})\s+(?:\[([^\]]*)\]\s+)?(\S+)\s+->\s+(https?:\/\/\S+)/i,
    );
    if (!m) continue;
    rows.push({
      status: m[1].toLowerCase(),
      guid: m[2],
      name: (m[3] || "").trim(),
      local: m[4],
      url: normalizePublicUrl(m[5]),
    });
  }
  return rows;
}

function cloudPubLs() {
  const bin = findCloBin();
  if (!bin) return [];
  const r = spawnSync(bin, ["ls"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 20000,
  });
  return parseCloudPubLs(`${r.stdout || ""}\n${r.stderr || ""}`);
}

function cloudPubUnpublish(guid) {
  const bin = findCloBin();
  if (!bin || !guid) return;
  spawnSync(bin, ["unpublish", guid], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 20000,
  });
}

function ensureCloudPubTokenConfigured() {
  const token = getCloudPubToken();
  if (!token) {
    throw new Error(
      "Нужен CloudPub API-ключ — вставь его в поле ниже (cloudpub.ru → кабинет) или clo set token",
    );
  }
  const bin = findCloBin();
  if (!bin) {
    throw new Error(
      "clo.exe не найден — положи CLI в GMap/tools/cloudpub/ (скачай с cloudpub.ru)",
    );
  }
  // Sync token into clo config (idempotent).
  spawnSync(bin, ["set", "token", token], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 15000,
  });
  return { bin, token };
}

function ngrokConfigPath() {
  return path.join(
    process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData/Local"),
    "ngrok",
    "ngrok.yml",
  );
}

function hasNgrokToken() {
  if (process.env.NGROK_AUTHTOKEN) return true;
  const yml = ngrokConfigPath();
  if (!fs.existsSync(yml)) return false;
  try {
    return /authtoken\s*:/.test(fs.readFileSync(yml, "utf8"));
  } catch {
    return false;
  }
}

/** Save ngrok authtoken so one-click share can use ngrok. */
export function configureNgrokAuthtoken(token) {
  const t = String(token || "").trim();
  if (!t || t.length < 10) {
    throw new Error("Слишком короткий ngrok authtoken");
  }
  const ymlPath = ngrokConfigPath();
  fs.mkdirSync(path.dirname(ymlPath), { recursive: true });
  fs.writeFileSync(
    ymlPath,
    `version: "2"\nauthtoken: ${t}\n`,
    "utf8",
  );
  const bin = findNgrokBin();
  if (bin) {
    spawnSync(bin, ["config", "add-authtoken", t], {
      encoding: "utf8",
      windowsHide: true,
    });
  }
  return { ok: true, path: ymlPath };
}

function findNgrokBin() {
  const fromPath = findOnPath(["ngrok", "ngrok.exe"]);
  if (fromPath) return fromPath;
  const roots = [
    process.env.LOCALAPPDATA || "",
    process.env.ProgramFiles || "",
  ];
  for (const root of roots) {
    const winget = path.join(root, "Microsoft/WinGet/Packages");
    if (!fs.existsSync(winget)) continue;
    const hit = walkFind(winget, "ngrok.exe", 6);
    if (hit) return hit;
  }
  return null;
}

function walkFind(dir, fileName, depth) {
  if (depth < 0) return null;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isFile() && e.name.toLowerCase() === fileName.toLowerCase()) {
      return full;
    }
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const hit = walkFind(path.join(dir, e.name), fileName, depth - 1);
    if (hit) return hit;
  }
  return null;
}

function killChild(child) {
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

function killTunnelAgents() {
  if (process.platform === "win32") {
    for (const im of ["cloudflared.exe", "ngrok.exe"]) {
      spawnSync("taskkill", ["/IM", im, "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    }
  }
}

function httpGetLocal(port, urlPath) {
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

async function localHealthOk(port) {
  try {
    const r = await httpGetLocal(port, "/api/health");
    return !!(r.json && r.json.ok);
  } catch {
    return false;
  }
}

function fetchText(url, headers = {}) {
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

function parseLocaIp(html) {
  const m =
    html.match(/hosted by:\s*<\/?(?:strong|b|span)[^>]*>\s*([0-9.]+)/i) ||
    html.match(/hosted by:\s*([0-9.]+)/i) ||
    html.match(/IP Address:[\s\S]{0,80}?([0-9]{1,3}(?:\.[0-9]{1,3}){3})/i);
  return m?.[1] || null;
}

async function inspectPublicUrl(publicUrl) {
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

async function verifyTunnel(publicUrl) {
  for (let i = 0; i < 6; i++) {
    const meta = await inspectPublicUrl(publicUrl);
    if (meta.alive) return meta;
    await sleep(1000);
  }
  return { alive: false, ip: null, isLocaGate: false, status: 0 };
}

async function pollNgrokApi(timeoutMs = 40000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const data = await httpGetLocal(4040, "/api/tunnels");
      for (const t of data.json?.tunnels || []) {
        const url = normalizePublicUrl(t.public_url);
        if (url?.startsWith("https:")) return url;
      }
    } catch {
      /* wait */
    }
    await sleep(400);
  }
  return null;
}

function waitUrlFromChild(child, timeoutMs) {
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

/** Prefer built app on 4173 — avoids blank Vite pages through tunnels. */
async function ensureShareTargetPort(devPort) {
  const distIndex = path.join(ROOT, "dist", "index.html");

  if (await localHealthOk(PROD_PORT)) {
    pushLog(`share target: existing prod :${PROD_PORT}`);
    state.targetPort = PROD_PORT;
    return PROD_PORT;
  }

  if (!fs.existsSync(distIndex)) {
    pushLog("dist missing — building…");
    const build = spawnSync(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["run", "build"],
      {
        cwd: ROOT,
        encoding: "utf8",
        windowsHide: true,
        shell: process.platform === "win32",
        timeout: 180000,
      },
    );
    if (build.status !== 0 || !fs.existsSync(distIndex)) {
      pushLog("build failed — falling back to vite dev port");
      state.targetPort = devPort;
      return devPort;
    }
  }

  pushLog(`starting prod server :${PROD_PORT}`);
  if (state.prodChild) {
    killChild(state.prodChild);
    state.prodChild = null;
  }
  const child = spawn(
    process.execPath,
    [path.join(ROOT, "server/serve.mjs")],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(PROD_PORT),
        HOST: "127.0.0.1",
        NODE_ENV: "production",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  state.prodChild = child;
  child.stdout?.on("data", (b) => pushLog(b.toString("utf8")));
  child.stderr?.on("data", (b) => pushLog(b.toString("utf8")));

  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    if (await localHealthOk(PROD_PORT)) {
      state.targetPort = PROD_PORT;
      return PROD_PORT;
    }
    await sleep(400);
  }
  pushLog("prod server slow — using vite port");
  state.targetPort = devPort;
  return devPort;
}

async function startLocaltunnel(localPort) {
  let lt;
  try {
    lt = (await import("localtunnel")).default;
  } catch {
    throw new Error("localtunnel не установлен");
  }

  const tunnel = await Promise.race([
    lt({ port: localPort, local_host: "127.0.0.1" }),
    sleep(25000).then(() => {
      throw new Error("localtunnel: таймаут");
    }),
  ]);

  const url = normalizePublicUrl(tunnel.url);
  if (!url) {
    try {
      tunnel.close();
    } catch {
      /* ignore */
    }
    throw new Error("localtunnel не вернул URL");
  }

  const child = {
    _tunnel: tunnel,
    pid: -1,
    exitCode: null,
    killed: false,
    on(event, cb) {
      if (event === "exit") {
        tunnel.once("close", () => {
          this.exitCode = 0;
          cb(0);
        });
      }
    },
  };
  return { child, url, provider: "localtunnel" };
}

async function startNgrok(localPort) {
  const bin = findNgrokBin();
  if (!bin) throw new Error("ngrok не установлен");
  if (!hasNgrokToken()) {
    throw new Error(
      "Нужен ngrok authtoken — вставь его в поле ниже (один раз) или на ngrok.com",
    );
  }

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/IM", "ngrok.exe", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  }

  const args = ["http", String(localPort), "--log=stdout"];
  if (process.env.NGROK_AUTHTOKEN) {
    args.push(`--authtoken=${process.env.NGROK_AUTHTOKEN}`);
  }

  const child = spawn(bin, args, {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  const fromLogs = waitUrlFromChild(child, 15000).catch(() => null);
  const fromApi = pollNgrokApi(40000);
  const url = (await fromLogs) || (await fromApi);
  if (!url) {
    killChild(child);
    throw new Error("ngrok не отдал URL");
  }
  return { child, url, provider: "ngrok" };
}

async function startCloudflare(localPort) {
  const which = spawnSync(
    process.platform === "win32" ? "where" : "which",
    ["cloudflared"],
    { encoding: "utf8", windowsHide: true },
  );
  let bin =
    which.status === 0 ? which.stdout.trim().split(/\r?\n/)[0].trim() : null;
  if (!bin) {
    const c = path.join(
      process.env.LOCALAPPDATA || "",
      "Microsoft/WinGet/Links/cloudflared.exe",
    );
    if (fs.existsSync(c)) bin = c;
  }
  if (!bin) throw new Error("cloudflared не найден");

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/IM", "cloudflared.exe", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  }
  await sleep(400);

  const child = spawn(bin, ["tunnel", "--url", `http://127.0.0.1:${localPort}`], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const url = await waitUrlFromChild(child, 45000);
  return { child, url, provider: "cloudflare" };
}

async function startCloudPub(localPort) {
  const { bin } = ensureCloudPubTokenConfigured();

  // Drop stale GMap publications so we don't pile up endpoints.
  // IMPORTANT: do NOT run `clo ls` again while publish is running —
  // a second clo process with the same agent_id sends Stop and kills the tunnel.
  for (const row of cloudPubLs()) {
    if (
      row.name === "GMap" ||
      row.local?.includes(`:${localPort}`) ||
      /:4173\b/.test(row.local || "")
    ) {
      pushLog(`cloudpub unpublish stale ${row.guid}`);
      cloudPubUnpublish(row.guid);
    }
  }
  await sleep(600);

  const child = spawn(
    bin,
    ["-v", "publish", "http", String(localPort), "-n", "GMap"],
    {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: { ...process.env },
    },
  );

  let guid = null;
  const grabGuid = (buf) => {
    const text = buf.toString("utf8");
    const m =
      text.match(/guid:\s*"([0-9a-f-]{36})"/i) ||
      text.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i);
    // Prefer explicit guid: "..." from EndpointAck; avoid matching unrelated UUIDs in paths
    const explicit = text.match(/guid:\s*"([0-9a-f-]{36})"/i);
    if (explicit) guid = explicit[1];
    else if (!guid && m && /EndpointAck|ServerEndpoint|опубликован/i.test(text)) {
      guid = m[1];
    }
  };
  child.stdout?.on("data", grabGuid);
  child.stderr?.on("data", grabGuid);

  const url = await waitUrlFromChild(child, 50000);
  if (!childAlive(child)) {
    throw new Error("cloudpub: процесс publish завершился сразу после URL");
  }
  state.cloudpubGuid = guid;
  pushLog(`cloudpub up ${url} guid=${guid || "?"}`);
  return { child, url, provider: "cloudpub", guid };
}

function childAlive(child) {
  return !!(child && child.exitCode == null && !child.killed);
}

function hintFor(provider, ip) {
  if (provider === "cloudpub") {
    return "CloudPub (РФ) — открой ссылку как есть, без жёлтых страниц.";
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

export function getPlayerShareStatus() {
  const alive = childAlive(state.child);
  return {
    active: !!(state.publicUrl && alive),
    starting: state.starting,
    provider: state.provider,
    publicUrl: state.publicUrl,
    viewUrl: state.publicUrl ? `${state.publicUrl}/view` : null,
    startedAt: state.startedAt,
    error: state.error,
    playerHint: state.playerHint,
    endpointIp: state.endpointIp,
    hasNgrokToken: hasNgrokToken(),
    hasCloudPubToken: hasCloudPubToken(),
    hasCloudPubCli: !!findCloBin(),
    targetPort: state.targetPort,
  };
}

export function stopPlayerShare() {
  const guid = state.cloudpubGuid;
  const wasCloudPub = state.provider === "cloudpub";
  if (state.child) {
    killChild(state.child);
    state.child = null;
  }
  // Unpublish only after killing our agent — never `clo ls` while publish runs.
  if (guid && wasCloudPub) {
    cloudPubUnpublish(guid);
  }
  killTunnelAgents();
  // keep prod server — useful for republish; kill only tunnels
  state.provider = null;
  state.publicUrl = null;
  state.startedAt = null;
  state.error = null;
  state.starting = false;
  state.playerHint = null;
  state.endpointIp = null;
  state.cloudpubGuid = null;
  return { ok: true };
}

/**
 * @param {{ prefer?: string, localPort?: number, force?: boolean, ngrokAuthtoken?: string, cloudpubToken?: string }} opts
 */
export async function startPlayerShare(opts = {}) {
  if (opts.ngrokAuthtoken) {
    configureNgrokAuthtoken(opts.ngrokAuthtoken);
  }
  if (opts.cloudpubToken) {
    configureCloudPubToken(opts.cloudpubToken);
  }

  if (!opts.force) {
    const status = getPlayerShareStatus();
    if (status.active && status.publicUrl) {
      const meta = await verifyTunnel(status.publicUrl);
      if (meta.alive) {
        if (meta.ip) {
          state.endpointIp = meta.ip;
          state.playerHint = hintFor(status.provider, meta.ip);
        }
        return getPlayerShareStatus();
      }
      stopPlayerShare();
    }
  } else {
    stopPlayerShare();
  }

  if (state.starting) {
    const t0 = Date.now();
    while (state.starting && Date.now() - t0 < 120000) {
      await sleep(400);
    }
    return getPlayerShareStatus();
  }

  state.starting = true;
  state.error = null;
  state.playerHint = null;
  state.endpointIp = null;
  state.cloudpubGuid = null;

  const devPort = opts.localPort || DEV_PORT;
  const prefer = (
    opts.prefer ||
    process.env.GMAP_SHARE_PROVIDER ||
    "auto"
  ).toLowerCase();

  let targetPort;
  try {
    targetPort = await ensureShareTargetPort(devPort);
  } catch (e) {
    state.starting = false;
    throw e;
  }

  const order =
    prefer === "localtunnel" || prefer === "lt"
      ? [startLocaltunnel, startCloudPub, startCloudflare, startNgrok]
      : prefer === "cloudflare"
        ? [startCloudflare, startCloudPub, startNgrok, startLocaltunnel]
        : prefer === "ngrok"
          ? [startNgrok, startCloudPub, startCloudflare, startLocaltunnel]
          : prefer === "cloudpub" || prefer === "clo"
            ? // Explicit CloudPub — do not silently fall back to trycloudflare (МТС).
              [startCloudPub]
            : // Default for RF: CloudPub first when CLI+token exist
              hasCloudPubToken() && findCloBin()
              ? [startCloudPub, startCloudflare, startNgrok, startLocaltunnel]
              : hasNgrokToken()
                ? [startNgrok, startCloudPub, startCloudflare, startLocaltunnel]
                : [startCloudPub, startCloudflare, startNgrok, startLocaltunnel];

  const errors = [];
  try {
    killTunnelAgents();
    await sleep(300);

    for (const starter of order) {
      let child = null;
      try {
        pushLog(`try ${starter.name} on :${targetPort}`);
        const started = await starter(targetPort);
        child = started.child;
        const { url, provider } = started;
        if (started.guid) state.cloudpubGuid = started.guid;

        const meta = await verifyTunnel(url);
        if (!meta.alive) {
          killChild(child);
          if (provider === "cloudpub" && state.cloudpubGuid) {
            cloudPubUnpublish(state.cloudpubGuid);
            state.cloudpubGuid = null;
          }
          throw new Error(`${provider}: туннель не отвечает`);
        }

        let endpointIp = meta.ip;
        if (provider === "localtunnel" && !endpointIp) {
          const gate = await fetchText(url);
          endpointIp = parseLocaIp(gate.body);
        }

        state.child = child;
        state.publicUrl = url;
        state.provider = provider;
        state.startedAt = new Date().toISOString();
        state.error = null;
        state.endpointIp = endpointIp;
        state.playerHint = hintFor(provider, endpointIp);
        state.starting = false;
        child.on("exit", () => {
          if (state.child === child) {
            state.child = null;
            state.publicUrl = null;
            state.provider = null;
            state.cloudpubGuid = null;
          }
        });
        return getPlayerShareStatus();
      } catch (e) {
        if (child) killChild(child);
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(msg);
        pushLog(msg);
      }
    }

    const err =
      errors.join(" | ") ||
      "Не удалось открыть доступ. Установи CloudPub CLI (tools/cloudpub/clo.exe) и API-ключ с cloudpub.ru.";
    state.error = err;
    state.starting = false;
    throw new Error(err);
  } catch (e) {
    state.starting = false;
    throw e;
  }
}
