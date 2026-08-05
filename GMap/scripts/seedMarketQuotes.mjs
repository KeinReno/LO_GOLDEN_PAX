/**
 * Seed 10-turn market quotes for all map resources + faction FX currencies.
 * Narrative window: turns 4..13 (Damyl corridor / Karned awakening / Belator solarite).
 *
 * Run: node GMap/scripts/seedMarketQuotes.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MAP = JSON.parse(
  fs.readFileSync(path.join(ROOT, "content/core/map_resources.json"), "utf8"),
);

const TURN_START = 4;
const TURNS = 10; // 4..13
const UC = "fx.universal_credit";

/** Tier → base UC quote (commodity mass → exotic). */
const TIER_BASE = {
  1: 0.35,
  2: 0.7,
  3: 1.4,
  4: 2.8,
  5: 5.5,
  6: 11,
  7: 22,
  8: 42,
  9: 80,
  10: 160,
};

/**
 * Lore trajectories (multipliers per turn index 0..9).
 * Events: t4–6 Damyl fog push; t7–9 blumatid/glasssteel demand; t10–11 war prep energy;
 * t12–13 relic curiosity + food stabilize.
 */
const LORE = {
  "map.blumatid": [1, 1.04, 1.1, 1.22, 1.35, 1.48, 1.42, 1.38, 1.4, 1.45],
  "map.glasssteel": [1, 1.02, 1.08, 1.18, 1.28, 1.32, 1.3, 1.26, 1.24, 1.27],
  "map.solari": [1, 1.01, 1.03, 1.05, 1.08, 1.1, 1.12, 1.11, 1.13, 1.15],
  "map.anomaly_crystals": [1, 1.06, 1.15, 1.3, 1.45, 1.55, 1.5, 1.48, 1.52, 1.58],
  "map.antimatter": [1, 0.98, 1.0, 1.05, 1.12, 1.25, 1.4, 1.55, 1.5, 1.48],
  "map.energy": [1, 1.02, 1.04, 1.08, 1.15, 1.28, 1.35, 1.32, 1.3, 1.33],
  "map.titan": [1, 1.01, 1.03, 1.06, 1.1, 1.18, 1.22, 1.2, 1.19, 1.21],
  "map.iron": [1, 0.99, 0.98, 0.97, 0.96, 0.95, 0.96, 0.97, 0.98, 0.97],
  "map.food": [1, 1.03, 1.08, 1.12, 1.1, 1.06, 1.04, 1.05, 1.07, 1.06],
  "map.relics": [1, 1.02, 1.05, 1.1, 1.18, 1.28, 1.35, 1.42, 1.48, 1.55],
  "map.rare_crystals": [1, 1.03, 1.08, 1.16, 1.25, 1.3, 1.28, 1.27, 1.29, 1.32],
  "map.helium3": [1, 1.01, 1.04, 1.08, 1.14, 1.22, 1.28, 1.26, 1.25, 1.27],
  "map.adamantian": [1, 1.02, 1.05, 1.1, 1.16, 1.2, 1.22, 1.21, 1.23, 1.25],
  "map.dream_mist": [1, 1.04, 1.1, 1.2, 1.3, 1.4, 1.45, 1.5, 1.55, 1.6],
  "map.water": [1, 1.01, 1.02, 1.04, 1.03, 1.02, 1.02, 1.03, 1.04, 1.03],
  "map.gold": [1, 1.01, 1.02, 1.04, 1.06, 1.08, 1.07, 1.06, 1.07, 1.08],
  "map.platinum": [1, 1.01, 1.03, 1.05, 1.08, 1.1, 1.09, 1.08, 1.09, 1.11],
  "map.hydrogen": [1, 1.0, 0.99, 1.0, 1.02, 1.05, 1.08, 1.06, 1.05, 1.06],
  "map.living_metal": [1, 1.02, 1.06, 1.12, 1.18, 1.25, 1.3, 1.32, 1.35, 1.38],
  "map.dark_matter": [1, 1.03, 1.08, 1.15, 1.22, 1.3, 1.38, 1.45, 1.5, 1.55],
};

