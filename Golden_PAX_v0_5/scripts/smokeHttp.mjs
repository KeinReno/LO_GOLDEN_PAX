/**
 * Shared live-smoke HTTP helper. Player actions use minted x-player-token
 * (not x-faction-id). GM still uses x-master-token.
 *
 * Usage: node server/serve.mjs  then  node scripts/smoke*.mjs
 */
import { resolveMasterToken } from "../server/api/auth.mjs";

export const BASE = process.env.GOLDEN_PAX_URL || "http://localhost:4174";
export const GM_TOKEN = resolveMasterToken().token;

export function createSmokeClient() {
  const playerTokens = new Map();

  async function call(method, path, { actor, body } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (actor === "gm") headers["x-master-token"] = GM_TOKEN;
    else if (actor && playerTokens.has(actor)) headers["x-player-token"] = playerTokens.get(actor);
    else if (actor) headers["x-player-token"] = actor;
    const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, json };
  }

  async function seatPlayer(campaignId, factionId, displayName = factionId) {
    const res = await call("POST", `/api/campaign/${campaignId}/factions/${factionId}/player-token`, {
      actor: "gm",
      body: { displayName },
    });
    if (!res.ok || !res.json?.token) {
      throw new Error(`mint player token failed for ${factionId}: ${res.status} ${JSON.stringify(res.json)}`);
    }
    playerTokens.set(factionId, res.json.token);
    return res.json;
  }

  return { call, seatPlayer, playerTokens };
}

export function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  ok  ${msg}`);
}
