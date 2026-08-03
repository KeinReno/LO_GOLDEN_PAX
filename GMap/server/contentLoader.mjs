/**
 * Load content packs from GMap/content/* (P1).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CONTENT_ROOT = path.resolve(__dirname, "../content");

const FILE_KEYS = [
  "pack",
  "rules",
  "effects",
  "currencies",
  "economy_schema",
  "id-aliases",
  "intents",
  "ships",
  "units",
  "map_resources",
  "races",
  "taxes",
  "pois",
  "combat_matchups",
  "combat_stances",
  "combat_property_matchups",
  "consequences",
  "system_presets",
  "buildings",
  "colonies",
  "technologies",
  "space_objects",
  "superpower_market",
  "faction_currencies",
  "market_quote_seed",
];

let cache = null;

function readJsonSafe(file, fallback = {}) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    console.warn(`[content] failed ${file}:`, e.message);
    return fallback;
  }
}

function loadPack(packId) {
  const dir = path.join(CONTENT_ROOT, packId);
  if (!fs.existsSync(dir)) return null;
  const out = { id: packId };
  for (const key of FILE_KEYS) {
    const file = path.join(dir, `${key}.json`);
    out[key.replace(/-/g, "_")] = readJsonSafe(file, key === "pack" ? null : {});
  }
  if (!out.pack) out.pack = { id: packId, version: 1 };
  return out;
}

function mergeDicts(target, src) {
  if (!src || typeof src !== "object") return target;
  return { ...target, ...src };
}

/**
 * @param {string[]} packIds
 */
