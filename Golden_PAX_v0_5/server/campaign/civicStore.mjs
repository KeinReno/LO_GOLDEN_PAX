import { defaultCivicAccount } from "../domain/court/civicAccount.mjs";

export function seedCivicAccount(db, campaignId, factionId) {
  saveCivicAccount(db, campaignId, factionId, defaultCivicAccount());
}

export function loadCivicAccount(db, campaignId, factionId) {
  const row = db
    .prepare("SELECT trade_score as trade, culture_score as culture, laws_json as lawsJson FROM faction_civic WHERE campaign_id = ? AND faction_id = ?")
    .get(campaignId, factionId);
  if (!row) return null;
  return { civicScores: { trade: row.trade, culture: row.culture }, laws: JSON.parse(row.lawsJson) };
}

export function saveCivicAccount(db, campaignId, factionId, account) {
  db.prepare(
    `INSERT INTO faction_civic (campaign_id, faction_id, trade_score, culture_score, laws_json)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (campaign_id, faction_id) DO UPDATE SET
       trade_score = excluded.trade_score, culture_score = excluded.culture_score, laws_json = excluded.laws_json`,
  ).run(campaignId, factionId, account.civicScores.trade, account.civicScores.culture, JSON.stringify(account.laws ?? []));
}
