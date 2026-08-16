/**
 * Persistence for EMA FX credits / pair rates and GM market-rate overrides.
 * Domain math lives in domain/economy/{fxExchange,marketRates}.mjs — this
 * file is the DB boundary (CLAUDE.md rule 3 / 5).
 */
import { emptyFxExchangeState } from "../domain/economy/fxExchange.mjs";

export function loadFxExchangeState(db, campaignId) {
  const meta = db
    .prepare("SELECT updated_at as updatedAt, turn, variant FROM fx_exchange_meta WHERE campaign_id = ?")
    .get(campaignId);
  const creditRows = db.prepare("SELECT peg_id as pegId, credit FROM fx_credits WHERE campaign_id = ?").all(campaignId);
  const rateRows = db
    .prepare("SELECT pair, buy, sell, note FROM fx_rates WHERE campaign_id = ?")
    .all(campaignId)
    .map((r) => (r.note ? { pair: r.pair, buy: r.buy, sell: r.sell, note: r.note } : { pair: r.pair, buy: r.buy, sell: r.sell }));
  if (!meta && creditRows.length === 0 && rateRows.length === 0) return emptyFxExchangeState();
  return {
    credits: Object.fromEntries(creditRows.map((r) => [r.pegId, r.credit])),
    rates: rateRows,
    updatedAt: meta?.updatedAt ?? null,
    turn: meta?.turn ?? null,
    variant: meta?.variant ?? null,
  };
}

export function saveFxExchangeState(db, campaignId, state) {
  db.prepare("DELETE FROM fx_credits WHERE campaign_id = ?").run(campaignId);
  db.prepare("DELETE FROM fx_rates WHERE campaign_id = ?").run(campaignId);
  const insertCredit = db.prepare("INSERT INTO fx_credits (campaign_id, peg_id, credit) VALUES (?, ?, ?)");
  for (const [pegId, credit] of Object.entries(state.credits || {})) {
    insertCredit.run(campaignId, pegId, credit);
  }
  const insertRate = db.prepare("INSERT INTO fx_rates (campaign_id, pair, buy, sell, note) VALUES (?, ?, ?, ?, ?)");
  for (const row of state.rates || []) {
    insertRate.run(campaignId, row.pair, row.buy, row.sell, row.note ?? null);
  }
  db.prepare(
    `INSERT INTO fx_exchange_meta (campaign_id, updated_at, turn, variant) VALUES (?, ?, ?, ?)
     ON CONFLICT (campaign_id) DO UPDATE SET updated_at = excluded.updated_at, turn = excluded.turn, variant = excluded.variant`,
  ).run(campaignId, state.updatedAt ?? null, state.turn ?? null, state.variant ?? null);
}

export function loadMarketRateOverrides(db, campaignId) {
  const rows = db
    .prepare("SELECT pair, buy, sell, note FROM market_rate_overrides WHERE campaign_id = ?")
    .all(campaignId)
    .map((r) => (r.note ? { pair: r.pair, buy: r.buy, sell: r.sell, note: r.note } : { pair: r.pair, buy: r.buy, sell: r.sell }));
  if (rows.length === 0) return { rates: [], updatedAt: null };
  return { rates: rows, updatedAt: null };
}

export function saveMarketRateOverrides(db, campaignId, rates) {
  db.prepare("DELETE FROM market_rate_overrides WHERE campaign_id = ?").run(campaignId);
  const insert = db.prepare("INSERT INTO market_rate_overrides (campaign_id, pair, buy, sell, note) VALUES (?, ?, ?, ?, ?)");
  for (const row of rates || []) {
    insert.run(campaignId, row.pair, row.buy, row.sell, row.note ?? null);
  }
  return { rates, updatedAt: new Date().toISOString() };
}

/** `{ [resourceId]: multiplier }` — raw stored values; domain clamps on use. */
export function loadPegRateOverrides(db, campaignId) {
  const rows = db.prepare("SELECT resource_id as resourceId, multiplier FROM peg_rate_overrides WHERE campaign_id = ?").all(campaignId);
  return Object.fromEntries(rows.map((r) => [r.resourceId, r.multiplier]));
}

export function savePegRateOverride(db, campaignId, resourceId, multiplier) {
  db.prepare(
    `INSERT INTO peg_rate_overrides (campaign_id, resource_id, multiplier) VALUES (?, ?, ?)
     ON CONFLICT (campaign_id, resource_id) DO UPDATE SET multiplier = excluded.multiplier`,
  ).run(campaignId, resourceId, multiplier);
  return loadPegRateOverrides(db, campaignId);
}
