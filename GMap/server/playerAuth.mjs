/**
 * Player identity for the live table.
 *
 * Bare `x-faction-id` is never identity. After password login the server
 * issues a session token; mutating player routes accept that token
 * (`x-player-token`) or the existing password (compat window).
 *
 * Session token hashes persist via tableStore (file JSON or sqlite kv).
 * Faction PIN plaintext stays on the live board this pass — see
 * docs/PLAYER_AUTH_TOKEN.md.
 */
import crypto from "node:crypto";
import path from "node:path";
import { requireMasterHeader } from "./auth.mjs";
import { readJson, writeJson, DATA_DIR } from "./tableStore.mjs";

export const PLAYER_TOKEN_HEADER = "x-player-token";
export const FACTION_PASSWORD_HEADER = "x-faction-password";
export const FACTION_ID_HEADER = "x-faction-id";

const SESSIONS_PATH = path.join(DATA_DIR, "player-sessions.json");
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const SCRYPT_KEYLEN = 32;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** @type {null | { read: () => object, write: (data: object) => void }} */
let testStore = null;

export function setPlayerAuthStoreForTests(store) {
  testStore = store;
}

function emptyStore() {
  return { sessions: [] };
}

function loadStore() {
  if (testStore) return testStore.read() || emptyStore();
  const data = readJson(SESSIONS_PATH, emptyStore());
  if (!data || !Array.isArray(data.sessions)) return emptyStore();
  return data;
}

function saveStore(data) {
  if (testStore) {
    testStore.write(data);
    return;
  }
  writeJson(SESSIONS_PATH, data);
}

function header(req, name) {
  if (!req?.headers) return "";
  const raw = req.headers[name];
  if (Array.isArray(raw)) return String(raw[0] || "").trim();
  return String(raw || "").trim();
}

