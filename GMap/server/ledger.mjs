/**
 * Faction stocks + ledger append log (P4).
 */
import { LEDGER_PATH, readJson, writeJson, ensureDataDir } from "./tableStore.mjs";
import { getContent } from "./contentLoader.mjs";

export function defaultFactionEco(factionId) {
  return {
    factionId,
    stocks: {
      "currency.metal": 80,
      "currency.supply": 60,
    },
    taxes: {
      "tax.industry": "none",
      "tax.supply": "none",
    },
    pendingPolicy: { taxes: {} },
    laws: [],
    pressure: 0,
    deficit: "ok",
  };
}

export function readLedger() {
  ensureDataDir();
  const raw = readJson(LEDGER_PATH, null);
  if (!raw || typeof raw !== "object") {
    return { factions: {}, entries: [] };
  }
  return {
    factions: raw.factions && typeof raw.factions === "object" ? raw.factions : {},
    entries: Array.isArray(raw.entries) ? raw.entries : [],
  };
}

export function writeLedger(ledger) {
  writeJson(LEDGER_PATH, ledger);
}

export function ensureFactionEco(ledger, factionId) {
  if (!ledger.factions[factionId]) {
    ledger.factions[factionId] = defaultFactionEco(factionId);
  }
  const f = ledger.factions[factionId];
  if (!f.stocks) f.stocks = { "currency.metal": 80, "currency.supply": 60 };
  if (!f.taxes) f.taxes = { "tax.industry": "none", "tax.supply": "none" };
  if (!f.pendingPolicy) f.pendingPolicy = { taxes: {} };
  if (typeof f.pressure !== "number") f.pressure = 0;
  if (!f.deficit) f.deficit = "ok";
  return f;
}

export function ensureAllFactions(ledger, world) {
  for (const fac of world.factions ?? []) {
    ensureFactionEco(ledger, fac.id);
  }
  return ledger;
}

export function appendLedgerEntry(ledger, entry) {
  const row = {
    id: `led_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    ...entry,
  };
  ledger.entries.push(row);
  // keep last 2000
  if (ledger.entries.length > 2000) {
    ledger.entries = ledger.entries.slice(-2000);
  }
  return row;
}

export function adjustStock(ledger, factionId, currencyId, delta, meta = {}) {
  const eco = ensureFactionEco(ledger, factionId);
  const cur = Number(eco.stocks[currencyId] ?? 0);
  eco.stocks[currencyId] = Math.floor(cur + delta);
  appendLedgerEntry(ledger, {
    factionId,
    currencyId,
    delta,
    turn: meta.turn ?? null,
    reason: meta.reason ?? "adjust",
    intentId: meta.intentId ?? null,
  });
  return eco.stocks[currencyId];
}

export function getFactionPublicEco(factionId) {
  const ledger = readLedger();
  const eco = ensureFactionEco(ledger, factionId);
  const content = getContent();
  const recent = ledger.entries
    .filter((e) => e.factionId === factionId)
    .slice(-40)
    .reverse();
  return {
    ...eco,
    recent,
    currencies: content.currencies,
    taxDefs: content.taxes,
    rules: {
      apPerTurn: content.rules?.apPerTurn,
      deficit: content.rules?.deficit,
      tax: content.rules?.tax,
      population: content.rules?.population,
    },
  };
}