const CAT_DRIFT = {
  A: [1, 1.0, 1.01, 1.02, 1.03, 1.04, 1.05, 1.04, 1.04, 1.05],
  B: [1, 1.01, 1.03, 1.06, 1.1, 1.12, 1.11, 1.1, 1.11, 1.12],
  C: [1, 1.01, 1.02, 1.04, 1.07, 1.1, 1.12, 1.11, 1.1, 1.11],
  D: [1, 1.02, 1.04, 1.08, 1.14, 1.22, 1.28, 1.26, 1.24, 1.26],
  E: [1, 1.02, 1.05, 1.08, 1.07, 1.05, 1.04, 1.05, 1.06, 1.05],
  F: [1, 1.03, 1.07, 1.12, 1.2, 1.28, 1.34, 1.4, 1.45, 1.5],
};

function mulSeries(base, mults, id = "") {
  const h = hashString(id);
  return mults.map((m, i) => {
    const micro = 1 + (((h >> ((i * 3) % 16)) & 15) - 7) / 800;
    return Number((base * m * micro).toFixed(4));
  });
}

/** Deterministic 0..1 from resource id. */
function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function idUnit(id) {
  return hashString(id) / 0xffffffff;
}

/**
 * Per-resource trajectory: shared category drift + unique phase/trend/volatility.
 * Resources with same tier+category no longer share identical charts.
 */
function multsForResource(r) {
  const lore = LORE[r.id];
  if (lore) return lore;

  const cat = r.category || "B";
  const baseDrift = CAT_DRIFT[cat] || CAT_DRIFT.B;
  const u = idUnit(r.id);
  const u2 = idUnit(`${r.id}:shape`);
  const phase = u * Math.PI * 2;
  const trend = (u2 - 0.5) * 0.1;
  const vol = 0.012 + u * 0.028;
  const n = baseDrift.length;

  return baseDrift.map((m, i) => {
    const t = i / Math.max(1, n - 1);
    const trendFactor = 1 + trend * t;
    const wave = 1 + Math.sin(phase + t * Math.PI * (1.2 + u * 1.6)) * vol;
    const step = 1 + Math.sin(phase * 0.7 + i * (0.9 + u * 0.4)) * (vol * 0.35);
    return m * trendFactor * wave * step;
  });
}

function seriesForResource(r) {
  const tier = Number(r.tier) || 3;
  const cat = r.category || "B";
  const base = (TIER_BASE[tier] ?? 2) * (cat === "F" ? 1.15 : cat === "D" ? 1.05 : 1);
  return mulSeries(base, multsForResource(r), r.id);
}

