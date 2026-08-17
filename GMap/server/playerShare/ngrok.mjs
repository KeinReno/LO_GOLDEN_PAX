/**
 * ngrok tunnel provider — token config, binary discovery, start.
 * Extracted from ../playerShare.mjs.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ROOT,
  findOnPath,
  waitUrlFromChild,
  httpGetLocal,
  sleep,
  normalizePublicUrl,
  killChild,
} from "./base.mjs";

function ngrokConfigPath() {
  return path.join(
    process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData/Local"),
    "ngrok",
    "ngrok.yml",
  );
}

export function hasNgrokToken() {
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

export function findNgrokBin() {
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

export async function startNgrok(localPort) {
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
