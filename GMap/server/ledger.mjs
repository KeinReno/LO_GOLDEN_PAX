/**
 * Faction stocks + ledger append log (P4).
 * Authoritative currencies: 6 category stocks (A–F) + legacy metal/supply bridge.
 */
import { LEDGER_PATH, readJson, writeJson, ensureDataDir } from "./tableStore.mjs";
import { getContent } from "./contentLoader.mjs";

/** Starting stocks for a new faction (balanced for early colony survival). */
export const DEFAULT_STOCKS = {
  "currency.metal": 80,
  "currency.supply": 60,
  "currency.extracta": 12,
  "currency.materia": 10,
  "currency.industria": 4,
  "currency.energia": 14,
  "currency.bios": 16,
  "currency.cognitio": 32,
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
      "tax.industry": "none",
      "tax.supply": "none",
    },
    pendingPolicy: { taxes: {} },
    laws: [],
    pressure: 0,
    deficit: "ok",
    bottlenecks: {},
    unlockedTechs: [],
    unlockedUpgrades: [],
    techTiers: { ...DEFAULT_TECH_TIERS },
    unlockedProperties: [],
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
  if (!f.taxes) f.taxes = { "tax.industry": "none", "tax.supply": "none" };
  if (!f.pendingPolicy) f.pendingPolicy = { taxes: {} };
  if (typeof f.pressure !== "number") f.pressure = 0;
  if (!f.deficit) f.deficit = "ok";
  if (!f.bottlenecks) f.bottlenecks = {};
  if (!Array.isArray(f.unlockedTechs)) f.unlockedTechs = [];
  if (!Array.isArray(f.unlockedUpgrades)) f.unlockedUpgrades = [];
  if (!f.techTiers || typeof f.techTiers !== "object") {
    f.techTiers = { ...DEFAULT_TECH_TIERS };
  } else {
    for (const cat of Object.keys(DEFAULT_TECH_TIERS)) {
      if (f.techTiers[cat] == null) f.techTiers[cat] = 1;
    }
  }
  if (!Array.isArray(f.unlockedProperties)) f.unlockedProperties = [];
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
 * Returns { stock, applied, clamped } where clamped is true if delta was reduced.
 */
export function adjustStock(ledger, factionId, currencyId, delta, meta = {}) {
  const eco = ensureFactionEco(ledger, factionId);
  const cur = Number(eco.stocks[currencyId] ?? 0);
  const raw = cur + Number(delta || 0);
  const next = Math.max(0, Math.floor(raw));
  const applied = next - Math.floor(cur);
  eco.stocks[currencyId] = next;
  if (applied !== 0 || Number(delta || 0) !== 0) {
    appendLedgerEntry(ledger, {
      factionId,
      currencyId,
      delta: applied,
      turn: meta.turn ?? null,
      reason: meta.reason ?? "adjust",
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
  const recent = ledger.entries
    .filter((e) => e.factionId === factionId)
    .slice(-40)
    .reverse();
  return {
    ...eco,
    recent,
    currencies: content.currencies,
    taxDefs: content.taxes,
    economy_schema: content.economy_schema,
    rules: {
      apPerTurn: content.rules?.apPerTurn,
      deficit: content.rules?.deficit,
      tax: content.rules?.tax,
      population: content.rules?.population,
    },
  };
}

const CURRENCY_LABELS = {
  "currency.metal": "Металл",
  "currency.supply": "Обеспечение",
  "currency.extracta": "Extracta",
  "currency.materia": "Materia",
  "currency.industria": "Industria",
  "currency.energia": "Energia",
  "currency.bios": "Bios",
  "currency.cognitio": "Cognitio",
};

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
    const n = Math.round(flat * 100) / 100;
    parts.push(n > 0 ? `+${n}` : String(n));
  }
  if (mult && mult !== 1) {
    parts.push(`×${Math.round(mult * 1000) / 1000}`);
  }
  return parts.join(" ") || null;
}

function formatEffectSnippet(effect, args = {}) {
  if (effect === "production_mult" && args.mult != null) {
    return `добыча ×${args.mult}`;
  }
  if (effect === "production_flat" && args.amount != null) {
    return `добыча +${args.amount}`;
  }
  if (effect === "upkeep_mult" && args.mult != null) {
    return `содержание ×${args.mult}`;
  }
  if (effect === "upkeep_flat" && args.amount != null) {
    return `содержание +${args.amount}`;
  }
  if (effect === "stat_mult" && args.stat != null && args.mult != null) {
    return `${args.stat} ×${args.mult}`;
  }
  if (effect === "pop_growth_mult" && args.mult != null) {
    return `рост ×${args.mult}`;
  }
  if (effect === "tax_pressure" && args.amount != null) {
    return `давление +${args.amount}`;
  }
  if (effect === "ap_add" && args.amount != null) {
    return `AP ${args.amount > 0 ? "+" : ""}${args.amount}`;
  }
  if (effect === "habitability_mult" && args.mult != null) {
    return `обитаемость ×${args.mult}`;
  }
  if (effect === "loyalty_add" && args.amount != null) {
    return `лояльность ${args.amount > 0 ? "+" : ""}${args.amount}`;
  }
  if (effect === "loyalty_mult" && args.mult != null) {
    return `лояльность ×${args.mult}`;
  }
  if (effect === "logistics_range_add" && (args.hops != null || args.amount != null)) {
    const h = args.hops ?? args.amount;
    return `логистика +${h} хоп`;
  }
  if (effect === "research_cost_mult" && args.mult != null) {
    return `наука ×${args.mult}`;
  }
  if (effect === "diplomacy_trust_decay_mult" && args.mult != null) {
    return `доверие ×${args.mult}`;
  }
  if (effect === "move_cost_mult" && args.mult != null) {
    return `ход ×${args.mult}`;
  }
  if (effect === "cost_mult" && args.mult != null) {
    return `стоимость ×${args.mult}`;
  }
  if (effect === "forbid_intent" && args.intentId) {
    return `запрет ${args.intentId}`;
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
        label = currency ? `${channel.split(":")[0]} · ${currency}` : channel;
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
      modifier: deficit === "empty" ? "штрафы" : "−1 AP",
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
  };
  if (eco.bottlenecks != null) out.bottlenecks = eco.bottlenecks;
  if (eco.explain != null) out.explain = eco.explain;
  return out;
}
