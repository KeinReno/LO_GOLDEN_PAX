/**
 * Persistence for faction_stability + planet_revolts.
 * Domain/court never imports this (CLAUDE.md rule 5).
 *
 * NOT a GMap port — GMap has zero stability columns.
 */
import { stabilityCfg } from "../domain/court/stability.mjs";

export function seedStabilityAccount(db, campaignId, factionId, content) {
  const value = stabilityCfg(content).startingValue;
  db.prepare(
    "INSERT OR IGNORE INTO faction_stability (campaign_id, faction_id, value) VALUES (?, ?, ?)",
  ).run(campaignId, factionId, value);
}

export function loadStability(db, campaignId, factionId, content) {
  const row = db
    .prepare("SELECT value FROM faction_stability WHERE campaign_id = ? AND faction_id = ?")
    .get(campaignId, factionId);
  if (!row) {
    seedStabilityAccount(db, campaignId, factionId, content);
    return stabilityCfg(content).startingValue;
  }
  return Number(row.value);
}

export function saveStability(db, campaignId, factionId, value) {
  db.prepare(
    `INSERT INTO faction_stability (campaign_id, faction_id, value) VALUES (?, ?, ?)
     ON CONFLICT(campaign_id, faction_id) DO UPDATE SET value = excluded.value`,
  ).run(campaignId, factionId, value);
}

export function listFactionRevolts(db, campaignId, factionId) {
  return db
    .prepare(
      `SELECT planet_id as planetId, source_faction_id as sourceFactionId,
              rebel_force_id as rebelForceId, rebel_faction_id as rebelFactionId,
              stage2_since_turn as stage2SinceTurn
       FROM planet_revolts WHERE campaign_id = ? AND source_faction_id = ?`,
    )
    .all(campaignId, factionId);
}

export function getPlanetRevolt(db, campaignId, planetId) {
  return (
    db
      .prepare(
        `SELECT planet_id as planetId, source_faction_id as sourceFactionId,
                rebel_force_id as rebelForceId, rebel_faction_id as rebelFactionId,
                stage2_since_turn as stage2SinceTurn
         FROM planet_revolts WHERE campaign_id = ? AND planet_id = ?`,
      )
      .get(campaignId, planetId) || null
  );
}

export function isRebelOccupyingForce(db, campaignId, forceId) {
  if (!forceId) return false;
  const row = db
    .prepare("SELECT 1 FROM planet_revolts WHERE campaign_id = ? AND rebel_force_id = ?")
    .get(campaignId, forceId);
  return !!row;
}

export function upsertPlanetRevolt(db, campaignId, row) {
  db.prepare(
    `INSERT INTO planet_revolts (campaign_id, planet_id, source_faction_id, rebel_force_id, rebel_faction_id, stage2_since_turn)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(campaign_id, planet_id) DO UPDATE SET
       source_faction_id = excluded.source_faction_id,
       rebel_force_id = excluded.rebel_force_id,
       rebel_faction_id = excluded.rebel_faction_id,
       stage2_since_turn = excluded.stage2_since_turn`,
  ).run(campaignId, row.planetId, row.sourceFactionId, row.rebelForceId ?? null, row.rebelFactionId, row.stage2SinceTurn);
}

export function deletePlanetRevolt(db, campaignId, planetId) {
  db.prepare("DELETE FROM planet_revolts WHERE campaign_id = ? AND planet_id = ?").run(campaignId, planetId);
}

export function deleteFactionRevolts(db, campaignId, factionId) {
  db.prepare("DELETE FROM planet_revolts WHERE campaign_id = ? AND source_faction_id = ?").run(campaignId, factionId);
}
