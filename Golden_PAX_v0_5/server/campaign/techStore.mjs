import { defaultTechAccount } from "../domain/tech/techAccount.mjs";

function parseJson(raw, fallback) {
  if (raw == null || raw === "") return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function seedTechAccount(db, campaignId, factionId) {
  saveTechAccount(db, campaignId, factionId, defaultTechAccount(factionId), { turn: 0 });
}

export function loadTechAccount(db, campaignId, factionId) {
  const row = db
    .prepare(
      `SELECT tech_grades_json as gradesJson, tech_sockets_json as socketsJson, current_offers_json as offersJson,
              tech_tiers_json as tiersJson, unlocked_properties_json as propertiesJson, research_queue_json as queueJson
       FROM faction_tech WHERE campaign_id = ? AND faction_id = ?`,
    )
    .get(campaignId, factionId);
  if (!row) return null;

  const unlockedTechs = db
    .prepare("SELECT tech_id as techId FROM faction_unlocked_techs WHERE campaign_id = ? AND faction_id = ?")
    .all(campaignId, factionId)
    .map((r) => r.techId);

  return {
    factionId,
    unlockedTechs,
    techGrades: parseJson(row.gradesJson, {}),
    techSockets: parseJson(row.socketsJson, {}),
    currentOffers: parseJson(row.offersJson, {}),
    techTiers: JSON.parse(row.tiersJson),
    unlockedProperties: JSON.parse(row.propertiesJson),
    researchQueue: JSON.parse(row.queueJson),
  };
}

export function saveTechAccount(db, campaignId, factionId, account, { turn } = {}) {
  db.prepare(
    `INSERT INTO faction_tech (campaign_id, faction_id, tech_grades_json, tech_sockets_json, current_offers_json, tech_tiers_json, unlocked_properties_json, research_queue_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (campaign_id, faction_id) DO UPDATE SET
       tech_grades_json = excluded.tech_grades_json, tech_sockets_json = excluded.tech_sockets_json,
       current_offers_json = excluded.current_offers_json, tech_tiers_json = excluded.tech_tiers_json,
       unlocked_properties_json = excluded.unlocked_properties_json, research_queue_json = excluded.research_queue_json`,
  ).run(
    campaignId,
    factionId,
    JSON.stringify(account.techGrades ?? {}),
    JSON.stringify(account.techSockets ?? {}),
    JSON.stringify(account.currentOffers ?? {}),
    JSON.stringify(account.techTiers ?? {}),
    JSON.stringify(account.unlockedProperties ?? []),
    JSON.stringify(account.researchQueue ?? []),
  );

  const insertTech = db.prepare(
    "INSERT OR IGNORE INTO faction_unlocked_techs (campaign_id, faction_id, tech_id, unlocked_turn) VALUES (?, ?, ?, ?)",
  );
  for (const techId of account.unlockedTechs ?? []) {
    insertTech.run(campaignId, factionId, techId, turn ?? null);
  }
}
