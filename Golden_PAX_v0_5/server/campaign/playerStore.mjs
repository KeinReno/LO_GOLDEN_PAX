import { randomUUID } from "node:crypto";
import crypto from "node:crypto";
import { getFaction } from "./campaignStore.mjs";

/** Player/GM table codes are four digits. GM pin is reserved. */
export const TABLE_PIN_RE = /^\d{4}$/;
export const GM_TABLE_PIN = "2142";

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token), "utf8").digest("hex");
}

function normalizeMintOpts(opts) {
  if (opts == null) return {};
  if (typeof opts === "string") return { displayName: opts };
  return opts;
}

function pinTaken(db, pin, exceptPlayerId) {
  const row = findPlayerByPlainToken(db, pin);
  if (!row) return false;
  return row.id !== exceptPlayerId;
}

function randomUnusedPin(db, exceptPlayerId) {
  for (let i = 0; i < 64; i += 1) {
    const pin = String(crypto.randomInt(0, 10000)).padStart(4, "0");
    if (pin === GM_TABLE_PIN) continue;
    if (!pinTaken(db, pin, exceptPlayerId)) return pin;
  }
  return null;
}

function dummyHash() {
  return hashToken("golden-pax-dummy-compare");
}

/**
 * Timing-safe lookup: hash the presented token, compare against every
 * players.token_hash. Fine for table-scale player counts.
 */
export function findPlayerByPlainToken(db, token) {
  const presented = Buffer.from(hashToken(token), "utf8");
  const rows = db.prepare("SELECT id, display_name as displayName, token_hash as tokenHash FROM players").all();
  let found = null;
  const dummy = Buffer.from(dummyHash(), "utf8");
  for (const row of rows) {
    const expected = Buffer.from(String(row.tokenHash || ""), "utf8");
    if (presented.length !== expected.length) {
      crypto.timingSafeEqual(dummy, dummy);
      continue;
    }
    if (crypto.timingSafeEqual(presented, expected)) found = row;
  }
  return found;
}

export function findSeatedFaction(db, campaignId, playerId) {
  const row = db
    .prepare(
      `SELECT id, name, player_id as playerId, race_id as raceId, color_hex as colorHex, is_npc as isNpc
       FROM factions WHERE campaign_id = ? AND player_id = ?`,
    )
    .get(campaignId, playerId);
  return row ? { ...row, isNpc: !!row.isNpc } : null;
}

export function listFactionsForPlayer(db, playerId) {
  return db
    .prepare(
      `SELECT id, campaign_id as campaignId, name, player_id as playerId FROM factions WHERE player_id = ?`,
    )
    .all(playerId);
}

/**
 * GM mint/reset: store hash, return plaintext once. Binds factions.player_id.
 * Tokens are 4-digit PINs. Optional `token` sets a specific PIN.
 */
export function mintPlayerToken(db, campaignId, factionId, opts) {
  const { displayName, token: requested } = normalizeMintOpts(opts);
  const faction = getFaction(db, campaignId, factionId);
  if (!faction) return { ok: false, error: "faction_not_found" };
  let token = requested != null ? String(requested).trim() : randomUnusedPin(db, faction.playerId);
  if (!token) return { ok: false, error: "pin_exhausted" };
  if (!TABLE_PIN_RE.test(token)) return { ok: false, error: "pin_must_be_4_digits" };
  if (token === GM_TABLE_PIN) return { ok: false, error: "pin_reserved" };
  if (pinTaken(db, token, faction.playerId)) return { ok: false, error: "pin_taken" };
  const tokenHash = hashToken(token);
  const now = new Date().toISOString();
  const name = displayName || faction.name || factionId;
  let playerId = faction.playerId;
  if (playerId) {
    db.prepare("UPDATE players SET token_hash = ?, display_name = ? WHERE id = ?").run(tokenHash, name, playerId);
  } else {
    playerId = randomUUID();
    db.prepare("INSERT INTO players (id, display_name, token_hash, created_at) VALUES (?, ?, ?, ?)").run(
      playerId,
      name,
      tokenHash,
      now,
    );
    db.prepare("UPDATE factions SET player_id = ? WHERE campaign_id = ? AND id = ?").run(playerId, campaignId, factionId);
  }
  return { ok: true, playerId, factionId, token, displayName: name };
}

/** Bind an existing player row to a faction (same PIN, new campaign). */
export function seatPlayerOnFaction(db, campaignId, factionId, playerId) {
  const faction = getFaction(db, campaignId, factionId);
  if (!faction) return { ok: false, error: "faction_not_found" };
  db.prepare("UPDATE factions SET player_id = ?, is_npc = 0 WHERE campaign_id = ? AND id = ?").run(
    playerId,
    campaignId,
    factionId,
  );
  return { ok: true, playerId, factionId };
}