/** Faction / reserve currencies quoted in UC. */
/** Canon FX desk only — do not invent new currencies here. */
const FACTION_CURRENCIES = {
  "fx.damyl_doubloon": {
    id: "fx.damyl_doubloon",
    name: "Дамильский Дублон",
    short: "ДД",
    peg: null,
    pegLabel: "неизвестно",
    strength: "reserve_apex",
    blurb:
      "Резерв Дамильских врат. Самая жёсткая валюта известного сектора — котируется редко, почти не дробит.",
    baseUc: 48,
    seriesMult: [1, 1.01, 1.02, 1.04, 1.06, 1.08, 1.09, 1.1, 1.11, 1.12],
    issuerFactionIds: [],
  },
  "fx.terrial_credit": {
    id: "fx.terrial_credit",
    name: "Терриальский Кредит",
    short: "ТК",
    peg: null,
    pegLabel: "неизвестно",
    strength: "reserve_apex",
    blurb:
      "Банковский эталон Терриала. По силе рядом с Дамильским дублоном; ликвиднее на внешних столах.",
    baseUc: 45,
    seriesMult: [1, 1.005, 1.01, 1.02, 1.03, 1.04, 1.045, 1.05, 1.055, 1.06],
    issuerFactionIds: [
      "faction_nomad_pax_terrialis",
      "64928514-afb3-4cdb-b79c-23dd39cdcbd0",
    ],
  },
  "fx.turon_credit": {
    id: "fx.turon_credit",
    name: "Туронский Кредит",
    short: "ТуК",
    peg: "map.glasssteel",
    pegLabel: "стеклосталь",
    strength: "hard_peg",
    blurb: "Жёсткая привязка к стеклостали Туронских верфей. Следит за рынком корпуса.",
    baseUc: 12,
    trackResource: "map.glasssteel",
    pegRatio: 4.2,
    issuerFactionIds: ["faction_turon", "faction_nomad_f_08a06270a3"],
  },
  "fx.elan_doubloon": {
    id: "fx.elan_doubloon",
    name: "Эланский Дублон",
    short: "ЭД",
    peg: null,
    pegLabel: "неизвестно",
    strength: "regional_hard",
    blurb: "Региональный твёрдый дублон Элана. Меньше резервных, но стабилен вне кризисов.",
    baseUc: 22,
    seriesMult: [1, 1.01, 1.015, 1.02, 1.03, 1.035, 1.03, 1.025, 1.03, 1.04],
    issuerFactionIds: ["faction_nomad_f_f3466a10f0"],
  },
  "fx.belator_solarit": {
    id: "fx.belator_solarit",
    name: "Белаторский Соларит",
    short: "БС",
    peg: "map.solari",
    pegLabel: "соларит",
    strength: "commodity_peg",
    blurb: "Привязка к солариту Белатора. Растёт вместе с энерго-топливным спросом.",
    baseUc: 8.5,
    trackResource: "map.solari",
    pegRatio: 1.55,
    issuerFactionIds: [
      "faction_belator",
      "faction_khanate",
      "30af7a77-fcc0-4231-b4f6-5df0c7b1da7d",
    ],
  },
  "fx.karned_trill": {
    id: "fx.karned_trill",
    name: "Карнедский Трилл",
    short: "КТ",
    peg: "map.blumatid",
    pegLabel: "блюматид",
    strength: "commodity_peg",
    blurb:
      "Трилл Карнеда сидит на блюматиде. Скачет вместе с коридорным спросом у Дамильских врат.",
    baseUc: 6.2,
    trackResource: "map.blumatid",
    pegRatio: 2.15,
    issuerFactionIds: ["faction_karned"],
  },
  "fx.aphel_ilir": {
    id: "fx.aphel_ilir",
    name: "Афельский Илир",
    short: "АИ",
    peg: "map.blumatid",
    pegLabel: "блюматид",
    strength: "commodity_peg",
    blurb: "Илир Афеля тоже на блюматиде, чуть слабее трилла — больше эмиссии у стола.",
    baseUc: 5.8,
    trackResource: "map.blumatid",
    pegRatio: 2.0,
    issuerFactionIds: ["faction_amalfea"],
  },
  "fx.universal_credit": {
    id: "fx.universal_credit",
    name: "Универсальный Кредит",
    short: "UC",
    peg: null,
    pegLabel: "неизвестно",
    strength: "numeraire",
    blurb: "Расчётная единица общего рынка. Номинал 1.0 — все котировки в UC.",
    baseUc: 1,
    seriesMult: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    issuerFactionIds: [],
  },
};

const resources = {};
for (const r of Object.values(MAP)) {
  if (!r?.id) continue;
  const series = seriesForResource(r);
  resources[r.id] = {
    id: r.id,
    name: r.name,
    category: r.category ?? null,
    tier: r.tier ?? null,
    quote: UC,
    series,
  };
}

