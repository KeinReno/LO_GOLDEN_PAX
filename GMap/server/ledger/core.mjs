/**
 * Faction stocks + ledger append log (P4). Core I/O and per-faction
 * eco bookkeeping. Extracted from ../ledger.mjs.
 */
import { LEDGER_PATH, readJson, writeJson, ensureDataDir } from "../tableStore.mjs";
import { isNormalizedStoreActive } from "../db/storeAdapter.mjs";
import { insertLedgerEntry, readLedgerEntries } from "../db/campaignDb.mjs";
import { getContent } from "../contentLoader.mjs";
import { resolveAlias } from "../normalizeWorld.mjs";
import { ensureRoleScores } from "../roleScores.mjs";

/** Starting stocks for a new faction (aligned to economy_balance.start). */
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

export const CATEGORY_CURRENCY = {
  A: "currency.extracta",
  B: "currency.materia",
  C: "currency.industria",
  D: "currency.energia",
  E: "currency.bios",
  F: "currency.cognitio",
};

export const DEFAULT_TECH_TIERS = { A: 1, B: 1, C: 1, D: 1, E: 1, F: 1 };

export function defaultFactionEco(factionId) {
  return {
    factionId,
    stocks: { ...DEFAULT_STOCKS },
    taxes: {
      "tax.materia": "none",
      "tax.energia": "none",
      "tax.bios": "none",
    },
    pendingPolicy: { taxes: {} },
    laws: [],
    pressure: 0,
    deficit: "ok",
    bottlenecks: {},
    unlockedTechs: [],
    unlockedUpgrades: [],
    techGrades: {},
    techSockets: {},
    /** Acquired via trade/history: { techId, source, transferable?, acquiredTurn? }[] */
    acquiredTechs: [],
    techTiers: { ...DEFAULT_TECH_TIERS },
    unlockedProperties: [],
    researchQueue: [],
    /** 3-candidate research offers keyed by economy category A–F. */
    currentOffers: {},
    /** Hybrid lineages unlocked empire-wide (race_hybrid.*). */
    unlockedLineages: [],
    /** Planned builds: { systemId, planetId, buildingId }[] */
    buildQueue: [],
    /** RPS edge priorities: systemId | "_faction" → { from, to }. */
    flowPriorities: {},
    /** Soft reserves: currencyId → { amount, label }. */
    stockReserves: {},
    /** Units pulled from decks into faction reserve pool. */
    forceReserve: [],
    /** Active doctrine id: military | trade | growth | null */
    economicPolicy: null,
    /** Tech alchemy lab state */
    alchemy: {
      attemptsUsedThisTurn: 0,
      discoveredRecipes: [],
      lastExperimentTurn: null,
      journal: [],
    },
  };
}

export function readLedger() {
  ensureDataDir();
  const raw = readJson(LEDGER_PATH, null);
  const factions =
    raw && typeof raw === "object" && raw.factions && typeof raw.factions === "object"
      ? raw.factions
      : {};
  if (isNormalizedStoreActive()) {
    return { factions, entries: readLedgerEntries() };
  }
  if (!raw || typeof raw !== "object") {
    return { factions: {}, entries: [] };
  }
  return {
    factions,
    entries: Array.isArray(raw.entries) ? raw.entries : [],
  };
}

export function writeLedger(ledger) {
  if (isNormalizedStoreActive()) {
    writeJson(LEDGER_PATH, { factions: ledger.factions || {} });
    return;
  }
  writeJson(LEDGER_PATH, ledger);
}

function ensureCategoryStocks(stocks) {
  for (const [k, v] of Object.entries(DEFAULT_STOCKS)) {
    if (stocks[k] == null || Number.isNaN(Number(stocks[k]))) {
      stocks[k] = v;
    }
  }
  return stocks;
}

