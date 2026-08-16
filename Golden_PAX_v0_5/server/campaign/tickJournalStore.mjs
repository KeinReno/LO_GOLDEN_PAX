/**
 * tick_journal / tick_events — written at end of runCampaignTurn and
 * appended live for engage/move/occupy/research between ticks.
 */

export function appendTickEvent(db, campaignId, turn, type, payload = {}) {
  db.prepare(
    "INSERT INTO tick_events (campaign_id, turn, type, payload_json, at) VALUES (?, ?, ?, ?, ?)",
  ).run(campaignId, turn, type, JSON.stringify(payload), new Date().toISOString());
}

export function listTickEvents(db, campaignId, turn) {
  return db
    .prepare(
      "SELECT type, payload_json as payloadJson, at FROM tick_events WHERE campaign_id = ? AND turn = ? ORDER BY id",
    )
    .all(campaignId, turn)
    .map((row) => ({ type: row.type, at: row.at, ...(JSON.parse(row.payloadJson || "{}")) }));
}

export function saveTickJournal(db, campaignId, journal) {
  db.prepare(
    `INSERT INTO tick_journal (campaign_id, turn, turn_from, turn_to, economy_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (campaign_id, turn) DO UPDATE SET
       turn_from = excluded.turn_from, turn_to = excluded.turn_to,
       economy_json = excluded.economy_json, created_at = excluded.created_at`,
  ).run(
    campaignId,
    journal.turnTo,
    journal.turnFrom ?? null,
    journal.turnTo,
    JSON.stringify(journal.economy ?? {}),
    new Date().toISOString(),
  );
}

export function loadLastTickJournal(db, campaignId) {
  const row = db
    .prepare(
      "SELECT turn, turn_from as turnFrom, turn_to as turnTo, economy_json as economyJson FROM tick_journal WHERE campaign_id = ? ORDER BY turn DESC LIMIT 1",
    )
    .get(campaignId);
  if (!row) return null;
  const events = [
    ...(row.turnFrom != null && row.turnFrom !== row.turnTo ? listTickEvents(db, campaignId, row.turnFrom) : []),
    ...listTickEvents(db, campaignId, row.turn),
  ];
  return {
    turn: row.turn,
    turnFrom: row.turnFrom,
    turnTo: row.turnTo,
    economy: JSON.parse(row.economyJson || "{}"),
    events,
  };
}

export function writeCampaignTurnJournal(db, campaignId, turnFrom, turnTo, { economy, extraEvents = [] } = {}) {
  const prior = listTickEvents(db, campaignId, turnFrom);
  for (const ev of extraEvents) {
    appendTickEvent(db, campaignId, turnTo, ev.type, ev);
  }
  const events = [...prior, ...extraEvents];
  const journal = { turnFrom, turnTo, economy: economy || {}, events };
  saveTickJournal(db, campaignId, journal);
  return journal;
}
