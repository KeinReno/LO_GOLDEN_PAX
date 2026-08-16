/**
 * Master token resolution + timing-safe check.
 * Same pattern as GMap/server/auth.mjs — networking/auth is intentionally
 * carried over unchanged, see CLAUDE.md rule 8.
 *
 * Priority: GOLDEN_PAX_MASTER_TOKEN env -> data/master-token.txt -> dev default (warns).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { isGm } from "@golden-pax/shared-types";
import { getDb } from "../db/store.mjs";
import { findPlayerByPlainToken, findSeatedFaction, listFactionsForPlayer } from "../campaign/playerStore.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const MASTER_TOKEN_FILE = path.resolve(__dirname, "../../data/master-token.txt");

/** Table PIN: four digits. Local GM default matches the live table. */
const DEFAULT_DEV_TOKEN = "2142";

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
  const fromEnv = (process.env.GOLDEN_PAX_MASTER_TOKEN || "").trim();
  const fromFile = readTokenFile();
  const token = fromEnv || fromFile || DEFAULT_DEV_TOKEN;
  const source = fromEnv ? "env" : fromFile ? "file" : "default";
  if (source === "default") {
    console.warn(
      "[auth] Using default master token. Set GOLDEN_PAX_MASTER_TOKEN or data/master-token.txt before sharing.",
    );
  }
  cached = { token, source, isDefault: source === "default" };
  return cached;
}

let expectedTokenBuffer = null;
let expectedTokenBufferSource = null;

function checkMasterToken(provided) {
  const expected = resolveMasterToken().token;
  if (expectedTokenBufferSource !== expected) {
    expectedTokenBuffer = Buffer.from(expected, "utf8");
    expectedTokenBufferSource = expected;
  }
  const a = Buffer.from(String(provided || ""), "utf8");
  const b = expectedTokenBuffer;
  if (a.length !== b.length) {
    crypto.timingSafeEqual(b, b); // keep timing flat even on length mismatch
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

/**
 * Resolves the caller to an Actor (see packages/shared-types roles.mjs):
 * GM via x-master-token, or a seated player via x-player-token
 * (players.token_hash → factions.player_id). Bare x-faction-id is not
 * identity — that header is ignored so a client cannot spoof a seat.
 *
 * @returns {import("../../packages/shared-types/src/roles.mjs").Actor | { role: "player", notSeated: true, playerId: string } | null}
 */
export function resolveActor(req) {
  if (checkMasterToken(req.headers["x-master-token"])) {
    return { role: "gm" };
  }
  const token = req.headers["x-player-token"];
  if (typeof token !== "string" || !token.trim()) return null;

  const db = getDb();
  const player = findPlayerByPlainToken(db, token.trim());
  if (!player) return null;

  const campaignId = req.params?.campaignId;
  if (campaignId) {
    const faction = findSeatedFaction(db, campaignId, player.id);
    if (!faction) return { role: "player", factionId: "", playerId: player.id, notSeated: true };
    return { role: "player", factionId: faction.id, playerId: player.id };
  }

  const seats = listFactionsForPlayer(db, player.id);
  if (!seats.length) return { role: "player", factionId: "", playerId: player.id, notSeated: true };
  return { role: "player", factionId: seats[0].id, playerId: player.id };
}

/**
 * Resolve the actor or write a 401/403 and return null. Every route should
 * call this (or requireGm/requireFactionAccess below) instead of calling
 * resolveActor directly — resolving an actor and then never checking its
 * role/factionId against the resource being acted on defeats the whole
 * point of having an Actor type (see CLAUDE.md rule 1).
 */
export function requireActor(req, res) {
  const actor = resolveActor(req);
  if (!actor) {
    res.status(401).json({ error: "unauthenticated" });
    return null;
  }
  if (actor.notSeated) {
    res.status(403).json({ error: "not_seated" });
    return null;
  }
  return actor;
}

/**
 * Master token or a valid player token. Unseated players are allowed —
 * this is identity, not a faction-scoped action (e.g. global content catalog).
 */
export function requireLoggedIn(req, res) {
  const actor = resolveActor(req);
  if (!actor) {
    res.status(401).json({ error: "unauthenticated" });
    return null;
  }
  return actor;
}

/** GM can act as anyone; a player can only act as the faction they're bound to. */
export function actorCanActForFaction(actor, factionId) {
  return isGm(actor) || (actor.role === "player" && actor.factionId === factionId);
}

/** For endpoints scoped to one faction (research, roll quests, read a briefing). */
export function requireFactionAccess(req, res, factionId) {
  const actor = requireActor(req, res);
  if (!actor) return null;
  if (!actorCanActForFaction(actor, factionId)) {
    res.status(403).json({ error: "forbidden_faction" });
    return null;
  }
  return actor;
}

/** For turn-processing endpoints that touch every faction at once (ticks) or adjudicate between factions (combat resolution) — GM only. */
export function requireGm(req, res) {
  const actor = requireActor(req, res);
  if (!actor) return null;
  if (!isGm(actor)) {
    res.status(403).json({ error: "gm_only" });
    return null;
  }
  return actor;
}
