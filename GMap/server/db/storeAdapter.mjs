/**
 * Persistence adapter — file JSON today, SQLite later (P8.7 groundwork).
 *
 * Env:
 *   GMAP_STORE=file|sqlite   (default: file)
 *   GMAP_SQLITE_PATH=...     (default: data/table.sqlite)
 *
 * Domain modules keep calling readJson/writeJson via tableStore;
 * do not import sqlite from api handlers directly.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");

/** @returns {boolean} */
export function isBetterSqlite3Available() {
  try {
    require.resolve("better-sqlite3");
    return true;
  } catch {
    return false;
  }
}

const DATA_SIZE_FILES = [
  { key: "published.json", path: path.join(DATA_DIR, "published.json") },
  { key: "ledger.json", path: path.join(DATA_DIR, "ledger.json") },
  { key: "intents.json", path: path.join(DATA_DIR, "intents.json") },
];

/** Approximate byte sizes for key JSON blobs (fs.stat). */
export function getDataFileSizes() {
  /** @type {Record<string, number>} */
  const sizes = {};
  for (const { key, path: filePath } of DATA_SIZE_FILES) {
    try {
      if (fs.existsSync(filePath)) {
        sizes[key] = fs.statSync(filePath).size;
      }
    } catch {
      /* ignore */
    }
  }
  return sizes;
}

export function getStoreDriver() {
  const d = (process.env.GMAP_STORE || "file").toLowerCase();
  return d === "sqlite" ? "sqlite" : "file";
}

/** @type {null | { readJson: Function, writeJson: Function, appendJsonl: Function, ping: Function }} */
let backend = null;

function fileBackend() {
  return {
    driver: "file",
    ping() {
      return { ok: true, driver: "file" };
    },
    readJson(file, fallback) {
      try {
        if (!fs.existsSync(file)) return fallback;
        return JSON.parse(fs.readFileSync(file, "utf8"));
      } catch {
        return fallback;
      }
    },
    writeJson(file, data) {
      const dir = path.dirname(file);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
    },
    appendJsonl(file, row) {
      const dir = path.dirname(file);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(file, JSON.stringify(row) + "\n", "utf8");
    },
  };
}

/**
 * SQLite stub — activates only when GMAP_STORE=sqlite and better-sqlite3 is installed.
 * Schema sketch (docs/SQLITE_PLAN.md): kv, ledger_entries, intents, engagements, rp_messages.
 */
function sqliteBackend() {
  let Database;
  try {
    // Optional dependency — not installed by default (ESM-safe via createRequire)
    Database = require("better-sqlite3");
  } catch {
    console.warn(
      "[store] GMAP_STORE=sqlite but better-sqlite3 missing — falling back to file",
    );
    return fileBackend();
  }
  const dbPath =
    process.env.GMAP_SQLITE_PATH || path.join(DATA_DIR, "table.sqlite");
  if (!fs.existsSync(path.dirname(dbPath))) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      path TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS jsonl_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL,
      json TEXT NOT NULL,
      at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_jsonl_path ON jsonl_log(path);
  `);
  const getStmt = db.prepare("SELECT json FROM kv WHERE path = ?");
  const putStmt = db.prepare(
    "INSERT INTO kv(path, json, updated_at) VALUES(?, ?, ?) ON CONFLICT(path) DO UPDATE SET json=excluded.json, updated_at=excluded.updated_at",
  );
  const appendStmt = db.prepare(
    "INSERT INTO jsonl_log(path, json, at) VALUES(?, ?, ?)",
  );

  return {
    driver: "sqlite",
    ping() {
      return { ok: true, driver: "sqlite", path: dbPath };
    },
    readJson(file, fallback) {
      const row = getStmt.get(file);
      if (!row) {
        // One-time hydrate from disk if file exists
        try {
          if (fs.existsSync(file)) {
            const raw = fs.readFileSync(file, "utf8");
            putStmt.run(file, raw, new Date().toISOString());
            return JSON.parse(raw);
          }
        } catch {
          /* ignore */
        }
        return fallback;
      }
      try {
        return JSON.parse(row.json);
      } catch {
        return fallback;
      }
    },
    writeJson(file, data) {
      const json = JSON.stringify(data, null, 2);
      putStmt.run(file, json, new Date().toISOString());
      // Mirror to disk for backups / portability
      try {
        const dir = path.dirname(file);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, json, "utf8");
      } catch (e) {
        console.warn("[store] sqlite disk mirror failed", e.message);
      }
    },
    appendJsonl(file, row) {
      const json = JSON.stringify(row);
      appendStmt.run(file, json, new Date().toISOString());
      try {
        const dir = path.dirname(file);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(file, json + "\n", "utf8");
      } catch {
        /* ignore */
      }
    },
  };
}

export function getStoreBackend() {
  if (backend) return backend;
  backend =
    getStoreDriver() === "sqlite" ? sqliteBackend() : fileBackend();
  return backend;
}

/** Reset cached backend (tests / driver switch). */
export function resetStoreBackend() {
  backend = null;
}

export function storePing() {
  const backend = getStoreBackend();
  const ping = backend.ping();
  return {
    ...ping,
    betterSqlite3: isBetterSqlite3Available(),
  };
}
