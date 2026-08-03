/**
 * Common market opt-in membership.
 */
import path from "node:path";
import { DATA_DIR, readJson, writeJson, bumpTableRevision } from "./tableStore.mjs";

export const MEMBERSHIP_PATH = path.join(DATA_DIR, "market-membership.json");

function empty() {
  return { members: [] };
}

export function readMembership() {
  const raw = readJson(MEMBERSHIP_PATH, null);
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.members)) {
    return empty();
  }
  return { members: [...new Set(raw.members.filter(Boolean))] };
}

export function writeMembership(store) {
  writeJson(MEMBERSHIP_PATH, {
    members: [...new Set(store.members ?? [])].sort(),
  });
}

export function isCommonMarketMember(factionId) {
  return readMembership().members.includes(factionId);
}

export function listCommonMembers() {
  return readMembership().members;
}

/**
 * @returns {{ ok: true, members: string[] } | { ok: false, error: string }}
 */
export function setCommonMarketMembership(factionId, join) {
  if (!factionId) return { ok: false, error: "faction required" };
  const store = readMembership();
  const set = new Set(store.members);
  if (join) set.add(factionId);
  else set.delete(factionId);
  store.members = [...set].sort();
  writeMembership(store);
  bumpTableRevision();
  return { ok: true, members: store.members, joined: !!join };
}
