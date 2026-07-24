/**
 * Сессия для игроков: локальный Vite + публикация карты + туннель/LAN.
 *
 *   npm run players          — CloudPub (РФ, предпочтительно)
 *   npm run players:cloudpub
 *   npm run players:ngrok
 *   npm run players:pinggy   — SSH-туннель Pinggy (часто без установки)
 *   npm run players:playit   — playit.gg (агент + туннель в кабинете)
 *   npm run players:radmin   — только Radmin/LAN (ПК, не мобилки)
 *   npm run players:tunnel   — cloudflared trycloudflare (на МТС часто мёртв)
 *
 * Опционально: GMAP_PUBLIC_URL=https://...  — подставить свой URL вручную
 *               GMAP_PORT=5173
 *               GMAP_MASTER_TOKEN=...
 *               GMAP_CLOUDPUB_TOKEN=...
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.GMAP_PORT || 5173);
const HOST = `http://127.0.0.1:${PORT}`;
const MASTER = process.env.GMAP_MASTER_TOKEN || "master2142";
const LORE = path.join(ROOT, "public/campaigns/lo_golden_pax.json");
const DRAFT = path.join(ROOT, "data/campaign-draft.json");
const OUT_URL = path.join(ROOT, "tmp/player-url.txt");
const OUT_META = path.join(ROOT, "tmp/player-session.json");
const MANUAL_URL_FILE = path.join(ROOT, "tmp/public-url.txt");

const mode = (
  process.argv[2] ||
  process.env.GMAP_SHARE_MODE ||
  "cloudpub"
).toLowerCase();

const children = [];
let startedVite = false;
let shuttingDown = false;

function log(...args) {
  console.log("[players]", ...args);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function httpJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, HOST);
    const payload =
      body == null ? null : Buffer.from(JSON.stringify(body), "utf8");
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        headers: {
          ...headers,
          ...(payload
            ? {
                "Content-Type": "application/json; charset=utf-8",
                "Content-Length": payload.length,
              }
            : {}),
        },
        timeout: 15000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let data = text;
          try {
            data = text ? JSON.parse(text) : null;
          } catch {
            /* keep text */
          }
          if (res.statusCode && res.statusCode >= 400) {
            reject(
              new Error(
                typeof data === "object" && data?.error
                  ? data.error
                  : text || String(res.statusCode),
              ),
            );
            return;
          }
          resolve(data);
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function httpGetLocal(port, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: urlPath,
        method: "GET",
        timeout: 3000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
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

async function healthOk() {
  try {
    const h = await httpJson("GET", "/api/health");
    return !!(h && h.ok);
  } catch {
    return false;
  }
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

function findCloudflared() {
  const fromPath = findOnPath(["cloudflared", "cloudflared.exe"]);
  if (fromPath) return fromPath;
  const candidates = [
    path.join(
      process.env.LOCALAPPDATA || "",
      "Microsoft/WinGet/Links/cloudflared.exe",
    ),
    path.join(process.env.ProgramFiles || "", "cloudflared/cloudflared.exe"),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

function findNgrok() {
  return findOnPath(["ngrok", "ngrok.exe"]);
}

function findPlayit() {
  const fromPath = findOnPath(["playit", "playit.exe"]);
  if (fromPath) return fromPath;
  const candidates = [
    path.join(process.env.LOCALAPPDATA || "", "playit_gg/playit.exe"),
    path.join(process.env.LOCALAPPDATA || "", "playit/playit.exe"),
    path.join(process.env.ProgramFiles || "", "playit_gg/playit.exe"),
    path.join(os.homedir(), "AppData/Local/playit_gg/playit.exe"),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

function findSsh() {
  return findOnPath(["ssh", "ssh.exe"]);
}

function listShareIps() {
  const ifaces = os.networkInterfaces();
  const all = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const a of addrs || []) {
      if (a.family !== "IPv4" && a.family !== 4) continue;
      if (a.internal) continue;
      const ip = a.address;
      if (ip.startsWith("169.254.")) continue;
      const lower = name.toLowerCase();
      const kind = lower.includes("radmin")
        ? "radmin"
        : lower.includes("tailscale") || ip.startsWith("100.")
          ? "tailscale"
          : ip.startsWith("192.168.") ||
              ip.startsWith("10.") ||
              /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
            ? "lan"
            : "other";
      all.push({ name, ip, kind });
    }
  }
  const score = (k) =>
    k === "radmin" ? 0 : k === "lan" ? 1 : k === "tailscale" ? 2 : 3;
  all.sort((a, b) => score(a.kind) - score(b.kind) || a.ip.localeCompare(b.ip));
  return all;
}

function track(child, label) {
  children.push({ child, label });
  child.on("exit", (code, signal) => {
    if (!shuttingDown) {
      log(`${label} завершился (code=${code}, signal=${signal})`);
    }
  });
  return child;
}

function killTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        /* ignore */
      }
    }
  }
}

