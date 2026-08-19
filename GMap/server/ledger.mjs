/**
 * Faction stocks + ledger append log (P4).
 * Authoritative currencies: 6 category stocks (A–F) + legacy metal/supply bridge.
 *
 * Thin re-export barrel — implementation lives in ./ledger/*.mjs.
 * Kept as the stable import path so existing `from "./ledger.mjs"`
 * call sites across the server don't need to change.
 */
export {
  DEFAULT_STOCKS,
  CATEGORY_CURRENCY,
  DEFAULT_TECH_TIERS,
  defaultFactionEco,
  readLedger,
  writeLedger,
  ensureFactionEco,
  ensureAllFactions,
  migrateLedgerForWorld,
  appendLedgerEntry,
  adjustStock,
  setStockReserve,
} from "./ledger/core.mjs";
export { sanitizeEconomyExplain } from "./ledger/explain.mjs";
export { getFactionPublicEco, publicEconomyPayload } from "./ledger/publicPayload.mjs";
