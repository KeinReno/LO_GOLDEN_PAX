/**
 * Master token resolution + timing-safe check (P8.2).
 *
 * Priority:
 *   1. GMAP_MASTER_TOKEN env
 *   2. data/master-token.txt (first line, trimmed)
 *   3. legacy default "master2142" (WARN — change before public share)
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const MASTER_TOKEN_FILE = path.resolve(
  __dirname,
  "../data/master-token.txt",
);

const DEFAULT_DEV_TOKEN = "master2142";

let cached = null;

function readTokenFile() {
  try {
    if (!fs.existsSync(MASTER_TOKEN_FILE)) return null;
    const line = fs
      .readFileSync(MASTER_TOKEN_FILE, "utf8")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find((s) => s && !s.startsWith("#"));
    return line || null;
  } catch {
    return null;
  }
}

export function resolveMasterToken(forceReload = false) {
  if (cached && !forceReload) return cached;
  const fromEnv = (process.env.GMAP_MASTER_TOKEN || "").trim();
  const fromFile = readTokenFile();
  let token = fromEnv || fromFile || DEFAULT_DEV_TOKEN;
  let source = fromEnv ? "env" : fromFile ? "file" : "default";
  if (source === "default") {
    console.warn(
      "[auth] Using default master token. Set GMAP_MASTER_TOKEN or data/master-token.txt before sharing.",
    );
  }
  cached = { token, source, isDefault: source === "default" };
  return cached;
}

export function getMasterToken() {
  return resolveMasterToken().token;
}

export function masterTokenInfo() {
  const r = resolveMasterToken();
  return {
    source: r.source,
    isDefault: r.isDefault,
    length: r.token.length,
    hint: r.isDefault
      ? "Смените токен: GMAP_MASTER_TOKEN или data/master-token.txt"
      : null,
  };
}

/** Constant-time compare. */
export function checkMasterToken(provided) {
  const expected = getMasterToken();
  const a = Buffer.from(String(provided || ""), "utf8");
  const b = Buffer.from(String(expected), "utf8");
  if (a.length !== b.length) {
    // still do a compare to keep timing flatter
    crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

export function requireMasterHeader(req) {
  return checkMasterToken(req.headers["x-master-token"]);
}

/** Write / rotate token file (does not change process.env). */
export function writeMasterTokenFile(token) {
  const t = String(token || "").trim();
  if (t.length < 8) return { ok: false, error: "token too short (min 8)" };
  const dir = path.dirname(MASTER_TOKEN_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    MASTER_TOKEN_FILE,
    `# GMap master token — do not commit\n${t}\n`,
    "utf8",
  );
  cached = null;
  const info = masterTokenInfo();
  const envWins = !!(process.env.GMAP_MASTER_TOKEN || "").trim();
  return {
    ok: true,
    ...info,
    note: envWins
      ? "Файл записан, но GMAP_MASTER_TOKEN в env имеет приоритет — уберите env или перезапустите с новым значением"
      : "Токен из файла активен после следующей проверки (кэш сброшен)",
  };
}