function shutdown(reason = "stop") {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`Остановка (${reason})…`);
  for (const { child, label } of [...children].reverse()) {
    log(`гашу ${label} pid=${child.pid}`);
    killTree(child.pid);
  }
  try {
    if (fs.existsSync(OUT_URL)) fs.unlinkSync(OUT_URL);
  } catch {
    /* ignore */
  }
  process.exit(0);
}

function pickCampaignPath() {
  const loreExists = fs.existsSync(LORE);
  const draftExists = fs.existsSync(DRAFT);
  if (draftExists && loreExists) {
    const d = fs.statSync(DRAFT).mtimeMs;
    const l = fs.statSync(LORE).mtimeMs;
    return d >= l ? DRAFT : LORE;
  }
  if (draftExists) return DRAFT;
  if (loreExists) return LORE;
  return null;
}

async function waitForHealth(timeoutMs = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await healthOk()) return true;
    await sleep(500);
  }
  return false;
}

async function publishCampaign() {
  const file = pickCampaignPath();
  if (!file) {
    log(
      "Нет lo_golden_pax.json / campaign-draft.json — публикуй вручную из редактора.",
    );
    return false;
  }
  const world = JSON.parse(fs.readFileSync(file, "utf8"));
  log(
    `Публикую ${path.relative(ROOT, file)} (${world.systems?.length ?? 0} систем)…`,
  );
  const res = await httpJson("POST", "/api/publish", world, {
    "X-Master-Token": MASTER,
  });
  log(`Опубликовано, ход ${res?.turn ?? world.meta?.turn ?? "?"}`);
  return true;
}

function startVite() {
  log(`Стартую Vite на 0.0.0.0:${PORT}…`);
  startedVite = true;
  const child = spawn(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "dev", "--", "--port", String(PORT), "--host", "0.0.0.0"],
    {
      cwd: ROOT,
      env: { ...process.env, FORCE_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      shell: process.platform === "win32",
    },
  );
  track(child, "vite");
  child.stdout.on("data", (b) => process.stdout.write(b));
  child.stderr.on("data", (b) => process.stderr.write(b));
}

function ensureFirewallRule() {
  if (process.platform !== "win32") return;
  try {
    const name = `GMap players ${PORT}`;
    const check = spawnSync(
      "netsh",
      ["advfirewall", "firewall", "show", "rule", `name=${name}`],
      { encoding: "utf8", windowsHide: true },
    );
    if (check.status === 0 && check.stdout.includes(name)) return;
    const add = spawnSync(
      "netsh",
      [
        "advfirewall",
        "firewall",
        "add",
        "rule",
        `name=${name}`,
        "dir=in",
        "action=allow",
        "protocol=TCP",
        `localport=${PORT}`,
        "profile=any",
      ],
      { encoding: "utf8", windowsHide: true },
    );
    if (add.status === 0) log(`Firewall: открыл TCP ${PORT}`);
  } catch {
    /* ignore */
  }
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
    /https:\/\/[a-z0-9-]+\.ngrok-free\.app/i,
    /https:\/\/[a-z0-9-]+\.ngrok\.io/i,
    /https:\/\/[a-z0-9.-]+\.pinggy-free\.link/i,
    /https:\/\/[a-z0-9.-]+\.a\.pinggy\.io/i,
    /https:\/\/[a-z0-9.-]+\.pinggy\.io/i,
    /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i,
    /https?:\/\/[a-z0-9.-]+\.(?:gl\.)?at\.ply\.gg(?::\d+)?/i,
    /https?:\/\/[a-z0-9.-]+\.playit\.gg(?::\d+)?/i,
    /https?:\/\/[a-z0-9.-]+\.pla\.yt(?::\d+)?/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return normalizePublicUrl(m[0]);
  }
  return null;
}

