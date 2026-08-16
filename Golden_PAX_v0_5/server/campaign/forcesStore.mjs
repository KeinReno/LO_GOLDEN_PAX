import { randomUUID } from "node:crypto";

/**
 * Fleets/legions persistence. See domain/forces/*.mjs for the rules this
 * loads/saves data for, and db/schema.sql's `forces` table for the shape.
 */

const FORCE_COLUMNS = `id, faction_id as factionId, kind, name, home_planet_id as homePlanetId,
              system_id as systemId, movement_points as movementPoints, engine_tier as engineTier,
              fuel_tier as fuelTier, composition_json as compositionJson`;

function rowToForce(row) {
  return {
    ...row,
    movementPoints: Number(row.movementPoints ?? 0),
    engineTier: Number(row.engineTier ?? 0),
    fuelTier: Number(row.fuelTier ?? 0),
    composition: JSON.parse(row.compositionJson),
  };
}

export function createForce(db, campaignId, { id, factionId, kind, name, homePlanetId, systemId, composition, movementPoints, engineTier, fuelTier }) {
  const forceId = id || randomUUID();
  db.prepare(
    `INSERT INTO forces (id, campaign_id, faction_id, kind, name, home_planet_id, system_id, movement_points, engine_tier, fuel_tier, composition_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    forceId,
    campaignId,
    factionId,
    kind === "legion" ? "legion" : "fleet",
    name,
    homePlanetId ?? null,
    systemId ?? null,
    movementPoints ?? 0,
    engineTier ?? 0,
    fuelTier ?? 0,
    JSON.stringify(composition ?? []),
  );
  return loadForce(db, campaignId, forceId);
}

export function loadForce(db, campaignId, forceId) {
  const row = db.prepare(`SELECT ${FORCE_COLUMNS} FROM forces WHERE campaign_id = ? AND id = ?`).get(campaignId, forceId);
  return row ? rowToForce(row) : null;
}

export function listFactionForces(db, campaignId, factionId) {
  const rows = db.prepare(`SELECT ${FORCE_COLUMNS} FROM forces WHERE campaign_id = ? AND faction_id = ?`).all(campaignId, factionId);
  return rows.map(rowToForce);
}

/** All forces in a campaign, across every faction — for turn.mjs's upkeep + MP regen. */
export function listCampaignForces(db, campaignId) {
  const rows = db.prepare(`SELECT ${FORCE_COLUMNS} FROM forces WHERE campaign_id = ?`).all(campaignId);
  return rows.map(rowToForce);
}

export function saveForce(db, campaignId, force) {
  db.prepare(
    `UPDATE forces SET name = ?, home_planet_id = ?, system_id = ?, movement_points = ?, engine_tier = ?, fuel_tier = ?, composition_json = ?
     WHERE campaign_id = ? AND id = ?`,
  ).run(
    force.name,
    force.homePlanetId ?? null,
    force.systemId ?? null,
    force.movementPoints ?? 0,
    force.engineTier ?? 0,
    force.fuelTier ?? 0,
    JSON.stringify(force.composition ?? []),
    campaignId,
    force.id,
  );
}

export function deleteForce(db, campaignId, forceId) {
  db.prepare("DELETE FROM forces WHERE campaign_id = ? AND id = ?").run(campaignId, forceId);
}

/**
 * Capture a force (boarding win). saveForce does not write faction_id.
 * NOT a port; GMap has no boarding.
 */
export function transferForceFaction(db, campaignId, forceId, newFactionId) {
  const info = db.prepare("UPDATE forces SET faction_id = ? WHERE campaign_id = ? AND id = ?").run(newFactionId, campaignId, forceId);
  if (info.changes === 0) return null;
  return loadForce(db, campaignId, forceId);
}