// Category aggregates A–F (basket proxies)
const CAT_CUR = {
  "currency.extracta": { name: "Сырьё (A)", cat: "A", base: 1.0 },
  "currency.materia": { name: "Материалы (B)", cat: "B", base: 1.8 },
  "currency.industria": { name: "Промышленность (C)", cat: "C", base: 2.4 },
  "currency.energia": { name: "Энергия (D)", cat: "D", base: 2.2 },
  "currency.bios": { name: "Биомасса (E)", cat: "E", base: 1.6 },
  "currency.cognitio": { name: "Знание (F)", cat: "F", base: 3.5 },
  "currency.metal": { name: "Металл", cat: "A", base: 1.2 },
  "currency.supply": { name: "Обеспечение", cat: "E", base: 1.1 },
};
for (const [id, meta] of Object.entries(CAT_CUR)) {
  const drift = multsForResource({
    id,
    category: meta.cat,
    tier: 3,
  });
  resources[id] = {
    id,
    name: meta.name,
    category: meta.cat,
    tier: null,
    quote: UC,
    series: mulSeries(meta.base, drift, id),
    kind: "category",
  };
}

const currencies = {};
for (const [id, def] of Object.entries(FACTION_CURRENCIES)) {
  let series;
  if (def.trackResource && resources[def.trackResource]) {
    const resSeries = resources[def.trackResource].series;
    series = resSeries.map((p) =>
      Number((p * (def.pegRatio || 1)).toFixed(4)),
    );
  } else {
    series = mulSeries(def.baseUc, def.seriesMult || Array(TURNS).fill(1), id);
  }
  currencies[id] = {
    id: def.id,
    name: def.name,
    short: def.short,
    peg: def.peg,
    pegLabel: def.pegLabel,
    strength: def.strength,
    blurb: def.blurb,
    issuerFactionIds: Array.isArray(def.issuerFactionIds)
      ? def.issuerFactionIds
      : [],
    quote: UC,
    series,
  };
}

const seed = {
  meta: {
    version: 1,
    turnStart: TURN_START,
    turns: TURNS,
    turnEnd: TURN_START + TURNS - 1,
    quote: UC,
    narrative:
      "Ходы 4–13: разведка Дамильского коридора от Голоколя (Карнед), спрос на блюматид/стеклосталь, топливный накал Белатора, рост реликтового интереса.",
  },
  resources,
  currencies,
};

const contentOut = path.join(ROOT, "content/core/market_quote_seed.json");
fs.writeFileSync(contentOut, JSON.stringify(seed, null, 2));

const factionOut = path.join(ROOT, "content/core/faction_currencies.json");
const factionDict = {};
for (const c of Object.values(currencies)) {
  factionDict[c.id] = {
    id: c.id,
    name: c.name,
    short: c.short,
    peg: c.peg,
    pegLabel: c.pegLabel,
    strength: c.strength,
    blurb: c.blurb,
    issuerFactionIds: c.issuerFactionIds ?? [],
    lastUc: c.series[c.series.length - 1],
  };
}
fs.writeFileSync(factionOut, JSON.stringify(factionDict, null, 2));

// Flatten into market-history ticks for charts
const ticks = [];
for (let i = 0; i < TURNS; i++) {
  const turn = TURN_START + i;
  for (const r of Object.values(resources)) {
    ticks.push({
      turn,
      pair: `${r.id}->${UC}`,
      price: r.series[i],
      volume: Math.max(1, Math.round(40 / (Number(r.tier) || 3))),
      at: `2026-07-${String(20 + i).padStart(2, "0")}T12:00:00.000Z`,
      seeded: true,
    });
  }
  for (const c of Object.values(currencies)) {
    if (c.id === UC) continue;
    ticks.push({
      turn,
      pair: `${c.id}->${UC}`,
      price: c.series[i],
      volume: Math.max(1, Math.round(c.series[i] * 2)),
      at: `2026-07-${String(20 + i).padStart(2, "0")}T12:05:00.000Z`,
      seeded: true,
    });
  }
}

const histPath = path.join(ROOT, "data/market-history.json");
fs.writeFileSync(histPath, JSON.stringify({ ticks }, null, 2));

console.log(
  `Wrote ${Object.keys(resources).length} resource series, ${Object.keys(currencies).length} FX, ${ticks.length} ticks →`,
);
console.log(" ", contentOut);
console.log(" ", factionOut);
console.log(" ", histPath);
