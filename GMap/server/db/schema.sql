-- C4 normalized hot-state (runtime campaign data only — not content/core).

CREATE TABLE IF NOT EXISTS store_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS table_meta (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  table_revision INTEGER NOT NULL DEFAULT 0,
  last_tick_at   TEXT,
  tick_frozen    INTEGER NOT NULL DEFAULT 0,
  updated_at     TEXT NOT NULL,
  extras_json    TEXT
);

CREATE TABLE IF NOT EXISTS tick_journal (
  turn         INTEGER PRIMARY KEY,
  turn_from    INTEGER,
  turn_to      INTEGER,
  economy_json TEXT,
  created_at   TEXT
);

CREATE TABLE IF NOT EXISTS tick_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  turn         INTEGER NOT NULL,
  type         TEXT NOT NULL,
  payload_json TEXT,
  at           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tick_events_turn ON tick_events(turn);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id          TEXT PRIMARY KEY,
  at          TEXT NOT NULL,
  turn        INTEGER NOT NULL,
  faction_id  TEXT NOT NULL,
  currency_id TEXT NOT NULL,
  delta       REAL NOT NULL,
  reason      TEXT,
  intent_id   TEXT,
  extras_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_ledger_faction_turn ON ledger_entries(faction_id, turn);

CREATE TABLE IF NOT EXISTS intents (
  id           TEXT PRIMARY KEY,
  faction_id   TEXT NOT NULL,
  turn         INTEGER NOT NULL,
  status       TEXT NOT NULL,
  def_id       TEXT,
  payload_json TEXT,
  submitted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_intents_turn_status ON intents(turn, status);

CREATE TABLE IF NOT EXISTS engagements (
  id          TEXT PRIMARY KEY,
  status      TEXT NOT NULL,
  theater     TEXT,
  turn        INTEGER,
  result_json TEXT
);

-- Fallback kv for blobs not yet normalized (published, fog, etc.)
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
