/**
 * CloudPub (RF) tunnel provider — publish/reconnect/unpublish + token config.
 * Extracted from ../playerShare.mjs.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ROOT,
  state,
  pushLog,
  findOnPath,
  normalizePublicUrl,
  waitUrlFromChild,
  sleep,
  childAlive,
} from "./base.mjs";

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

export function hasCloudPubToken() {
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

export function findCloBin() {
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

export function cloudPubLs() {
  const bin = findCloBin();
  if (!bin) return [];
  const r = spawnSync(bin, ["ls"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 20000,
  });
  return parseCloudPubLs(`${r.stdout || ""}\n${r.stderr || ""}`);
}

export function cloudPubUnpublish(guid) {
  const bin = findCloBin();
  if (!bin || !guid) return;
  spawnSync(bin, ["unpublish", guid], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 20000,
  });
}

export function ensureCloudPubTokenConfigured() {
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

export async function spawnCloudPubPublish(localPort) {
  const { bin } = ensureCloudPubTokenConfigured();

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
    const explicit = text.match(/guid:\s*"([0-9a-f-]{36})"/i);
    if (explicit) {
      guid = explicit[1];
      return;
    }
    const m = text.match(
      /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i,
    );
    if (!guid && m && /EndpointAck|ServerEndpoint|опубликован/i.test(text)) {
      guid = m[1];
    }
  };
  child.stdout?.on("data", grabGuid);
  child.stderr?.on("data", grabGuid);

  const url = await waitUrlFromChild(child, 50000);
  if (!childAlive(child)) {
    throw new Error("cloudpub: процесс publish завершился сразу после URL");
  }
  return { child, url, provider: "cloudpub", guid };
}

export async function startCloudPub(localPort) {
  ensureCloudPubTokenConfigured();

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

  const started = await spawnCloudPubPublish(localPort);
  state.cloudpubGuid = started.guid;
  pushLog(`cloudpub up ${started.url} guid=${started.guid || "?"}`);
  return started;
}

/** Re-publish without clo ls / unpublish — keeps the same CloudPub hostname when possible. */
export async function reconnectCloudPub(localPort) {
  ensureCloudPubTokenConfigured();
  const started = await spawnCloudPubPublish(localPort);
  if (started.guid) state.cloudpubGuid = started.guid;
  pushLog(`cloudpub reconnect ${started.url} guid=${started.guid || "?"}`);
  return started;
}
