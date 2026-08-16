import { defaultDiplomacyAccount } from "../domain/diplomacy/diplomacyAccount.mjs";
import { relationKey } from "../domain/diplomacy/relations.mjs";

export function seedDiplomacyAccount(db, campaignId, factionId) {
  saveDiplomacyAccount(db, campaignId, factionId, defaultDiplomacyAccount());
}

export function loadDiplomacyAccount(db, campaignId, factionId) {
  const row = db
    .prepare(
      "SELECT treaties_json as treatiesJson, history_json as historyJson, last_broken_treaty_turn as lastBrokenTreatyTurn FROM faction_diplomacy WHERE campaign_id = ? AND faction_id = ?",
    )
    .get(campaignId, factionId);
  if (!row) return null;

  const opinionRows = db
    .prepare("SELECT toward_faction_id as towardFactionId, opinion FROM faction_opinions WHERE campaign_id = ? AND faction_id = ?")
    .all(campaignId, factionId);

  return {
    opinions: Object.fromEntries(opinionRows.map((r) => [r.towardFactionId, r.opinion])),
    treaties: JSON.parse(row.treatiesJson),
    history: JSON.parse(row.historyJson),
    lastBrokenTreatyTurn: row.lastBrokenTreatyTurn,
  };
}

export function saveDiplomacyAccount(db, campaignId, factionId, account) {
  db.prepare(
    `INSERT INTO faction_diplomacy (campaign_id, faction_id, treaties_json, history_json, last_broken_treaty_turn)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (campaign_id, faction_id) DO UPDATE SET
       treaties_json = excluded.treaties_json, history_json = excluded.history_json,
       last_broken_treaty_turn = excluded.last_broken_treaty_turn`,
  ).run(campaignId, factionId, JSON.stringify(account.treaties ?? []), JSON.stringify(account.history ?? []), account.lastBrokenTreatyTurn ?? null);

  const upsertOpinion = db.prepare(
    "INSERT INTO faction_opinions (campaign_id, faction_id, toward_faction_id, opinion) VALUES (?, ?, ?, ?) ON CONFLICT (campaign_id, faction_id, toward_faction_id) DO UPDATE SET opinion = excluded.opinion",
  );
  for (const [towardId, opinion] of Object.entries(account.opinions ?? {})) {
    upsertOpinion.run(campaignId, factionId, towardId, opinion);
  }
}

/** @returns {import("../domain/diplomacy/relations.mjs").RelationsTable} */
export function loadRelations(db, campaignId) {
  const rows = db
    .prepare("SELECT faction_a_id as a, faction_b_id as b, relation FROM diplomacy_relations WHERE campaign_id = ?")
    .all(campaignId);
  return Object.fromEntries(rows.map((r) => [relationKey(r.a, r.b), r.relation]));
}

export function setRelation(db, campaignId, aId, bId, relation) {
  const [a, b] = aId < bId ? [aId, bId] : [bId, aId];
  db.prepare(
    "INSERT INTO diplomacy_relations (campaign_id, faction_a_id, faction_b_id, relation) VALUES (?, ?, ?, ?) ON CONFLICT (campaign_id, faction_a_id, faction_b_id) DO UPDATE SET relation = excluded.relation",
  ).run(campaignId, a, b, relation);
}
