import { randomUUID } from "node:crypto";

/**
 * Campaign + faction CRUD. This is the only place besides the other
 * *Store.mjs files in this folder allowed to touch server/db — domain
 * functions (server/domain/*) never see a database handle (CLAUDE.md
 * rule 3).
 */

export function createCampaign(db, { id, name }) {
  const campaignId = id || randomUUID();
  const now = new Date().toISOString();
  db.prepare("INSERT INTO campaigns (id, name, created_at) VALUES (?, ?, ?)").run(campaignId, name, now);
  db.prepare(
    "INSERT INTO table_meta (campaign_id, current_turn, table_revision, updated_at) VALUES (?, 0, 0, ?)",
  ).run(campaignId, now);
  return { id: campaignId, name, createdAt: now };
}

export function getCampaign(db, campaignId) {
  const row = db.prepare("SELECT id, name, created_at as createdAt FROM campaigns WHERE id = ?").get(campaignId);
  return row || null;
}

/** Public login dropdown — names only, no tokens. */
export function listCampaigns(db) {
  return db.prepare("SELECT id, name FROM campaigns ORDER BY created_at DESC").all();
}

/** Smoke/debug tables created by live scripts — not a playable seat. */
const JUNK_CAMPAIGN_NAME =
  /^(smoke-|dbg-|Peg |mint-debug|modstack-|double-get|table-tonight)/i;

export function isTableCampaignName(name) {
  return !JUNK_CAMPAIGN_NAME.test(String(name || ""));
}

/** Login dropdown: hide smoke leftovers. */
export function listLoginCampaigns(db) {
  return listCampaigns(db).filter((c) => isTableCampaignName(c.name));
}

function campaignScopedTables(db) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((r) => r.name)
    .filter((name) => /^[a-z0-9_]+$/i.test(name))
    .filter((name) => db.pragma(`table_info(${name})`).some((col) => col.name === "campaign_id"));
}

export function deleteCampaign(db, campaignId) {
  const tables = campaignScopedTables(db);
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      for (const table of tables) {
        db.prepare(`DELETE FROM ${table} WHERE campaign_id = ?`).run(campaignId);
      }
      db.prepare("DELETE FROM campaigns WHERE id = ?").run(campaignId);
    })();
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

export function pruneJunkCampaigns(db) {
  const junk = listCampaigns(db).filter((c) => !isTableCampaignName(c.name));
  for (const row of junk) deleteCampaign(db, row.id);
  return junk;
}

export function getTableMeta(db, campaignId) {
  const row = db
    .prepare("SELECT current_turn as currentTurn, table_revision as tableRevision FROM table_meta WHERE campaign_id = ?")
    .get(campaignId);
  return row ? { currentTurn: row.currentTurn, tableRevision: row.tableRevision } : null;
}

export function getCurrentTurn(db, campaignId) {
  return getTableMeta(db, campaignId)?.currentTurn ?? null;
}

export function getTableRevision(db, campaignId) {
  return getTableMeta(db, campaignId)?.tableRevision ?? 0;
}

export function bumpTableRevision(db, campaignId) {
  db.prepare("UPDATE table_meta SET table_revision = table_revision + 1, updated_at = ? WHERE campaign_id = ?").run(
    new Date().toISOString(),
    campaignId,
  );
  return getTableRevision(db, campaignId);
}

export function setCurrentTurn(db, campaignId, turn) {
  db.prepare("UPDATE table_meta SET current_turn = ?, updated_at = ? WHERE campaign_id = ?").run(
    turn,
    new Date().toISOString(),
    campaignId,
  );
}

/** @param {{ id, name, playerId, raceId, colorHex, isNpc }} faction */
export function addFaction(db, campaignId, faction) {
  db.prepare(
    "INSERT INTO factions (id, campaign_id, name, player_id, race_id, color_hex, is_npc) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(
    faction.id,
    campaignId,
    faction.name,
    faction.playerId ?? null,
    faction.raceId,
    faction.colorHex,
    faction.isNpc ? 1 : 0,
  );
  return { ...getFaction(db, campaignId, faction.id), campaignId };
}

const FACTION_COLUMNS = `id, name, player_id as playerId, race_id as raceId, color_hex as colorHex, is_npc as isNpc,
              peg_resource_id as pegResourceId, peg_changed_turn as pegChangedTurn`;

function mapFactionRow(row) {
  return { ...row, isNpc: !!row.isNpc, pegResourceId: row.pegResourceId ?? null, pegChangedTurn: row.pegChangedTurn ?? null };
}

export function listFactions(db, campaignId) {
  return db.prepare(`SELECT ${FACTION_COLUMNS} FROM factions WHERE campaign_id = ?`).all(campaignId).map(mapFactionRow);
}

export function getFaction(db, campaignId, factionId) {
  const row = db.prepare(`SELECT ${FACTION_COLUMNS} FROM factions WHERE campaign_id = ? AND id = ?`).get(campaignId, factionId);
  return row ? mapFactionRow(row) : null;
}

export function setFactionName(db, campaignId, factionId, name) {
  const current = getFaction(db, campaignId, factionId);
  if (!current) return null;
  db.prepare("UPDATE factions SET name = ? WHERE campaign_id = ? AND id = ?").run(name, campaignId, factionId);
  return getFaction(db, campaignId, factionId);
}

/** `factions.id` is a global PK — collisions across campaigns 409, not 500. */
export function getFactionById(db, factionId) {
  const row = db
    .prepare(`SELECT campaign_id as campaignId, ${FACTION_COLUMNS} FROM factions WHERE id = ?`)
    .get(factionId);
  return row ? { ...mapFactionRow(row), campaignId: row.campaignId } : null;
}

/**
 * Bind or switch a faction's treasury peg. First pick does not start a
 * transition penalty; a later *switch* records `pegChangedTurn` so
 * `pegTransitionMultiplier` can ramp conversion back to full strength.
 * Passing `resourceId: null` clears the peg.
 */
export function setFactionPeg(db, campaignId, factionId, resourceId, turn) {
  const current = getFaction(db, campaignId, factionId);
  if (!current) return null;
  const next = resourceId || null;
  let pegChangedTurn = current.pegChangedTurn;
  if (next && current.pegResourceId && current.pegResourceId !== next) {
    pegChangedTurn = turn;
  }
  if (!next) pegChangedTurn = null;
  db.prepare("UPDATE factions SET peg_resource_id = ?, peg_changed_turn = ? WHERE campaign_id = ? AND id = ?").run(
    next,
    pegChangedTurn,
    campaignId,
    factionId,
  );
  return getFaction(db, campaignId, factionId);
}
