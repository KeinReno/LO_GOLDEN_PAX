/**
 * Display-only political sectors (GMap world.sectors). No domain rule
 * reads this table — polygon/color/notes are for the client map overlay.
 */
export function listSectors(db, campaignId) {
  return db
    .prepare(
      "SELECT id, name, polygon_json as polygonJson, color, notes FROM sectors WHERE campaign_id = ?",
    )
    .all(campaignId)
    .map((row) => ({
      id: row.id,
      name: row.name,
      polygon: JSON.parse(row.polygonJson || "[]"),
      color: row.color ?? null,
      notes: row.notes ?? null,
    }));
}

export function createSector(db, campaignId, { id, name, polygon, color, notes }) {
  db.prepare(
    "INSERT INTO sectors (id, campaign_id, name, polygon_json, color, notes) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, campaignId, name, JSON.stringify(polygon || []), color ?? null, notes ?? null);
  return listSectors(db, campaignId).find((s) => s.id === id);
}
