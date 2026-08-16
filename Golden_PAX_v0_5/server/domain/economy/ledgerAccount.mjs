/**
 * A faction's economy account shape. Ported from GMap/server/ledger.mjs
 * (DEFAULT_STOCKS, defaultFactionEco) — trimmed to fields this domain
 * folder owns. GMap's version bundles tech/alchemy/civic fields into the
 * same object; those move to domain/tech and domain/court's own account
 * shapes as those are ported, instead of living here by convention.
 */

/**
 * Fallback only, for callers that don't have content on hand (mainly
 * tests). Real callers should pass `content` to defaultEconomyAccount —
 * starting stocks are authored in content/core/economy_balance.json's
 * `start.stocks` (CLAUDE.md rule 4: game data belongs in content, not
 * hard-coded here) and read from there when available. This constant
 * exists so the fallback path is still deterministic, not so it can drift
 * out of sync with content and go unnoticed.
 */
export const DEFAULT_STOCKS = {
  "currency.metal": 100,
  "currency.supply": 70,
  "currency.extracta": 14,
  "currency.materia": 12,
  "currency.industria": 8,
  "currency.energia": 16,
  "currency.bios": 18,
  "currency.cognitio": 36,
};

/**
 * @param {string} factionId
 * @param {object} [content]  loaded via server/contentLoader.mjs — supplies real start.stocks when given
 */
export function defaultEconomyAccount(factionId, content) {
  const stocks = content?.economy_balance?.start?.stocks ?? DEFAULT_STOCKS;
  return {
    factionId,
    stocks: { ...stocks },
    taxes: {
      "tax.materia": "none",
      "tax.energia": "none",
      "tax.bios": "none",
    },
    pendingPolicy: { taxes: {} },
    pressure: 0,
    deficit: "ok",
    stockReserves: {},
  };
}
