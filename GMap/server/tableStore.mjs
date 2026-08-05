/**
 * Live table source of truth (P0).
 * published.json = board canon for players + master live mode.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeWorld } from "./normalizeWorld.mjs";
import { getStoreBackend } from "./db/storeAdapter.mjs";
import { cancelEngagementsMissingForces } from "./engagementReconcile.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(__dirname, "../data");
export const PUBLISHED_PATH = path.join(DATA_DIR, "published.json");
export const ORDERS_PATH = path.join(DATA_DIR, "player-orders.json");
export const INTENTS_PATH = path.join(DATA_DIR, "intents.json");
export const DRAFT_PATH = path.join(DATA_DIR, "campaign-draft.json");
export const LEDGER_PATH = path.join(DATA_DIR, "ledger.json");
export const TABLE_META_PATH = path.join(DATA_DIR, "table-meta.json");
export const TURNS_DIR = path.join(DATA_DIR, "turns");
export const LORE_PATH = path.resolve(
  __dirname,
  "../public/campaigns/lo_golden_pax.json",
);

export function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(TURNS_DIR)) fs.mkdirSync(TURNS_DIR, { recursive: true });
}

export function readJson(file, fallback) {
  return getStoreBackend().readJson(file, fallback);
}

export function writeJson(file, data) {
  ensureDataDir();
  getStoreBackend().writeJson(file, data);
}

export function getTableMeta() {
  const meta = readJson(TABLE_META_PATH, null);
  if (meta && typeof meta.tableRevision === "number") return meta;
  return { tableRevision: 0, lastTickAt: null, tickFrozen: false };
}

export function setTableMeta(patch) {
  const next = { ...getTableMeta(), ...patch };
  writeJson(TABLE_META_PATH, next);
  return next;
}

export function bumpTableRevision() {
  const meta = getTableMeta();
  const tableRevision = (meta.tableRevision ?? 0) + 1;
  return setTableMeta({ tableRevision, updatedAt: new Date().toISOString() });
}

/** Copy live files into data/turns/{turn}_{stamp}/ */
export function backupTurnSnapshot(turn, reason = "manual") {
  ensureDataDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(TURNS_DIR, `${turn ?? "t"}_${stamp}_${reason}`);
  fs.mkdirSync(dir, { recursive: true });
  const copyIf = (src, name) => {
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(dir, name));
    }
  };
  copyIf(PUBLISHED_PATH, "published.json");
  copyIf(ORDERS_PATH, "player-orders.json");
  copyIf(INTENTS_PATH, "intents.json");
  copyIf(LEDGER_PATH, "ledger.json");
  copyIf(TABLE_META_PATH, "table-meta.json");
  copyIf(path.join(DATA_DIR, "fog-masks.json"), "fog-masks.json");
  copyIf(path.join(DATA_DIR, "engagements.json"), "engagements.json");
  copyIf(path.join(DATA_DIR, "market-rates.json"), "market-rates.json");
  copyIf(path.join(DATA_DIR, "market-orders.json"), "market-orders.json");
  copyIf(path.join(DATA_DIR, "faction-contacts.json"), "faction-contacts.json");
  copyIf(path.join(DATA_DIR, "diplo-offers.json"), "diplo-offers.json");
  copyIf(path.join(DATA_DIR, "market-membership.json"), "market-membership.json");
  copyIf(path.join(DATA_DIR, "market-history.json"), "market-history.json");
  copyIf(path.join(DATA_DIR, "race_states.json"), "race_states.json");
  copyIf(path.join(DATA_DIR, "faction-intel.json"), "faction-intel.json");
  writeJson(path.join(dir, "backup-meta.json"), {
    turn: turn ?? null,
    reason,
    at: new Date().toISOString(),
  });
  return dir;
}

export function readPublishedRaw() {
  return readJson(PUBLISHED_PATH, null);
}

/** Normalized live board or null. */
export function readLiveBoard() {
  const raw = readPublishedRaw();
  if (!raw) return null;
  return normalizeWorld(raw);
}

/**
 * Write live board. Always bumps tableRevision unless expectedRevision conflicts.
 * @param {object} world
 * @param {{ backup?: boolean, reason?: string, alsoDraft?: boolean, alsoLore?: boolean, expectedRevision?: number }} opts
 */
export function writeLiveBoard(world, opts = {}) {
  if (opts.expectedRevision != null && Number.isFinite(Number(opts.expectedRevision))) {
    const live = readPublishedRaw();
    const current =
      live?.meta?.tableRevision ?? getTableMeta().tableRevision ?? 0;
    if (Number(opts.expectedRevision) !== Number(current)) {
      return {
        ok: false,
        conflict: true,
        tableRevision: current,
        error: "revision_conflict",
        world: null,
        updatedAt: live?.meta?.updatedAt ?? null,
        turn: live?.meta?.turn ?? 0,
      };
    }
  }
  const turn = world?.meta?.turn ?? 0;
  if (opts.backup) {
    backupTurnSnapshot(turn, opts.reason || "write");
  }
  const normalized = normalizeWorld(world);
  const now = new Date().toISOString();
  if (!normalized.meta) normalized.meta = {};
  normalized.meta.updatedAt = now;
  const revMeta = bumpTableRevision();
  normalized.meta.tableRevision = revMeta.tableRevision;
  writeJson(PUBLISHED_PATH, normalized);
  if (opts.alsoDraft) writeJson(DRAFT_PATH, normalized);
  if (opts.alsoLore) {
    const loreDir = path.dirname(LORE_PATH);
    if (!fs.existsSync(loreDir)) fs.mkdirSync(loreDir, { recursive: true });
    writeJson(LORE_PATH, normalized);
  }
  // Удалили флот/легион из доски → открытые бои с ним закрываем.
  if (!opts.skipEngagementReconcile) {
    try {
      cancelEngagementsMissingForces(normalized);
    } catch {
      /* ignore */
    }
  }
  return {
    ok: true,
    world: normalized,
    tableRevision: revMeta.tableRevision,
    updatedAt: now,
    turn: normalized.meta.turn ?? 0,
  };
}

export function getVersionPayload() {
  const world = readLiveBoard();
  const meta = getTableMeta();
  const metaRev = Number(meta.tableRevision) || 0;
  if (!world) {
    return {
      ok: false,
      tableRevision: metaRev,
      turn: 0,
      updatedAt: meta.updatedAt ?? null,
      systems: 0,
    };
  }
  const worldRev = Number(world.meta?.tableRevision) || 0;
  // Prefer the higher revision: apply-build / ops may bump table-meta
  // without rewriting the live board body.
  const tableRevision = Math.max(worldRev, metaRev);
  const updatedAt =
    metaRev >= worldRev && meta.updatedAt
      ? meta.updatedAt
      : (world.meta?.updatedAt ?? meta.updatedAt ?? null);
  return {
    ok: true,
    tableRevision,
    turn: world.meta?.turn ?? 0,
    updatedAt,
    systems: Array.isArray(world.systems) ? world.systems.length : 0,
    tickFrozen: !!meta.tickFrozen,
    lastTickAt: meta.lastTickAt ?? null,
  };
}