/** Ensure strategic map resource keys exist as 0 (never undefined) — B1 T1.7. */
function ensureStrategicStocks(stocks, content) {
  try {
    const c = content || getContent();
    const ids = new Set(c.economy_schema?.resource_ranks?.strategic || []);
    for (const def of Object.values(c.map_resources || {})) {
      if (!def?.id) continue;
      if (def.rank === "strategic" || def.strategic === true) ids.add(def.id);
    }
    for (const id of ids) {
      if (stocks[id] == null || Number.isNaN(Number(stocks[id]))) {
        stocks[id] = 0;
      }
    }
  } catch {
    /* content may be unavailable during early boot */
  }
  return stocks;
}

export function ensureFactionEco(ledger, factionId) {
  if (!ledger.factions[factionId]) {
    ledger.factions[factionId] = defaultFactionEco(factionId);
  }
  const f = ledger.factions[factionId];
  if (!f.stocks) f.stocks = { ...DEFAULT_STOCKS };
  else ensureCategoryStocks(f.stocks);
  ensureStrategicStocks(f.stocks);
  if (!f.taxes) {
    f.taxes = {
      "tax.materia": "none",
      "tax.energia": "none",
      "tax.bios": "none",
    };
  } else {
    // Migrate legacy industry/supply → materia/bios.
    if (f.taxes["tax.industry"] != null && f.taxes["tax.materia"] == null) {
      f.taxes["tax.materia"] = f.taxes["tax.industry"];
    }
    if (f.taxes["tax.supply"] != null && f.taxes["tax.bios"] == null) {
      f.taxes["tax.bios"] = f.taxes["tax.supply"];
    }
    if (f.taxes["tax.energia"] == null) f.taxes["tax.energia"] = "none";
    if (f.taxes["tax.materia"] == null) f.taxes["tax.materia"] = "none";
    if (f.taxes["tax.bios"] == null) f.taxes["tax.bios"] = "none";
  }
  if (!f.pendingPolicy) f.pendingPolicy = { taxes: {} };
  if (typeof f.pressure !== "number") f.pressure = 0;
  if (!f.deficit) f.deficit = "ok";
  if (!f.bottlenecks) f.bottlenecks = {};
  if (!Array.isArray(f.unlockedTechs)) f.unlockedTechs = [];
  if (!Array.isArray(f.unlockedUpgrades)) f.unlockedUpgrades = [];
  else {
    const migrated = [];
    const seen = new Set();
    for (const raw of f.unlockedUpgrades) {
      const id = resolveAlias("tech_upgrades", raw);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      migrated.push(id);
    }
    f.unlockedUpgrades = migrated;
  }
  if (!f.techGrades || typeof f.techGrades !== "object") f.techGrades = {};
  if (!f.techSockets || typeof f.techSockets !== "object") f.techSockets = {};
  if (!Array.isArray(f.acquiredTechs)) f.acquiredTechs = [];
  if (!f.techTiers || typeof f.techTiers !== "object") {
    f.techTiers = { ...DEFAULT_TECH_TIERS };
  } else {
    for (const cat of Object.keys(DEFAULT_TECH_TIERS)) {
      if (f.techTiers[cat] == null) f.techTiers[cat] = 1;
    }
  }
  if (!Array.isArray(f.unlockedProperties)) f.unlockedProperties = [];
  if (!Array.isArray(f.researchQueue)) f.researchQueue = [];
  if (!f.currentOffers || typeof f.currentOffers !== "object") f.currentOffers = {};
  if (!Array.isArray(f.unlockedLineages)) f.unlockedLineages = [];
  if (!Array.isArray(f.buildQueue)) f.buildQueue = [];
  if (!f.flowPriorities || typeof f.flowPriorities !== "object") {
    f.flowPriorities = {};
  }
  if (!f.stockReserves || typeof f.stockReserves !== "object") {
    f.stockReserves = {};
  }
  if (!Array.isArray(f.forceReserve)) {
    f.forceReserve = [];
  }
  if (f.economicPolicy === undefined) f.economicPolicy = null;
  if (!Array.isArray(f.laws)) f.laws = [];
  ensureRoleScores(f);
  if (!Array.isArray(f.openPaths)) f.openPaths = [];
  if (!Array.isArray(f.powerPaths)) f.powerPaths = [];
  if (!f.civicScores || typeof f.civicScores !== "object") {
    f.civicScores = { trade: 0, culture: 0 };
  } else {
    if (f.civicScores.trade == null) f.civicScores.trade = 0;
    if (f.civicScores.culture == null) f.civicScores.culture = 0;
  }
  if (!f.alchemy || typeof f.alchemy !== "object") {
    f.alchemy = {
      attemptsUsedThisTurn: 0,
      discoveredRecipes: [],
      lastExperimentTurn: null,
      journal: [],
    };
  } else {
    if (!Array.isArray(f.alchemy.discoveredRecipes)) {
      f.alchemy.discoveredRecipes = [];
    }
    if (!Number.isFinite(f.alchemy.attemptsUsedThisTurn)) {
      f.alchemy.attemptsUsedThisTurn = 0;
    }
    if (!Array.isArray(f.alchemy.journal)) f.alchemy.journal = [];
  }
  return f;
}

