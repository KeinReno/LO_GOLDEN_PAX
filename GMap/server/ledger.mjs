/**
 * Faction stocks + ledger append log (P4).
 * Authoritative currencies: 6 category stocks (A–F) + legacy metal/supply bridge.
 */
import { LEDGER_PATH, readJson, writeJson, ensureDataDir } from "./tableStore.mjs";
import { getContent } from "./contentLoader.mjs";
import { resolveAlias } from "./normalizeWorld.mjs";

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
    /** Acquired via trade/history: { techId, source, transferable?, acquiredTurn? }[] */
    acquiredTechs: [],
    techTiers: { ...DEFAULT_TECH_TIERS },
    unlockedProperties: [],
    researchQueue: [],
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

function ensureCategoryStocks(stocks) {
  for (const [k, v] of Object.entries(DEFAULT_STOCKS)) {
    if (stocks[k] == null || Number.isNaN(Number(stocks[k]))) {
      stocks[k] = v;
    }
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

export function getFactionPublicEco(factionId) {
  const ledger = readLedger();
  const eco = ensureFactionEco(ledger, factionId);
  const content = getContent();
  // Bias treasury rows (metal + commodity peg) — a single tick floods category
  // lines and used to push treasury out of a flat slice, zeroing budget UI.
  const factionEntries = ledger.entries.filter((e) => e.factionId === factionId);
  const isTreasuryRow = (e) =>
    e.currencyId === "currency.metal" ||
    e.reason === "treasury_income" ||
    e.reason === "treasury_upkeep";
  const metal = factionEntries.filter(isTreasuryRow).slice(-100);
  const other = factionEntries.filter((e) => !isTreasuryRow(e)).slice(-50);
  const seen = new Set();
  const merged = [];
  for (const e of [...metal, ...other]) {
    const key =
      e.id ||
      `${e.turn ?? ""}|${e.currencyId}|${e.delta}|${e.reason}|${e.intentId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(e);
  }
  merged.sort((a, b) => {
    const td = (b.turn ?? 0) - (a.turn ?? 0);
    if (td !== 0) return td;
    return String(b.at || b.createdAt || "").localeCompare(
      String(a.at || a.createdAt || ""),
    );
  });
  const recent = merged.slice(0, 120);
  return {
    ...eco,
    recent,
    currencies: content.currencies,
    taxDefs: content.taxes,
    economy_schema: content.economy_schema,
    rules: {
      apPerTurn: content.rules?.apPerTurn,
      forceAp: content.rules?.forceAp,
      deficit: content.rules?.deficit,
      tax: content.rules?.tax,
      population: content.rules?.population,
    },
  };
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

const CURRENCY_LABELS = {
  "currency.metal": "Металл",
  "currency.supply": "Обеспечение",
  "currency.extracta": "Сырьё",
  "currency.materia": "Материалы",
  "currency.industria": "Промышленность",
  "currency.energia": "Энергия",
  "currency.bios": "Биомасса",
  "currency.cognitio": "Знание",
};

const STAT_LABELS = {
  defense: "оборона",
  attack: "атака",
  morale: "мораль",
  stability: "стабильность",
};

const CHANNEL_PLAYER_LABELS = {
  "tax_pressure": "Налоговое давление",
  ap: "Очки действия",
  stability: "Стабильность",
  move_cost: "Стоимость хода",
  "stat:defense": "Оборона",
  "stat:attack": "Атака",
  "loyalty:*": "Лояльность",
  "cost:diplomacy": "Дипломатия",
  "research:*": "Наука",
  "cost:*": "Затраты",
};

function roundNum(n, decimals = 2) {
  if (n == null || !Number.isFinite(Number(n))) return n;
  const f = 10 ** decimals;
  return Math.round(Number(n) * f) / f;
}

function explainChannelPlayerLabel(channelKey) {
  if (CHANNEL_PLAYER_LABELS[channelKey]) return CHANNEL_PLAYER_LABELS[channelKey];
  const [head, tail] = String(channelKey).split(":");
  if (head === "stat" && tail) {
    return STAT_LABELS[tail] ? `Показатель: ${STAT_LABELS[tail]}` : `Показатель: ${tail}`;
  }
  if (head === "production" || head === "upkeep") {
    const cur = currencyLabelFromChannel(channelKey);
    return cur ? `${head === "production" ? "Доход" : "Содержание"} · ${cur}` : channelKey;
  }
  if (head === "loyalty") return "Лояльность";
  if (head === "cost") return tail ? `Затраты · ${tail}` : "Затраты";
  if (head === "research") return "Наука";
  return channelKey.replace(/_/g, " ");
}

const EXPLAIN_CATEGORY_LABELS = {
  income: "Доход",
  upkeep: "Содержание",
  tax: "Налоги",
  race: "Расы",
  deficit: "Дефицит",
  other: "Прочее",
};

/** Hide internal/GM-only modifier sources from player explain. */
const PUBLIC_EXPLAIN_KINDS = new Set([
  "tax",
  "race",
  "faction",
  "deficit",
  "pressure",
  "depot",
  "culture",
  "faith",
  "faith_taboo",
]);

function explainChannelCategory(channelKey) {
  if (channelKey.startsWith("production:")) return "income";
  if (channelKey.startsWith("upkeep:")) return "upkeep";
  if (channelKey === "tax_pressure") return "tax";
  if (channelKey === "ap") return "deficit";
  if (channelKey.startsWith("pop_growth")) return "race";
  return "other";
}

function currencyLabelFromChannel(channelKey) {
  const m = String(channelKey).match(/:([^:]+)$/);
  if (!m) return null;
  return CURRENCY_LABELS[m[1]] || null;
}

function formatExplainModifier(flat, mult) {
  const parts = [];
  if (flat && flat !== 0) {
    const n = roundNum(flat);
    parts.push(n > 0 ? `+${n}` : String(n));
  }
  if (mult && mult !== 1) {
    parts.push(`×${roundNum(mult, 3)}`);
  }
  return parts.join(" ") || null;
}

function formatMult(mult) {
  return roundNum(mult, 3);
}

function formatEffectSnippet(effect, args = {}) {
  if (effect === "production_mult" && args.mult != null) {
    return `добыча ×${formatMult(args.mult)}`;
  }
  if (effect === "production_flat" && args.amount != null) {
    return `добыча +${roundNum(args.amount)}`;
  }
  if (effect === "upkeep_mult" && args.mult != null) {
    return `содержание ×${formatMult(args.mult)}`;
  }
  if (effect === "upkeep_flat" && args.amount != null) {
    return `содержание +${roundNum(args.amount)}`;
  }
  if (effect === "stat_mult" && args.stat != null && args.mult != null) {
    const stat =
      STAT_LABELS[args.stat] ?? String(args.stat).replace(/_/g, " ");
    return `${stat} ×${formatMult(args.mult)}`;
  }
  if (effect === "pop_growth_mult" && args.mult != null) {
    return `рост ×${formatMult(args.mult)}`;
  }
  if (effect === "tax_pressure" && args.amount != null) {
    return `давление +${roundNum(args.amount)}`;
  }
  if (effect === "ap_add" && args.amount != null) {
    return `ОД ${args.amount > 0 ? "+" : ""}${roundNum(args.amount)}`;
  }
  if (effect === "habitability_mult" && args.mult != null) {
    return `обитаемость ×${formatMult(args.mult)}`;
  }
  if (effect === "loyalty_add" && args.amount != null) {
    return `лояльность ${args.amount > 0 ? "+" : ""}${roundNum(args.amount)}`;
  }
  if (effect === "loyalty_mult" && args.mult != null) {
    return `лояльность ×${formatMult(args.mult)}`;
  }
  if (effect === "logistics_range_add" && (args.hops != null || args.amount != null)) {
    const h = args.hops ?? args.amount;
    return `логистика +${h} хоп`;
  }
  if (effect === "research_cost_mult" && args.mult != null) {
    return `наука ×${formatMult(args.mult)}`;
  }
  if (effect === "diplomacy_trust_decay_mult" && args.mult != null) {
    return `доверие ×${formatMult(args.mult)}`;
  }
  if (effect === "move_cost_mult" && args.mult != null) {
    return `ход ×${formatMult(args.mult)}`;
  }
  if (effect === "cost_mult" && args.mult != null) {
    return `стоимость ×${formatMult(args.mult)}`;
  }
  if (effect === "forbid_intent") {
    return "запрет действия";
  }
  if (effect === "unlock_property" && args.property) {
    return `свойство ${args.property}`;
  }
  if (effect === "stability_add" && args.amount != null) {
    return `стабильность ${args.amount > 0 ? "+" : ""}${args.amount}`;
  }
  if (effect === "pop_cap_flat" && args.amount != null) {
    return `лимит нас. +${args.amount}`;
  }
  return null;
}

function summarizeExplainLines(lines, maxLines = 20) {
  if (lines.length <= maxLines) return lines;
  const byCat = new Map();
  for (const line of lines) {
    if (!byCat.has(line.category)) byCat.set(line.category, []);
    byCat.get(line.category).push(line);
  }
  const out = [];
  for (const [category, group] of byCat) {
    if (group.length <= 3) {
      out.push(...group);
      continue;
    }
    out.push({
      category,
      label: EXPLAIN_CATEGORY_LABELS[category] || category,
      modifier: `${group.length} эфф.`,
      sources: group.slice(0, 2).map((g) => g.label),
    });
  }
  return out.slice(0, maxLines);
}

/**
 * Compact, player-safe modifier breakdown (no GM poi/system ids).
 * @param {Array<{ channel: string, flat?: number, mult?: number, sources?: object[] }>} explainRows
 * @param {{ channels?: Record<string, { taxRate?: number, tax?: number }>, deficit?: string }} [opts]
 */
export function sanitizeEconomyExplain(explainRows, opts = {}) {
  const lines = [];
  const raceTraits = new Map();
  const factionTraits = new Map();

  for (const row of explainRows || []) {
    const { channel, flat, mult, sources } = row;
    const modifier = formatExplainModifier(flat ?? 0, mult ?? 1);
    if (!modifier) continue;

    const category = explainChannelCategory(channel);
    const currency = currencyLabelFromChannel(channel);
    let label;
    switch (category) {
      case "income":
        label = currency ? `Доход · ${currency}` : "Доход";
        break;
      case "upkeep":
        label = currency ? `Содержание · ${currency}` : "Содержание";
        break;
      case "tax":
        label = "Налоговое давление";
        break;
      case "deficit":
        label = "Дефицит казны";
        break;
      case "race":
        label = currency ? `Рост · ${currency}` : "Рост населения";
        break;
      default:
        label = explainChannelPlayerLabel(channel);
        break;
    }

    const publicSources = (sources || []).filter((s) => {
      const kind = s.source?.kind;
      if (!kind) return category !== "other";
      return PUBLIC_EXPLAIN_KINDS.has(kind);
    });

    for (const s of sources || []) {
      if (s.source?.kind !== "race") continue;
      const key = s.source.id || s.source.label || "race";
      const snippet = formatEffectSnippet(s.effect, s.args);
      if (!snippet) continue;
      if (!raceTraits.has(key)) {
        raceTraits.set(key, {
          label: s.source.label || "Раса",
          effects: [],
        });
      }
      const bucket = raceTraits.get(key);
      if (!bucket.effects.includes(snippet)) bucket.effects.push(snippet);
    }

    for (const s of sources || []) {
      if (s.source?.kind !== "faction") continue;
      const key = s.source.id || s.source.label || "faction";
      const snippet = formatEffectSnippet(s.effect, s.args);
      if (!snippet) continue;
      if (!factionTraits.has(key)) {
        factionTraits.set(key, {
          label: s.source.label || "Держава",
          effects: [],
        });
      }
      const bucket = factionTraits.get(key);
      if (!bucket.effects.includes(snippet)) bucket.effects.push(snippet);
    }

    const sourceLabels = [
      ...new Set(
        publicSources.map((s) => s.source?.label).filter(Boolean),
      ),
    ].slice(0, 3);

    if (category === "other" && sourceLabels.length === 0) continue;

    lines.push({
      category,
      label,
      modifier,
      sources: sourceLabels.length ? sourceLabels : undefined,
    });
  }

  for (const [cur, ch] of Object.entries(opts.channels || {})) {
    if (!ch || !(ch.taxRate > 0) || !(ch.tax > 0)) continue;
    const currency = CURRENCY_LABELS[cur] || cur;
    lines.push({
      category: "tax",
      label: `Сбор · ${currency}`,
      modifier: `−${Math.floor(ch.tax)} (${Math.round(ch.taxRate * 100)}%)`,
    });
  }

  const deficit = opts.deficit;
  if (deficit && deficit !== "ok") {
    lines.push({
      category: "deficit",
      label: deficit === "empty" ? "Пустая казна" : "Низкие запасы",
      modifier: deficit === "empty" ? "штрафы" : "−1 ОД",
    });
  }

  return {
    lines: summarizeExplainLines(lines, 20),
    raceTraits: [...raceTraits.values()]
      .map((r) => ({
        label: r.label,
        summary: r.effects.slice(0, 4).join(", "),
      }))
      .filter((r) => r.summary)
      .slice(0, 6),
    factionTraits: [...factionTraits.values()]
      .map((r) => ({
        label: r.label,
        summary: r.effects.slice(0, 4).join(", "),
      }))
      .filter((r) => r.summary)
      .slice(0, 6),
  };
}

/** Player-facing economy slice (login / view-refresh / planet actions). */
export function publicEconomyPayload(eco) {
  const out = {
    stocks: eco.stocks,
    taxes: eco.taxes,
    pendingPolicy: eco.pendingPolicy,
    pressure: eco.pressure,
    deficit: eco.deficit,
    recent: eco.recent ?? [],
    techTiers: eco.techTiers,
    unlockedProperties: eco.unlockedProperties,
    unlockedTechs: eco.unlockedTechs,
    unlockedUpgrades: eco.unlockedUpgrades,
    unlockedLineages: Array.isArray(eco.unlockedLineages)
      ? [...eco.unlockedLineages]
      : [],
    acquiredTechs: Array.isArray(eco.acquiredTechs)
      ? eco.acquiredTechs.map((a) => ({ ...a }))
      : [],
    researchQueue: Array.isArray(eco.researchQueue) ? [...eco.researchQueue] : [],
    buildQueue: Array.isArray(eco.buildQueue)
      ? eco.buildQueue.map((q) => ({
          systemId: String(q.systemId || ""),
          planetId: String(q.planetId || ""),
          buildingId: String(q.buildingId || ""),
        }))
      : [],
    flowPriorities:
      eco.flowPriorities && typeof eco.flowPriorities === "object"
        ? { ...eco.flowPriorities }
        : {},
    stockReserves:
      eco.stockReserves && typeof eco.stockReserves === "object"
        ? { ...eco.stockReserves }
        : {},
    forceReserve: Array.isArray(eco.forceReserve)
      ? eco.forceReserve.map((g) => ({ ...g }))
      : [],
    economicPolicy: eco.economicPolicy ?? null,
    laws: Array.isArray(eco.laws) ? [...eco.laws] : [],
    alchemy: eco.alchemy
      ? {
          attemptsUsedThisTurn: Number(eco.alchemy.attemptsUsedThisTurn || 0),
          discoveredRecipes: Array.isArray(eco.alchemy.discoveredRecipes)
            ? [...eco.alchemy.discoveredRecipes]
            : [],
          lastExperimentTurn: eco.alchemy.lastExperimentTurn ?? null,
          journal: Array.isArray(eco.alchemy.journal)
            ? eco.alchemy.journal.slice(-10)
            : [],
        }
      : {
          attemptsUsedThisTurn: 0,
          discoveredRecipes: [],
          lastExperimentTurn: null,
          journal: [],
        },
  };
  if (eco.bottlenecks != null) out.bottlenecks = eco.bottlenecks;
  if (eco.explain != null) out.explain = eco.explain;
  return out;
}
