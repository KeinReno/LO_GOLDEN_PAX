/**
 * Normalized SQLite hot-state (C4) — table_meta, tick journal, ledger entries,
 * player intents, engagements. Activated when GMAP_STORE=sqlite.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(__dirname, "schema.sql");
const MIGRATION_KEY = "normalized_v1";

/** @type {import('better-sqlite3').Database | null} */
let db = null;

export function isNormalizedStoreActive() {
  const driver = (process.env.GMAP_STORE || "file").toLowerCase();
  if (driver !== "sqlite") return false;
  try {
    require.resolve("better-sqlite3");
    return true;
  } catch {
    return false;
  }
}

function loadDatabase() {
  if (db) return db;
  if (!isNormalizedStoreActive()) return null;
  const Database = require("better-sqlite3");
  const dataDir = path.resolve(__dirname, "../../data");
  const dbPath =
    process.env.GMAP_SQLITE_PATH || path.join(dataDir, "table.sqlite");
  if (!fs.existsSync(path.dirname(dbPath))) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));
  return db;
}

export function getCampaignDbPath() {
  const dataDir = path.resolve(__dirname, "../../data");
  return process.env.GMAP_SQLITE_PATH || path.join(dataDir, "table.sqlite");
}

export function getCampaignDb() {
  return loadDatabase();
}

export function resetCampaignDb() {
  if (db) {
    try {
      db.close();
    } catch {
      /* ignore */
    }
  }
  db = null;
}

function migrationDone(conn) {
  const row = conn
    .prepare("SELECT value FROM store_meta WHERE key = ?")
    .get(MIGRATION_KEY);
  return row?.value === "1";
}

function markMigrated(conn) {
  conn
    .prepare(
      "INSERT INTO store_meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(MIGRATION_KEY, "1");
}

function readJsonFile(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    const msg = `[STATE_PARSE_FAIL] ${file}: ${e.message}`;
    console.error(msg);
    throw new Error(msg, { cause: e });
  }
}

/**
 * One-time import from data/*.json when GMAP_STORE=sqlite first starts.
 * @param {string} dataDir
 */
export function migrateFromFilesIfNeeded(dataDir) {
  const conn = loadDatabase();
  if (!conn || migrationDone(conn)) return { migrated: false };

  const importMeta = conn.transaction(() => {
    const metaPath = path.join(dataDir, "table-meta.json");
    const rawMeta = readJsonFile(metaPath, {});
    const {
      lastJournal,
      tableRevision = 0,
      lastTickAt = null,
      tickFrozen = false,
      updatedAt,
      ...extras
    } = rawMeta || {};

    const now = updatedAt || new Date().toISOString();
    conn
      .prepare(
        `INSERT INTO table_meta(id, table_revision, last_tick_at, tick_frozen, updated_at, extras_json)
         VALUES(1, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           table_revision = excluded.table_revision,
           last_tick_at = excluded.last_tick_at,
           tick_frozen = excluded.tick_frozen,
           updated_at = excluded.updated_at,
           extras_json = excluded.extras_json`,
      )
      .run(
        Number(tableRevision) || 0,
        lastTickAt,
        tickFrozen ? 1 : 0,
        now,
        Object.keys(extras).length ? JSON.stringify(extras) : null,
      );

    if (lastJournal) {
      writeTickJournalInternal(conn, lastJournal);
    } else {
      const journalPath = path.join(dataDir, "tick-journal.json");
      const journal = readJsonFile(journalPath, null);
      if (journal) writeTickJournalInternal(conn, journal);
    }

    const ledgerPath = path.join(dataDir, "ledger.json");
    const ledger = readJsonFile(ledgerPath, null);
    if (ledger?.entries?.length) {
      const ins = conn.prepare(
        `INSERT OR IGNORE INTO ledger_entries
         (id, at, turn, faction_id, currency_id, delta, reason, intent_id, extras_json)
         VALUES (@id, @at, @turn, @faction_id, @currency_id, @delta, @reason, @intent_id, @extras_json)`,
      );
      for (const e of ledger.entries) {
        const { id, at, turn, factionId, currencyId, delta, reason, intentId, ...rest } =
          e;
        ins.run({
          id,
          at: at || new Date().toISOString(),
          turn: Number(turn) || 0,
          faction_id: factionId,
          currency_id: currencyId,
          delta: Number(delta) || 0,
          reason: reason ?? null,
          intent_id: intentId ?? null,
          extras_json: Object.keys(rest).length ? JSON.stringify(rest) : null,
        });
      }
    }

    const intentsPath = path.join(dataDir, "intents.json");
    const intents = readJsonFile(intentsPath, []);
    if (Array.isArray(intents) && intents.length) {
      replacePlayerIntentsInternal(conn, intents);
    }

    const engagementsPath = path.join(dataDir, "engagements.json");
    const engagements = readJsonFile(engagementsPath, []);
    if (Array.isArray(engagements) && engagements.length) {
      replaceEngagementsInternal(conn, engagements);
    }

    markMigrated(conn);
  });

  importMeta();
  console.log("[store] normalized SQLite migration complete");
  return { migrated: true };
}

