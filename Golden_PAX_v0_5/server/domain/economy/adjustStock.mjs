/**
 * Apply a delta to one currency stock. Ported from the real clamp/reserve
 * math in GMap/server/ledger.mjs's adjustStock — same numeric behavior,
 * verified by adjustStock.parity.test.mjs — but reshaped from "mutate a
 * file-backed ledger in place" to a pure function over a plain account
 * object, since server/db is SQLite here (see CLAUDE.md rule 5), not
 * GMap's data/ledger.json.
 *
 * Rules preserved from GMap: never go negative; spending respects
 * stockReserves (can't spend below the reserved amount) unless the
 * adjustment *is* a reserve change; every non-zero applied delta produces
 * a journal entry, including when the request got clamped.
 *
 * @param {{ stocks: Record<string, number>, stockReserves?: Record<string, { amount?: number }> }} eco
 * @param {string} currencyId
 * @param {number} delta
 * @param {{ turn?: number, reason?: string, intentId?: string }} [meta]
 * @returns {{ stocks: Record<string, number>, appliedDelta: number, journalEntry: object | null }}
 */
export function adjustStock(eco, currencyId, delta, meta = {}) {
  const stocks = { ...eco.stocks };
  const cur = Number(stocks[currencyId] ?? 0);
  const reason = meta.reason ?? "adjust";
  const isReserveChange =
    reason === "reserve_stock" || reason === "reserve_change" || reason === "set_stock_reserve";

  let requested = Number(delta || 0);
  if (requested < 0 && !isReserveChange) {
    const reserved = eco.stockReserves?.[currencyId];
    const reserveAmt = Math.max(0, Math.floor(Number(reserved?.amount ?? 0) || 0));
    const spendable = Math.max(0, Math.floor(cur) - reserveAmt);
    if (-requested > spendable) requested = -spendable;
  }

  const raw = cur + requested;
  const next = Math.max(0, Math.floor(raw));
  const applied = next - Math.floor(cur);
  stocks[currencyId] = next;

  let journalEntry = null;
  if (applied !== 0 || Number(delta || 0) !== 0) {
    journalEntry = {
      factionId: eco.factionId,
      currencyId,
      delta: applied,
      turn: meta.turn ?? null,
      reason,
      intentId: meta.intentId ?? null,
      requested: Number(delta || 0),
      clamped: applied !== Math.floor(Number(delta || 0)),
    };
  }

  return { stocks, appliedDelta: applied, journalEntry };
}