export function loadContent(packIds) {
  const fromEnv = (process.env.GMAP_CONTENT_PACKS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ids =
    packIds && packIds.length
      ? packIds
      : fromEnv.length
        ? fromEnv
        : ["core", "golden_pax"];
  // ensure core first
  const ordered = [
    ...new Set(["core", ...ids.filter((id) => id !== "core")]),
  ];
  return loadContentPacks(ordered);
}

function loadContentPacks(packIds = ["core"]) {
  const packs = [];
  let rules = {};
  let effects = { meta: {}, effects: {} };
  let currencies = {};
  let economy_schema = {};
  let intents = {};
  let ships = {};
  let units = {};
  let map_resources = {};
  let races = {};
  let taxes = {};
  let pois = {};
  let combat_matchups = {};
  let combat_stances = {};
  let combat_property_matchups = {};
  let consequences = {};
  let system_presets = {};
  let buildings = {};
  let colonies = {};
  let technologies = {};
  let space_objects = {};
  let superpower_market = {};
  let faction_currencies = {};
  let market_quote_seed = {};
  let id_aliases = { version: 1, ships: {}, resources: {}, units: {} };

  for (const id of packIds) {
    const pack = loadPack(id);
    if (!pack) {
      console.warn(`[content] missing pack: ${id}`);
      continue;
    }
    packs.push(pack.pack);
    rules = { ...rules, ...(pack.rules || {}) };
    if (pack.effects?.effects) {
      effects.effects = { ...effects.effects, ...pack.effects.effects };
      effects.meta = pack.effects.meta || effects.meta;
    }
    currencies = mergeDicts(currencies, pack.currencies);
    economy_schema = mergeDicts(economy_schema, pack.economy_schema);
    intents = mergeDicts(intents, pack.intents);
    ships = mergeDicts(ships, pack.ships);
    units = mergeDicts(units, pack.units);
    map_resources = mergeDicts(map_resources, pack.map_resources);
    races = mergeDicts(races, pack.races);
    taxes = mergeDicts(taxes, pack.taxes);
    pois = mergeDicts(pois, pack.pois);
    combat_matchups = mergeDicts(combat_matchups, pack.combat_matchups);
    combat_stances = mergeDicts(combat_stances, pack.combat_stances);
    combat_property_matchups = mergeDicts(combat_property_matchups, pack.combat_property_matchups);
    consequences = mergeDicts(consequences, pack.consequences);
    system_presets = mergeDicts(system_presets, pack.system_presets);
    buildings = mergeDicts(buildings, pack.buildings);
    colonies = mergeDicts(colonies, pack.colonies);
    technologies = mergeDicts(technologies, pack.technologies);
    space_objects = mergeDicts(space_objects, pack.space_objects);
    if (pack.superpower_market) {
      // Deep-ish merge: keep relationRank, merge superpowers dict.
      superpower_market = {
        ...superpower_market,
        ...pack.superpower_market,
        relationRank: {
          ...(superpower_market.relationRank || {}),
          ...(pack.superpower_market.relationRank || {}),
        },
        superpowers: {
          ...(superpower_market.superpowers || {}),
          ...(pack.superpower_market.superpowers || {}),
        },
      };
    }
    faction_currencies = mergeDicts(
      faction_currencies,
      pack.faction_currencies,
    );
    if (
      pack.market_quote_seed &&
      typeof pack.market_quote_seed === "object" &&
      (pack.market_quote_seed.resources || pack.market_quote_seed.currencies)
    ) {
      market_quote_seed = pack.market_quote_seed;
    }
    if (pack.id_aliases) {
      id_aliases = {
        version: pack.id_aliases.version ?? id_aliases.version,
        ships: { ...id_aliases.ships, ...(pack.id_aliases.ships || {}) },
        resources: {
          ...id_aliases.resources,
          ...(pack.id_aliases.resources || {}),
        },
        units: { ...id_aliases.units, ...(pack.id_aliases.units || {}) },
      };
    }
  }

  cache = {
    packs,
    packIds,
    rules,
    effects,
    currencies,
    economy_schema,
    intents,
    ships,
    units,
    map_resources,
    races,
    taxes,
    pois,
    combat_matchups,
    combat_stances,
    combat_property_matchups,
    consequences,
    system_presets,
    buildings,
    colonies,
    technologies,
    space_objects,
    superpower_market,
    faction_currencies,
    market_quote_seed,
    id_aliases,
    loadedAt: new Date().toISOString(),
  };
  return cache;
}

export function getContent(forceReload = false) {
  if (!cache || forceReload) return loadContent();
  return cache;
}

/** Public subset for clients (no need to hide — data-driven UI). */
export function getPublicContent() {
  const c = getContent();
  return {
    packs: c.packs,
    rules: {
      apPerTurn: c.rules.apPerTurn,
      apBanking: c.rules.apBanking,
      tickTimezone: c.rules.tickTimezone,
      deficit: c.rules.deficit,
      tax: c.rules.tax,
      population: c.rules.population,
      combat: c.rules.combat,
      fog: c.rules.fog,
    },
    currencies: c.currencies,
    economy_schema: c.economy_schema,
    intents: c.intents,
    ships: c.ships,
    units: c.units,
    map_resources: c.map_resources,
    races: c.races,
    taxes: c.taxes,
    pois: c.pois,
    consequences: c.consequences,
    system_presets: c.system_presets,
    buildings: c.buildings,
    colonies: c.colonies,
    technologies: c.technologies,
    space_objects: c.space_objects,
    combat_stances: c.combat_stances,
    combat_property_matchups: c.combat_property_matchups,
    faction_currencies: c.faction_currencies,
    market_quote_seed: c.market_quote_seed,
    effects: Object.keys(c.effects.effects || {}),
    loadedAt: c.loadedAt,
  };
}

/** Labels for UI migration from defaults.ts */
export function getShipTypeLabels() {
  const ships = getContent().ships;
  return Object.values(ships).map((s) => s.name);
}

export function getResourcePoolLabels() {
  const m = getContent().map_resources;
  return Object.values(m).map((r) => r.name);
}

export function getPoiLabels() {
  const pois = getContent().pois;
  const out = { none: "Обычная" };
  for (const [k, v] of Object.entries(pois)) {
    out[k] = v.label || v.name || k;
  }
  return out;
}