function writeSession(baseUrl, extra = {}) {
  fs.mkdirSync(path.join(ROOT, "tmp"), { recursive: true });
  const view = `${baseUrl}/view`;
  fs.writeFileSync(OUT_URL, view, "utf8");
  fs.writeFileSync(
    OUT_META,
    JSON.stringify(
      {
        mode,
        viewUrl: view,
        editorUrl: `${baseUrl}/`,
        localView: `${HOST}/view`,
        startedAt: new Date().toISOString(),
        startedVite,
        ...extra,
      },
      null,
      2,
    ),
    "utf8",
  );
}

function bannerPublic(label, url) {
  const view = `${url}/view`;
  console.log("\n" + "=".repeat(64));
  console.log(`  GMap — ${label}`);
  console.log("=".repeat(64));
  console.log(`  ИГРОКАМ (телефон / любой интернет):\n    ${view}`);
  console.log(`  Мастер:\n    ${url}/`);
  console.log(`  Локально:\n    ${HOST}/view`);
  console.log("-".repeat(64));
  console.log("  ПК включён, это окно открыто. Ctrl+C — стоп.");
  console.log(`  Ссылка также в: tmp/player-url.txt`);
  console.log("=".repeat(64) + "\n");
}

function bannerRadmin(ips) {
  const radmin = ips.filter((x) => x.kind === "radmin");
  const primary = radmin[0] || ips[0];
  if (!primary) {
    console.log("\nНет сетевых IP. Включи Radmin VPN и перезапусти.\n");
    return null;
  }
  const base = `http://${primary.ip}:${PORT}`;
  console.log("\n" + "=".repeat(64));
  console.log("  GMap — Radmin / LAN (с мобилки обычно НЕ зайти)");
  console.log("=".repeat(64));
  console.log(`  ПК в той же Radmin-сети:\n    ${base}/view`);
  for (const x of ips) {
    console.log(`    http://${x.ip}:${PORT}/view  (${x.kind})`);
  }
  console.log("  Для телефона: npm run players:ngrok | players:pinggy");
  console.log("=".repeat(64) + "\n");
  return base;
}

async function ensureServerAndPublish() {
  if (!(await healthOk())) {
    startVite();
    if (!(await waitForHealth())) {
      throw new Error("Vite не поднялся за 60с");
    }
  } else {
    log(`Сервер уже работает на ${HOST}`);
  }
  try {
    await publishCampaign();
  } catch (e) {
    log("Публикация не удалась:", e instanceof Error ? e.message : e);
    log("Можно опубликовать вручную в редакторе.");
  }
}

function holdProcess() {
  setInterval(() => {}, 1 << 30);
}

/** Wait until stdout/stderr yields a public URL (or reject). */
function waitUrlFromProcess(child, label, timeoutMs = 60000) {
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
      process.stderr.write(buf);
      const url = extractPublicUrl(text);
      if (url) done(url);
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", fail);
    child.on("exit", (code) => {
      if (!settled) fail(new Error(`${label} вышел с кодом ${code}`));
    });
    setTimeout(() => {
      if (!settled) fail(new Error(`Не дождался URL от ${label} (${timeoutMs / 1000}с)`));
    }, timeoutMs);
  });
}

async function pollNgrokApi(timeoutMs = 45000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const data = await httpGetLocal(4040, "/api/tunnels");
      const tunnels = data?.tunnels || [];
      for (const t of tunnels) {
        const url = normalizePublicUrl(t.public_url);
        if (url && /^https:/i.test(url)) return url;
      }
      for (const t of tunnels) {
        const url = normalizePublicUrl(t.public_url);
        if (url) return url;
      }
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  return null;
}

