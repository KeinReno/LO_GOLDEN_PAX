/**

 * Persistence adapter — file JSON today, normalized SQLite (C4) when enabled.

 *

 * Env:

 *   GMAP_STORE=file|sqlite   (default: file)

 *   GMAP_SQLITE_PATH=...     (default: data/table.sqlite)

 *

 * Domain modules keep calling readJson/writeJson via tableStore;

 * hot entities (table_meta, ledger entries, intents, engagements) route

 * through campaignDb when GMAP_STORE=sqlite.

 */

import fs from "node:fs";

import path from "node:path";

import { createRequire } from "node:module";

import { fileURLToPath } from "node:url";

import {

  getCampaignDb,

  getCampaignDbPath,

  getNormalizedStoreStats,

  isNormalizedStoreActive,

  migrateFromFilesIfNeeded,

  resetCampaignDb,

} from "./campaignDb.mjs";



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

  try {

    const metaPath = path.join(DATA_DIR, "table-meta.json");

    if (fs.existsSync(metaPath)) {

      sizes["table-meta.json"] = fs.statSync(metaPath).size;

    }

  } catch {

    /* ignore */

  }

  return sizes;

}



export function getStoreDriver() {

  const d = (process.env.GMAP_STORE || "file").toLowerCase();

  return d === "sqlite" ? "sqlite" : "file";

}



/** @type {null | { readJson: Function, writeJson: Function, appendJsonl: Function, ping: Function }} */

let backend = null;



function atomicWriteFile(file, contents) {

  const dir = path.dirname(file);

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const tmp = `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  fs.writeFileSync(tmp, contents, "utf8");

  try {

    fs.renameSync(tmp, file);

  } catch (err) {

    if (fs.existsSync(file)) fs.unlinkSync(file);

    fs.renameSync(tmp, file);

  }

}



function fileBackend() {

  return {

    driver: "file",

    ping() {

      return { ok: true, driver: "file", normalized: false };

    },

    readJson(file, fallback) {

      try {

        if (!fs.existsSync(file)) return fallback;

        return JSON.parse(fs.readFileSync(file, "utf8"));

      } catch (e) {

        const msg = `[STATE_PARSE_FAIL] ${file}: ${e.message}`;

        console.error(msg);

        throw new Error(msg, { cause: e });

      }

    },

    writeJson(file, data) {

      atomicWriteFile(file, JSON.stringify(data, null, 2));

    },

    appendJsonl(file, row) {

      const dir = path.dirname(file);

      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      fs.appendFileSync(file, JSON.stringify(row) + "\n", "utf8");

    },

  };

}



/**

 * Normalized SQLite backend (C4) — hot entities in real tables; other blobs in kv.

 */

function sqliteBackend() {

  if (!isBetterSqlite3Available()) {

    console.warn(

      "[store] GMAP_STORE=sqlite but better-sqlite3 missing — falling back to file",

    );

    return fileBackend();

  }



  migrateFromFilesIfNeeded(DATA_DIR);

  const conn = getCampaignDb();

  if (!conn) return fileBackend();



  const dbPath = getCampaignDbPath();

  const getStmt = conn.prepare("SELECT json FROM kv WHERE path = ?");

  const putStmt = conn.prepare(

    "INSERT INTO kv(path, json, updated_at) VALUES(?, ?, ?) ON CONFLICT(path) DO UPDATE SET json=excluded.json, updated_at=excluded.updated_at",

  );

  const appendStmt = conn.prepare(

    "INSERT INTO jsonl_log(path, json, at) VALUES(?, ?, ?)",

  );



  return {

    driver: "sqlite",

    ping() {

      return {

        ok: true,

        driver: "sqlite",

        path: dbPath,

        normalized: true,

        tables: getNormalizedStoreStats(),

      };

    },

    readJson(file, fallback) {

      const row = getStmt.get(file);

      if (!row) {

        try {

          if (fs.existsSync(file)) {

            const raw = fs.readFileSync(file, "utf8");

            putStmt.run(file, raw, new Date().toISOString());

            return JSON.parse(raw);

          }

        } catch (e) {

          if (fs.existsSync(file)) {

            const msg = `[STATE_PARSE_FAIL] ${file}: ${e.message}`;

            console.error(msg);

            throw new Error(msg, { cause: e });

          }

        }

        return fallback;

      }

      try {

        return JSON.parse(row.json);

      } catch (e) {

        const msg = `[STATE_PARSE_FAIL] sqlite:${file}: ${e.message}`;

        console.error(msg);

        throw new Error(msg, { cause: e });

      }

    },

    writeJson(file, data) {

      const json = JSON.stringify(data, null, 2);

      putStmt.run(file, json, new Date().toISOString());

      try {

        atomicWriteFile(file, json);

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

  resetCampaignDb();

}



export function storePing() {

  const backend = getStoreBackend();

  const ping = backend.ping();

  return {

    ...ping,

    betterSqlite3: isBetterSqlite3Available(),

    normalizedActive: isNormalizedStoreActive(),

  };

}



export { isNormalizedStoreActive };


