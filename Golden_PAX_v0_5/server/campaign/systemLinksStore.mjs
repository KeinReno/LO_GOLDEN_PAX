/**
 * Hyperlane link persistence. Domain rules live in domain/systems/*.
 * Link objects at the domain/API boundary use GMap's `{ fromId, toId, type }`.
 */
import { randomUUID } from "node:crypto";

function rowToLink(row) {
  return { id: row.id, fromId: row.fromId, toId: row.toId, type: row.type };
}

export function listSystemLinks(db, campaignId) {
  return db
    .prepare(
      "SELECT id, from_system_id as fromId, to_system_id as toId, type FROM system_links WHERE campaign_id = ?",
    )
    .all(campaignId)
    .map(rowToLink);
}

export function findUndirectedLink(db, campaignId, aId, bId) {
  const row = db
    .prepare(
      `SELECT id, from_system_id as fromId, to_system_id as toId, type FROM system_links
       WHERE campaign_id = ? AND ((from_system_id = ? AND to_system_id = ?) OR (from_system_id = ? AND to_system_id = ?))`,
    )
    .get(campaignId, aId, bId, bId, aId);
  return row ? rowToLink(row) : null;
}

export function createSystemLink(db, campaignId, { id, fromId, toId, type }) {
  if (!fromId || !toId || fromId === toId) return { ok: false, error: "invalid_link" };
  const existing = findUndirectedLink(db, campaignId, fromId, toId);
  if (existing) return { ok: false, error: "link_exists", link: existing };
  const linkId = id || randomUUID();
  db.prepare(
    "INSERT INTO system_links (id, campaign_id, from_system_id, to_system_id, type) VALUES (?, ?, ?, ?, ?)",
  ).run(linkId, campaignId, fromId, toId, type || "corridor");
  return { ok: true, link: { id: linkId, fromId, toId, type: type || "corridor" } };
}

export function deleteSystemLink(db, campaignId, linkId) {
  const info = db.prepare("DELETE FROM system_links WHERE campaign_id = ? AND id = ?").run(campaignId, linkId);
  return info.changes > 0;
}

/** Replace this system's authored outgoing links (fromId = systemId). Incoming links are left alone. */
export function replaceOutgoingLinks(db, campaignId, systemId, links) {
  db.prepare("DELETE FROM system_links WHERE campaign_id = ? AND from_system_id = ?").run(campaignId, systemId);
  const created = [];
  for (const spec of links || []) {
    const result = createSystemLink(db, campaignId, {
      fromId: systemId,
      toId: spec.toSystemId || spec.toId,
      type: spec.type,
    });
    if (!result.ok && result.error !== "link_exists") return result;
    if (result.ok) created.push(result.link);
  }
  return { ok: true, links: created };
}