export function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a ?? ""), "utf8");
  const right = Buffer.from(String(b ?? ""), "utf8");
  if (left.length !== right.length) {
    crypto.timingSafeEqual(right, right);
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

export function scryptHash(plain) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(
    String(plain ?? ""),
    salt,
    SCRYPT_KEYLEN,
    SCRYPT_OPTS,
  );
  return `scrypt$${SCRYPT_OPTS.N}$${SCRYPT_OPTS.r}$${SCRYPT_OPTS.p}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function scryptVerify(plain, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  let salt;
  let expected;
  try {
    salt = Buffer.from(parts[4], "base64url");
    expected = Buffer.from(parts[5], "base64url");
  } catch {
    return false;
  }
  if (!salt.length || expected.length !== SCRYPT_KEYLEN) return false;
  const actual = crypto.scryptSync(String(plain ?? ""), salt, SCRYPT_KEYLEN, {
    N,
    r,
    p,
    maxmem: SCRYPT_OPTS.maxmem,
  });
  if (actual.length !== expected.length) {
    crypto.timingSafeEqual(expected, expected);
    return false;
  }
  return crypto.timingSafeEqual(actual, expected);
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token), "utf8").digest("hex");
}

function dummyTokenHash() {
  return hashToken("gmap-player-auth-dummy");
}

export function verifyFactionPassword(faction, presented) {
  const password = String(presented ?? "");
  if (!password) return false;
  if (!faction) return false;
  if (faction.passwordHash) return scryptVerify(password, faction.passwordHash);
  const expected = String(faction.password || "");
  if (!expected) return false;
  return timingSafeEqualString(password, expected);
}

const DEAD_FACTION_NAME = /уничтожен|павший|destroyed|fallen/i;
const GALIVAN_HOUSE_NAME = /·\s*Галиван\b/i;
const NOMAD_FACTION_ID = /^faction_nomad_/i;

/** Login list: has a PIN/hash and is not a destroyed leftover. */
export function isPlayerLoginFaction(faction) {
  if (!faction?.id) return false;
  const secret = String(faction.passwordHash || faction.password || "");
  if (!secret) return false;
  const id = String(faction.id);
  const name = String(faction.name || "");
  if (DEAD_FACTION_NAME.test(name)) return false;
  if (NOMAD_FACTION_ID.test(id) || GALIVAN_HOUSE_NAME.test(name)) return false;
  return true;
}

export function publicLoginFactions(world) {
  return (world?.factions ?? []).filter(isPlayerLoginFaction).map((f) => ({
    id: f.id,
    name: f.name,
    color: f.color,
  }));
}

function pruneExpired(store, now) {
  store.sessions = (store.sessions || []).filter(
    (s) => s && s.expiresAt && Date.parse(s.expiresAt) > now,
  );
}

export function issueSessionToken(factionId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  const store = loadStore();
  pruneExpired(store, now);
  store.sessions.push({
    id: crypto.randomUUID(),
    factionId: String(factionId),
    tokenHash: hashToken(token),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
  });
  saveStore(store);
  return token;
}

export function findSessionByPlainToken(token) {
  const presented = String(token || "").trim();
  if (!presented) return null;
  const now = Date.now();
  const store = loadStore();
  pruneExpired(store, now);
  const presentedHash = Buffer.from(hashToken(presented), "utf8");
  const dummy = Buffer.from(dummyTokenHash(), "utf8");
  let found = null;
  for (const row of store.sessions) {
    const expected = Buffer.from(String(row.tokenHash || ""), "utf8");
    if (presentedHash.length !== expected.length) {
      crypto.timingSafeEqual(dummy, dummy);
      continue;
    }
    if (crypto.timingSafeEqual(presentedHash, expected)) found = row;
  }
  return found;
}

function factionById(world, factionId) {
  if (!factionId) return null;
  return (world?.factions ?? []).find((f) => f.id === factionId) || null;
}

function authFail(error) {
  return { ok: false, error };
}

function authOk(faction, via, extra = {}) {
  return { ok: true, master: false, faction, via, ...extra };
}

/**
 * Resolve caller identity.
 * Token binds faction; client-supplied `x-faction-id` is only a password-compat hint.
 */
export function resolvePlayerAuth(req, world, opts = {}) {
  const body = opts.body && typeof opts.body === "object" ? opts.body : {};
  const factionIdHint = opts.factionIdHint || null;

  if (req && requireMasterHeader(req)) {
    return { ok: true, master: true, faction: null, via: "master" };
  }

  const token =
    header(req, PLAYER_TOKEN_HEADER) || String(body.playerToken || "").trim();
  if (token) {
    const session = findSessionByPlainToken(token);
    if (!session) return authFail("Неверный или истёкший player token");
    const faction = factionById(world, session.factionId);
    if (!faction) return authFail("Держава сессии не найдена");
    return authOk(faction, "token");
  }

  const password =
    header(req, FACTION_PASSWORD_HEADER) ||
    (body.password != null ? String(body.password) : "");
  const factionId =
    (body.factionId != null ? String(body.factionId) : "") ||
    factionIdHint ||
    header(req, FACTION_ID_HEADER);

  if (!password) {
    return authFail("Нужен player token или пароль фракции");
  }
  if (!factionId) {
    return authFail("Нужен пароль фракции");
  }

  const faction = factionById(world, factionId);
  if (!faction || !verifyFactionPassword(faction, password)) {
    return authFail("Неверный пароль государства");
  }
  return authOk(faction, "password");
}

function matchFactionByPassword(world, password) {
  const seats = (world?.factions ?? []).filter(isPlayerLoginFaction);
  let matched = null;
  let extra = false;
  for (const faction of seats) {
    if (!verifyFactionPassword(faction, password)) continue;
    if (matched) extra = true;
    else matched = faction;
  }
  if (!matched || extra) return null;
  return matched;
}

export function loginWithPassword(world, body) {
  const factionId = body?.factionId != null ? String(body.factionId).trim() : "";
  const password = body?.password != null ? String(body.password) : "";
  if (!password) {
    return authFail("Нужен пароль государства");
  }
  const faction = factionId
    ? factionById(world, factionId)
    : matchFactionByPassword(world, password);
  if (!faction || !verifyFactionPassword(faction, password)) {
    return authFail("Неверный пароль государства");
  }
  const playerToken = issueSessionToken(faction.id);
  return authOk(faction, "password", { playerToken });
}

export { SESSIONS_PATH };