async function startNgrok() {
  const bin = findNgrok();
  if (!bin) {
    throw new Error(
      "ngrok не найден.\n" +
        "  1) https://ngrok.com/download  или  winget install Ngrok.Ngrok\n" +
        "  2) Зарегистрируйся, скопируй authtoken\n" +
        "  3) ngrok config add-authtoken ТВОЙ_ТОКЕН\n" +
        "  4) снова: npm run players:ngrok\n" +
        "Запасной вариант: npm run players:cloudpub",
    );
  }
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/IM", "ngrok.exe", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  }
  log(`Стартую ngrok → http://127.0.0.1:${PORT}`);
  const child = spawn(bin, ["http", String(PORT), "--log=stdout"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  track(child, "ngrok");

  const fromLogs = waitUrlFromProcess(child, "ngrok", 20000).catch(() => null);
  const fromApi = pollNgrokApi(45000);
  const url = (await fromLogs) || (await fromApi);
  if (!url) {
    throw new Error(
      "ngrok не отдал URL. Проверь authtoken: ngrok config add-authtoken …",
    );
  }
  return url;
}

function findClo() {
  const bundled = path.join(
    ROOT,
    "tools",
    "cloudpub",
    process.platform === "win32" ? "clo.exe" : "clo",
  );
  if (fs.existsSync(bundled)) return bundled;
  return findOnPath(["clo", "clo.exe"]);
}

async function startCloudPub() {
  const bin = findClo();
  if (!bin) {
    throw new Error(
      "CloudPub CLI не найден.\n" +
        "  Скачай clo с https://cloudpub.ru → положи в GMap/tools/cloudpub/clo.exe\n" +
        "  Токен: clo set token … или GMAP_CLOUDPUB_TOKEN\n" +
        "  Или кнопка «Для игроков» в редакторе.",
    );
  }
  const token =
    process.env.GMAP_CLOUDPUB_TOKEN ||
    process.env.CLOUDPUB_TOKEN ||
    (() => {
      try {
        const p = path.join(ROOT, "data", "cloudpub-token.txt");
        if (fs.existsSync(p)) return fs.readFileSync(p, "utf8").trim();
      } catch {
        /* ignore */
      }
      try {
        const toml = path.join(
          process.env.APPDATA || "",
          "cloudpub",
          "client.toml",
        );
        if (fs.existsSync(toml)) {
          const m = fs
            .readFileSync(toml, "utf8")
            .match(/^\s*token\s*=\s*"([^"]+)"/m);
          return m?.[1]?.trim() || "";
        }
      } catch {
        /* ignore */
      }
      return "";
    })();
  if (token) {
    spawnSync(bin, ["set", "token", token], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 15000,
    });
  }
  log(`Стартую CloudPub → http://127.0.0.1:${PORT}`);
  const child = spawn(
    bin,
    ["-v", "publish", "http", String(PORT), "-n", "GMap"],
    {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  track(child, "cloudpub");
  const url = await waitUrlFromProcess(child, "CloudPub", 45000);
  if (!url) throw new Error("CloudPub не отдал URL");
  return url;
}

async function startPinggy() {
  const ssh = findSsh();
  if (!ssh) {
    throw new Error(
      "SSH не найден (нужен для Pinggy).\n" +
        "  Windows: Параметры → Система → Дополнительно → Optional Features → OpenSSH Client\n" +
        "  Или: npm run players:ngrok",
    );
  }
  log(`Стартую Pinggy (ssh → free.pinggy.io) на порт ${PORT}…`);
  // x: disable pseudo-tty issues on Windows; accept-new for first host key
  const args = [
    "-p",
    "443",
    "-R",
    `0:127.0.0.1:${PORT}`,
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    "ServerAliveInterval=30",
    "-o",
    "ExitOnForwardFailure=yes",
    "free.pinggy.io",
  ];
  const child = spawn(ssh, args, {
    cwd: ROOT,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  track(child, "pinggy-ssh");
  // free tier may ask password — empty Enter
  child.stdin?.write("\n");
  try {
    child.stdin?.end();
  } catch {
    /* ignore */
  }
  return waitUrlFromProcess(child, "Pinggy", 60000);
}

async function startCloudflare() {
  const cf = findCloudflared();
  if (!cf) {
    throw new Error(
      "cloudflared не найден. winget install Cloudflare.cloudflared\nИли: npm run players:ngrok / players:pinggy",
    );
  }
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/IM", "cloudflared.exe", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  }
  log("Стартую cloudflared…");
  const child = spawn(cf, ["tunnel", "--url", `http://127.0.0.1:${PORT}`], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  track(child, "cloudflared");
  return waitUrlFromProcess(child, "cloudflared", 45000);
}

async function startPlayit() {
  const bin = findPlayit();
  console.log("\n" + "-".repeat(64));
  console.log("  playit.gg — не one-click как ngrok.");
  console.log("  1. Скачай агент: https://playit.gg/download");
  console.log("  2. Запусти, залогинься, Create Tunnel:");
  console.log(`       Local: 127.0.0.1   Port: ${PORT}   (TCP или HTTP)`);
  console.log("  3. Скопируй публичный адрес (xxx.gl.at.ply.gg:PORT)");
  console.log("  4. Либо:");
  console.log(`       set GMAP_PUBLIC_URL=http://ТВОЙ_АДРЕС`);
  console.log("       npm run players:playit");
  console.log("  5. Либо запиши URL одной строкой в:");
  console.log(`       ${MANUAL_URL_FILE}`);
  console.log("-".repeat(64) + "\n");

  if (bin) {
    log(`Запускаю playit: ${bin}`);
    const child = spawn(bin, [], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    track(child, "playit");
    child.stdout.on("data", (b) => process.stderr.write(b));
    child.stderr.on("data", (b) => process.stderr.write(b));
  } else {
    log("playit.exe не найден в PATH — запусти агент вручную с сайта.");
  }

  const envUrl = normalizePublicUrl(process.env.GMAP_PUBLIC_URL || "");
  if (envUrl) return envUrl;

  // Poll manual file + process output for up to 10 minutes
  const t0 = Date.now();
  while (Date.now() - t0 < 10 * 60 * 1000) {
    if (fs.existsSync(MANUAL_URL_FILE)) {
      const raw = fs.readFileSync(MANUAL_URL_FILE, "utf8").trim();
      const url = normalizePublicUrl(raw) || extractPublicUrl(raw);
      if (url) {
        log(`URL из ${path.relative(ROOT, MANUAL_URL_FILE)}`);
        return url;
      }
    }
    await sleep(2000);
  }
  throw new Error(
    "Не дождался URL playit. Запиши его в tmp/public-url.txt и перезапусти.",
  );
}

async function runPublicTunnel(label, starter) {
  await ensureServerAndPublish();
  const forced = normalizePublicUrl(process.env.GMAP_PUBLIC_URL || "");
  const url = forced || (await starter());
  writeSession(url, { tunnel: label });
  bannerPublic(label, url);
  holdProcess();
}

async function main() {
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  try {
    if (mode === "cloudpub" || mode === "clo") {
      await runPublicTunnel("CloudPub", startCloudPub);
      return;
    }
    if (mode === "ngrok") {
      await runPublicTunnel("ngrok", startNgrok);
      return;
    }
    if (mode === "pinggy") {
      await runPublicTunnel("Pinggy", startPinggy);
      return;
    }
    if (mode === "playit" || mode === "playit.gg") {
      await runPublicTunnel("playit.gg", startPlayit);
      return;
    }
    if (mode === "tunnel" || mode === "cloudflare" || mode === "cf") {
      await runPublicTunnel("Cloudflare quick tunnel", startCloudflare);
      return;
    }

    // radmin / lan
    ensureFirewallRule();
    await ensureServerAndPublish();
    const ips = listShareIps();
    const base = bannerRadmin(ips);
    if (base) writeSession(base, { shareIps: ips });
    setInterval(() => {
      const fresh = listShareIps();
      const rad = fresh.find((x) => x.kind === "radmin") || fresh[0];
      if (rad) writeSession(`http://${rad.ip}:${PORT}`, { shareIps: fresh });
    }, 15000);
    holdProcess();
  } catch (e) {
    console.error("[players]", e instanceof Error ? e.message : e);
    shutdown("fail");
  }
}

main().catch((e) => {
  console.error(e);
  shutdown("crash");
});