function parseExtras(json) {
  if (!json) return {};
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

export function readTableMetaRow() {
  const conn = loadDatabase();
  if (!conn) return null;
  const row = conn
    .prepare(
      "SELECT table_revision, last_tick_at, tick_frozen, updated_at, extras_json FROM table_meta WHERE id = 1",
    )
    .get();
  if (!row) {
    return {
      tableRevision: 0,
      lastTickAt: null,
      tickFrozen: false,
      updatedAt: new Date().toISOString(),
    };
  }
  return {
    tableRevision: row.table_revision ?? 0,
    lastTickAt: row.last_tick_at ?? null,
    tickFrozen: !!row.tick_frozen,
    updatedAt: row.updated_at,
    ...parseExtras(row.extras_json),
  };
}

const META_CORE_KEYS = new Set([
  "tableRevision",
  "lastTickAt",
  "tickFrozen",
  "updatedAt",
]);

export function writeTableMetaRow(patch) {
  const conn = loadDatabase();
  if (!conn) return null;
  const prev = readTableMetaRow() || {
    tableRevision: 0,
    lastTickAt: null,
    tickFrozen: false,
    updatedAt: new Date().toISOString(),
  };
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  const extras = {};
  for (const [k, v] of Object.entries(next)) {
    if (!META_CORE_KEYS.has(k)) extras[k] = v;
  }
  conn
    .prepare(
      `INSERT INTO table_meta(id, table_revision, last_tick_at, tick_frozen, updated_at, extras_json)
       VALUES(1, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         table_revision = excluded.table_revision,
         last_tick_at = excluded.last_tick_at,
         tick_frozen = excluded.tick_frozen,
         updated_at = excluded.updated_at,
         extras_json = excluded.extras_json`,
    )
    .run(
      Number(next.tableRevision) || 0,
      next.lastTickAt ?? null,
      next.tickFrozen ? 1 : 0,
      next.updatedAt,
      Object.keys(extras).length ? JSON.stringify(extras) : null,
    );
  return next;
}

export function bumpTableMetaRevision() {
  const prev = readTableMetaRow();
  const tableRevision = (prev?.tableRevision ?? 0) + 1;
  return writeTableMetaRow({ tableRevision });
}

function writeTickJournalInternal(conn, briefing) {
  if (!briefing || briefing.turnTo == null) return;
  const turn = Number(briefing.turnTo);
  const now = new Date().toISOString();
  conn
    .prepare(
      `INSERT INTO tick_journal(turn, turn_from, turn_to, economy_json, created_at)
       VALUES(?, ?, ?, ?, ?)
       ON CONFLICT(turn) DO UPDATE SET
         turn_from = excluded.turn_from,
         turn_to = excluded.turn_to,
         economy_json = excluded.economy_json,
         created_at = excluded.created_at`,
    )
    .run(
      turn,
      briefing.turnFrom ?? null,
      briefing.turnTo ?? null,
      briefing.economy ? JSON.stringify(briefing.economy) : null,
      now,
    );
  conn.prepare("DELETE FROM tick_events WHERE turn = ?").run(turn);
  const ins = conn.prepare(
    "INSERT INTO tick_events(turn, type, payload_json, at) VALUES(?, ?, ?, ?)",
  );
  for (const ev of briefing.events || []) {
    const { type, at, ...rest } = ev;
    ins.run(
      turn,
      type || "event",
      Object.keys(rest).length ? JSON.stringify(rest) : null,
      at || now,
    );
  }
}

export function writeTickJournal(briefing) {
  const conn = loadDatabase();
  if (!conn) return;
  writeTickJournalInternal(conn, briefing);
}

export function getLastJournalRow() {
  const conn = loadDatabase();
  if (!conn) return null;
  const row = conn
    .prepare(
      "SELECT turn, turn_from, turn_to, economy_json FROM tick_journal ORDER BY turn DESC LIMIT 1",
    )
    .get();
  if (!row) return null;
  const events = conn
    .prepare(
      "SELECT type, payload_json, at FROM tick_events WHERE turn = ? ORDER BY id",
    )
    .all(row.turn)
    .map((e) => ({
      type: e.type,
      at: e.at,
      ...(e.payload_json ? parseExtras(e.payload_json) : {}),
    }));
  return {
    turnFrom: row.turn_from,
    turnTo: row.turn_to,
    economy: row.economy_json ? parseExtras(row.economy_json) : {},
    events,
  };
}

function ledgerRowToEntry(row) {
  return {
    id: row.id,
    at: row.at,
    turn: row.turn,
    factionId: row.faction_id,
    currencyId: row.currency_id,
    delta: row.delta,
    reason: row.reason,
    intentId: row.intent_id,
    ...parseExtras(row.extras_json),
  };
}

export function readLedgerEntries() {
  const conn = loadDatabase();
  if (!conn) return [];
  return conn
    .prepare(
      "SELECT id, at, turn, faction_id, currency_id, delta, reason, intent_id, extras_json FROM ledger_entries ORDER BY at",
    )
    .all()
    .map(ledgerRowToEntry);
}

export function insertLedgerEntry(entry) {
  const conn = loadDatabase();
  if (!conn) return;
  const {
    id,
    at,
    turn,
    factionId,
    currencyId,
    delta,
    reason,
    intentId,
    ...rest
  } = entry;
  conn
    .prepare(
      `INSERT OR REPLACE INTO ledger_entries
       (id, at, turn, faction_id, currency_id, delta, reason, intent_id, extras_json)
       VALUES (@id, @at, @turn, @faction_id, @currency_id, @delta, @reason, @intent_id, @extras_json)`,
    )
    .run({
      id,
      at: at || new Date().toISOString(),
      turn: Number(turn) || 0,
      faction_id: factionId,
      currency_id: currencyId,
      delta: Number(delta) || 0,
      reason: reason ?? null,
      intent_id: intentId ?? null,
      extras_json: Object.keys(rest).length ? JSON.stringify(rest) : null,
    });
}

function intentToRow(intent) {
  const {
    id,
    factionId,
    turn,
    status,
    defId,
    payload,
    submittedAt,
    apCost,
    forceApCost,
    note,
    source,
    legacyType,
    resolvedAt,
    cancelledAt,
  } = intent;
  const extras = {
    apCost,
    forceApCost,
    note,
    source,
    legacyType,
    resolvedAt,
    cancelledAt,
  };
  return {
    id,
    faction_id: factionId,
    turn: Number(turn) || 0,
    status,
    def_id: defId ?? null,
    payload_json: JSON.stringify({ ...(payload || {}), __extras: extras }),
    submitted_at: submittedAt || new Date().toISOString(),
  };
}

function rowToIntent(row) {
  const payload = row.payload_json ? parseExtras(row.payload_json) : {};
  const extras = payload.__extras || {};
  delete payload.__extras;
  return {
    id: row.id,
    factionId: row.faction_id,
    turn: row.turn,
    status: row.status,
    defId: row.def_id,
    payload,
    submittedAt: row.submitted_at,
    ...extras,
  };
}

function replacePlayerIntentsInternal(conn, list) {
  conn.prepare("DELETE FROM intents").run();
  const ins = conn.prepare(
    `INSERT INTO intents(id, faction_id, turn, status, def_id, payload_json, submitted_at)
     VALUES (@id, @faction_id, @turn, @status, @def_id, @payload_json, @submitted_at)`,
  );
  for (const intent of list) {
    ins.run(intentToRow(intent));
  }
}

export function readPlayerIntents() {
  const conn = loadDatabase();
  if (!conn) return null;
  return conn
    .prepare(
      "SELECT id, faction_id, turn, status, def_id, payload_json, submitted_at FROM intents ORDER BY submitted_at",
    )
    .all()
    .map(rowToIntent);
}

export function writePlayerIntents(list) {
  const conn = loadDatabase();
  if (!conn) return;
  const tx = conn.transaction((rows) => replacePlayerIntentsInternal(conn, rows));
  tx(list);
}

function engagementToRow(eng) {
  return {
    id: eng.id,
    status: eng.status || "active",
    theater: eng.theater ?? null,
    turn: Number(eng.turnCreated ?? eng.startedTurn ?? 0) || 0,
    result_json: JSON.stringify(eng),
  };
}

function rowToEngagement(row) {
  if (!row.result_json) return null;
  try {
    return JSON.parse(row.result_json);
  } catch {
    return null;
  }
}

function replaceEngagementsInternal(conn, list) {
  conn.prepare("DELETE FROM engagements").run();
  const ins = conn.prepare(
    `INSERT INTO engagements(id, status, theater, turn, result_json)
     VALUES (@id, @status, @theater, @turn, @result_json)`,
  );
  for (const eng of list) {
    if (!eng?.id) continue;
    ins.run(engagementToRow(eng));
  }
}

export function readEngagementRows() {
  const conn = loadDatabase();
  if (!conn) return null;
  return conn
    .prepare("SELECT result_json FROM engagements ORDER BY turn, id")
    .all()
    .map(rowToEngagement)
    .filter(Boolean);
}

export function writeEngagementRows(list) {
  const conn = loadDatabase();
  if (!conn) return;
  const tx = conn.transaction((rows) => replaceEngagementsInternal(conn, rows));
  tx(list);
}

export function getNormalizedStoreStats() {
  const conn = loadDatabase();
  if (!conn) return null;
  const count = (sql) => conn.prepare(sql).get()?.c ?? 0;
  return {
    table_meta: conn.prepare("SELECT COUNT(*) AS c FROM table_meta").get()?.c ?? 0,
    tick_journal: count("SELECT COUNT(*) AS c FROM tick_journal"),
    tick_events: count("SELECT COUNT(*) AS c FROM tick_events"),
    ledger_entries: count("SELECT COUNT(*) AS c FROM ledger_entries"),
    intents: count("SELECT COUNT(*) AS c FROM intents"),
    engagements: count("SELECT COUNT(*) AS c FROM engagements"),
    migrated: migrationDone(conn),
  };
}
