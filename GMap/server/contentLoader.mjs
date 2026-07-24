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
  "id-aliases",
  "intents",
  "ships",
  "units",
  "map_resources",
  "races",
  "taxes",
  "pois",
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
export function loadContent(packIds = ["core"]) {
  const packs = [];
  let rules = {};
  let effects = { meta: {}, effects: {} };
  let currencies = {};
  let intents = {};
  let ships = {};
  let units = {};
  let map_resources = {};
  let races = {};
  let taxes = {};
  let pois = {};
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
    intents = mergeDicts(intents, pack.intents);
    ships = mergeDicts(ships, pack.ships);
    units = mergeDicts(units, pack.units);
    map_resources = mergeDicts(map_resources, pack.map_resources);
    races = mergeDicts(races, pack.races);
    taxes = mergeDicts(taxes, pack.taxes);
    pois = mergeDicts(pois, pack.pois);
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
    intents,
    ships,
    units,
    map_resources,
    races,
    taxes,
    pois,
    id_aliases,
    loadedAt: new Date().toISOString(),
  };
  return cache;
}

export function getContent(forceReload = false) {
  if (!cache || forceReload) return loadContent(["core"]);
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
    intents: c.intents,
    ships: c.ships,
    units: c.units,
    map_resources: c.map_resources,
    races: c.races,
    taxes: c.taxes,
    pois: c.pois,
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
