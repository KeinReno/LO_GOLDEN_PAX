import { randomUUID } from "node:crypto";
import { defaultEconomyAccount } from "../domain/economy/ledgerAccount.mjs";

/** Seed a faction's economy account row (real starting stocks from content — see ledgerAccount.mjs). */
export function seedEconomyAccount(db, campaignId, factionId, content) {
  const account = defaultEconomyAccount(factionId, content);
  saveEconomyAccount(db, campaignId, factionId, account, { turn: 0, journal: [] });
}

/** Loads the economy account shape domain/economy functions expect, or null if the faction has no row yet (not seeded). */
export function loadEconomyAccount(db, campaignId, factionId) {
  const stockRows = db
    .prepare("SELECT currency_id as currencyId, amount FROM faction_stocks WHERE campaign_id = ? AND faction_id = ?")
    .all(campaignId, factionId);
  const stocks = Object.fromEntries(stockRows.map((r) => [r.currencyId, r.amount]));

  const row = db
    .prepare("SELECT pressure, deficit, taxes_json as taxesJson, stock_reserves_json as reservesJson FROM faction_economy WHERE campaign_id = ? AND faction_id = ?")
    .get(campaignId, factionId);
  if (!row) return null;

  return {
    factionId,
    stocks,
    taxes: JSON.parse(row.taxesJson),
    pendingPolicy: { taxes: {} },
    pressure: row.pressure,
    deficit: row.deficit,
    stockReserves: JSON.parse(row.reservesJson),
  };
}

/**
 * Persist an updated economy account + append its turn's ledger entries
 * (the same journalEntry shape domain/economy/adjustStock.mjs already
 * produces maps directly onto ledger_entries' columns).
 */
export function saveEconomyAccount(db, campaignId, factionId, account, { turn, journal } = {}) {
  const upsertStock = db.prepare(
    "INSERT INTO faction_stocks (campaign_id, faction_id, currency_id, amount) VALUES (?, ?, ?, ?) ON CONFLICT (campaign_id, faction_id, currency_id) DO UPDATE SET amount = excluded.amount",
  );
  for (const [currencyId, amount] of Object.entries(account.stocks)) {
    upsertStock.run(campaignId, factionId, currencyId, amount);
  }

  db.prepare(
    `INSERT INTO faction_economy (campaign_id, faction_id, pressure, deficit, taxes_json, stock_reserves_json)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (campaign_id, faction_id) DO UPDATE SET
       pressure = excluded.pressure, deficit = excluded.deficit,
       taxes_json = excluded.taxes_json, stock_reserves_json = excluded.stock_reserves_json`,
  ).run(campaignId, factionId, account.pressure ?? 0, account.deficit ?? "ok", JSON.stringify(account.taxes ?? {}), JSON.stringify(account.stockReserves ?? {}));

  if (journal?.length) {
    const insertLedger = db.prepare(
      "INSERT INTO ledger_entries (id, campaign_id, at, turn, faction_id, currency_id, delta, reason, intent_id, extras_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const now = new Date().toISOString();
    for (const entry of journal) {
      insertLedger.run(
        randomUUID(),
        campaignId,
        now,
        turn ?? entry.turn ?? null,
        entry.factionId ?? factionId,
        entry.currencyId,
        entry.delta,
        entry.reason ?? null,
        entry.intentId ?? null,
        JSON.stringify({ requested: entry.requested, clamped: entry.clamped }),
      );
    }
  }
}
