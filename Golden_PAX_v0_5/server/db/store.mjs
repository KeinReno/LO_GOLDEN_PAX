import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../../data");
const dbPath = path.join(dataDir, "golden-pax.sqlite");
const schemaPath = path.join(__dirname, "schema.sql");

let db = null;

/**
 * Opens a fresh SQLite handle with schema.sql applied. `target` defaults
 * to the real on-disk store; pass ":memory:" (or any better-sqlite3
 * target) for tests so they never touch the dev DB file. Exported
 * separately from getDb() so tests can get an isolated handle without
 * going through the process-wide singleton.
 */
export function createDb(target = dbPath) {
  if (target === dbPath) fs.mkdirSync(dataDir, { recursive: true });
  const handle = new Database(target);
  if (target !== ":memory:") handle.pragma("journal_mode = WAL"); // WAL needs a real file
  handle.pragma("foreign_keys = ON");
  handle.exec(fs.readFileSync(schemaPath, "utf8").replace(/CREATE INDEX IF NOT EXISTS idx_forces_system[^;]*;/g, ""));
  // CREATE TABLE IF NOT EXISTS does not add columns to an already-created
  // table — existing on-disk DBs need these ALTERs after schema.sql grew.
  ensureColumn(handle, "factions", "peg_resource_id", "TEXT");
  ensureColumn(handle, "factions", "peg_changed_turn", "INTEGER");
  ensureColumn(handle, "planets", "grade", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(handle, "planets", "orbital_grade", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(handle, "faction_tech", "tech_grades_json", "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(handle, "faction_tech", "tech_sockets_json", "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(handle, "faction_tech", "current_offers_json", "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(handle, "systems", "x", "REAL");
  ensureColumn(handle, "systems", "y", "REAL");
  ensureColumn(handle, "systems", "is_capital", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(handle, "systems", "kind", "TEXT");
  ensureColumn(handle, "systems", "stars_json", "TEXT");
  ensureColumn(handle, "forces", "system_id", "TEXT");
  ensureColumn(handle, "forces", "movement_points", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(handle, "forces", "engine_tier", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(handle, "forces", "fuel_tier", "INTEGER NOT NULL DEFAULT 0");
  // Index lives in schema.sql for fresh DBs; existing DBs lack system_id
  // until the ALTER above, so CREATE INDEX must run after that.
  handle.exec("CREATE INDEX IF NOT EXISTS idx_forces_system ON forces(system_id)");
  return handle;
}

function ensureColumn(handle, table, column, typeSql) {
  const cols = handle.pragma(`table_info(${table})`);
  if (cols.some((c) => c.name === column)) return;
  handle.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeSql}`);
}

/** The single process-wide store, opened (and schema'd) once and reused. */
export function getDb() {
  if (!db) db = createDb();
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