export function ensureAllFactions(ledger, world) {
  for (const fac of world.factions ?? []) {
    ensureFactionEco(ledger, fac.id);
  }
  return ledger;
}

/** B6: migrate ledger eco fields when world is loaded (called from tableStore). */
export function migrateLedgerForWorld(world) {
  const ledger = readLedger();
  ensureAllFactions(ledger, world);
  writeLedger(ledger);
  return ledger;
}

export function appendLedgerEntry(ledger, entry) {
  const row = {
    id: `led_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    ...entry,
  };
  ledger.entries.push(row);
  if (isNormalizedStoreActive()) {
    insertLedgerEntry(row);
  }
  return row;
}

/**
 * Apply delta to a stock. Clamps at 0 (no negative treasury).
 * Respects stockReserves: spending cannot drop below reserved amount
 * unless reason is a reserve change itself.
 * Returns the resulting stock value.
 */
export function adjustStock(ledger, factionId, currencyId, delta, meta = {}) {
  const eco = ensureFactionEco(ledger, factionId);
  const cur = Number(eco.stocks[currencyId] ?? 0);
  const reason = meta.reason ?? "adjust";
  const isReserveChange =
    reason === "reserve_stock" ||
    reason === "reserve_change" ||
    reason === "set_stock_reserve";
  let requested = Number(delta || 0);
  if (requested < 0 && !isReserveChange) {
    const reserved = eco.stockReserves?.[currencyId];
    const reserveAmt = Math.max(
      0,
      Math.floor(Number(reserved?.amount ?? 0) || 0),
    );
    const spendable = Math.max(0, Math.floor(cur) - reserveAmt);
    if (-requested > spendable) {
      requested = -spendable;
    }
  }
  const raw = cur + requested;
  const next = Math.max(0, Math.floor(raw));
  const applied = next - Math.floor(cur);
  eco.stocks[currencyId] = next;
  if (applied !== 0 || Number(delta || 0) !== 0) {
    appendLedgerEntry(ledger, {
      factionId,
      currencyId,
      delta: applied,
      turn: meta.turn ?? null,
      reason,
      intentId: meta.intentId ?? null,
      requested: Number(delta || 0),
      clamped: applied !== Math.floor(Number(delta || 0)),
    });
  }
  return eco.stocks[currencyId];
}

/**
 * Apply stock reserve immediately (intent.reserve_stock is marked instant).
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function setStockReserve(factionId, currencyId, amount, label = "резерв") {
  const id = String(currencyId || "");
  const amt = Math.floor(Number(amount) || 0);
  const tag = String(label || "резерв").slice(0, 48);
  if (!id || amt < 0) return { ok: false, error: "нужны currencyId и amount ≥ 0" };
  const ledger = readLedger();
  const eco = ensureFactionEco(ledger, factionId);
  const stock = Number(eco.stocks?.[id] ?? 0);
  if (!eco.stockReserves) eco.stockReserves = {};
  if (amt === 0) {
    delete eco.stockReserves[id];
  } else {
    if (amt > stock) {
      return { ok: false, error: `недостаточно запаса (есть ${stock})` };
    }
    eco.stockReserves[id] = { amount: amt, label: tag };
  }
  writeLedger(ledger);
  return { ok: true };
}
