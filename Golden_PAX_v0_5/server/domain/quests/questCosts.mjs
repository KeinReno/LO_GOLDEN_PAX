/**
 * Negative stock spends required by a quest choice's effects. Ported
 * verbatim from GMap/server/questEngine.mjs's stockCostsFromEffects —
 * already pure. Parity verified in questCosts.parity.test.mjs.
 */
export function stockCostsFromEffects(effects) {
  const need = {};
  for (const e of effects || []) {
    if ((e.effect === "upkeep_flat" || e.effect === "production_flat") && e.args?.resource) {
      const delta = Number(e.args.amount || 0);
      if (delta < 0) {
        const id = String(e.args.resource);
        need[id] = (need[id] || 0) + Math.abs(delta);
      }
    }
  }
  return need;
}

/** Pairs with domain/tech/afford.mjs's canAffordCost — same shape, this domain's own copy since GMap's canAffordQuestCosts is module-private and ledger-coupled. */
export function canAffordQuestCosts(stocks, effects) {
  const need = stockCostsFromEffects(effects);
  for (const [currencyId, amt] of Object.entries(need)) {
    const stock = Number(stocks?.[currencyId] ?? 0);
    if (stock < amt) {
      return { ok: false, error: `not enough ${currencyId} (need ${amt}, have ${stock})` };
    }
  }
  return { ok: true };
}
