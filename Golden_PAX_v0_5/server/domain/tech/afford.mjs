/**
 * Ported verbatim from GMap/server/techActions.mjs's canAfford (already
 * pure) — reshaped to take stocks directly rather than a full eco object,
 * matching this project's plain-data function style.
 */
export function canAffordCost(stocks, cost) {
  for (const [cur, amt] of Object.entries(cost || {})) {
    const numAmt = Number(amt || 0);
    if (numAmt < 0) return { ok: false, error: "negative cost not allowed" };
    if ((stocks?.[cur] ?? 0) < numAmt) {
      return { ok: false, error: `not enough ${cur} (need ${numAmt})` };
    }
  }
  return { ok: true };
}
