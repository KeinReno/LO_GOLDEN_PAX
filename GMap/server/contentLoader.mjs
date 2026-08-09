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
  "economy_balance",
  "id-aliases",
  "intents",
  "ships",
  "units",
  "map_resources",
  "races",
  "taxes",
  "loyalty_tiers",
  "pois",
  "combat_matchups",
  "combat_stances",
  "combat_property_matchups",
  "consequences",
  "system_presets",
  "buildings",
  "colonies",
  "stations",
  "technologies",
  "tech_combos",
  "tech_recipes",
  "tech_icons",
  "tech_market",
  "space_objects",
  "superpower_market",
  "faction_currencies",
  "faction_currency_bindings",
  "market_quote_seed",
  "faction_traits",
  "diplomacy_stances",
  "yearly_quests",
  "story_quests",
  "hybrid_rules",
  "cultures",
  "faiths",
  "npc_traits",
  "npc_postings",
  "court_tasks",
  "council_seats",
  "internal_blocs",
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
  let economy_balance = {};
  let intents = {};
  let ships = {};
  let units = {};
  let map_resources = {};
  let races = {};
  let taxes = {};
  let loyalty_tiers = {};
  let pois = {};
  let combat_matchups = {};
  let combat_stances = {};
  let combat_property_matchups = {};
  let consequences = {};
  let system_presets = {};
  let buildings = {};
  let colonies = {};
  let stations = {};
  let technologies = {};
  let tech_combos = {};
  let tech_recipes = {};
  let tech_icons = {};
  let tech_market = {};
  let space_objects = {};
  let superpower_market = {};
  let faction_currencies = {};
  let faction_currency_bindings = {};
  let market_quote_seed = {};
  let faction_traits = { meta: {}, traits: {} };
  let diplomacy_stances = {};
  let yearly_quests = {};
  let story_quests = { meta: {}, quests: {} };
  let hybrid_rules = {};
  let cultures = {};
  let faiths = {};
  let npc_traits = { meta: {}, traits: {} };
  let npc_postings = { meta: {}, postings: {} };
  let court_tasks = { meta: {}, tasks: {} };
  let council_seats = { meta: {}, seats: {}, portfolios: {} };
  let internal_blocs = { meta: {}, blocs: {} };
  let id_aliases = { version: 1, ships: {}, resources: {}, units: {}, tech_upgrades: {} };

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
    if (pack.economy_balance && typeof pack.economy_balance === "object") {
      economy_balance = { ...economy_balance, ...pack.economy_balance };
    }
    intents = mergeDicts(intents, pack.intents);
    ships = mergeDicts(ships, pack.ships);
    units = mergeDicts(units, pack.units);
    map_resources = mergeDicts(map_resources, pack.map_resources);
    races = mergeDicts(races, pack.races);
    taxes = mergeDicts(taxes, pack.taxes);
    if (pack.loyalty_tiers && typeof pack.loyalty_tiers === "object") {
      loyalty_tiers = {
        ...loyalty_tiers,
        ...pack.loyalty_tiers,
        loyalty_tiers:
          pack.loyalty_tiers.loyalty_tiers || loyalty_tiers.loyalty_tiers,
      };
    }
    pois = mergeDicts(pois, pack.pois);
    combat_matchups = mergeDicts(combat_matchups, pack.combat_matchups);
    combat_stances = mergeDicts(combat_stances, pack.combat_stances);
    combat_property_matchups = mergeDicts(combat_property_matchups, pack.combat_property_matchups);
    consequences = mergeDicts(consequences, pack.consequences);
    system_presets = mergeDicts(system_presets, pack.system_presets);
    buildings = mergeDicts(buildings, pack.buildings);
    colonies = mergeDicts(colonies, pack.colonies);
    stations = mergeDicts(stations, pack.stations);
    technologies = mergeDicts(technologies, pack.technologies);
    tech_combos = mergeDicts(tech_combos, pack.tech_combos);
    tech_recipes = mergeDicts(tech_recipes, pack.tech_recipes);
    tech_icons = mergeDicts(tech_icons, pack.tech_icons);
    tech_market = mergeDicts(tech_market, pack.tech_market);
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
    if (pack.faction_currency_bindings) {
      faction_currency_bindings = {
        ...faction_currency_bindings,
        ...pack.faction_currency_bindings,
        bindings: {
          ...(faction_currency_bindings.bindings || {}),
          ...(pack.faction_currency_bindings.bindings || {}),
        },
        seedStocks: {
          ...(faction_currency_bindings.seedStocks || {}),
          ...(pack.faction_currency_bindings.seedStocks || {}),
        },
      };
    }
    if (pack.faction_traits?.traits) {
      faction_traits = {
        meta: pack.faction_traits.meta || faction_traits.meta,
        traits: {
          ...(faction_traits.traits || {}),
          ...pack.faction_traits.traits,
        },
      };
    } else if (pack.faction_traits && typeof pack.faction_traits === "object") {
      // Flat dict fallback (legacy)
      const flat = { ...pack.faction_traits };
      delete flat.meta;
      delete flat.traits;
      if (Object.keys(flat).length) {
        faction_traits = {
          meta: pack.faction_traits.meta || faction_traits.meta,
          traits: { ...(faction_traits.traits || {}), ...flat },
        };
      }
    }
    diplomacy_stances = mergeDicts(diplomacy_stances, pack.diplomacy_stances);
    yearly_quests = mergeDicts(yearly_quests, pack.yearly_quests);
    if (pack.hybrid_rules && typeof pack.hybrid_rules === "object") {
      hybrid_rules = { ...hybrid_rules, ...pack.hybrid_rules };
    }
    if (pack.cultures && typeof pack.cultures === "object") {
      cultures = {
        ...cultures,
        ...pack.cultures,
        cultures: {
          ...(cultures.cultures || {}),
          ...(pack.cultures.cultures || {}),
        },
      };
    }
    if (pack.faiths && typeof pack.faiths === "object") {
      faiths = {
        ...faiths,
        ...pack.faiths,
        faiths: {
          ...(faiths.faiths || {}),
          ...(pack.faiths.faiths || {}),
        },
      };
    }
    if (pack.npc_traits?.traits) {
      npc_traits = {
        meta: pack.npc_traits.meta || npc_traits.meta,
        traits: {
          ...(npc_traits.traits || {}),
          ...pack.npc_traits.traits,
        },
      };
    }
    if (pack.npc_postings?.postings) {
      npc_postings = {
        meta: pack.npc_postings.meta || npc_postings.meta,
        postings: {
          ...(npc_postings.postings || {}),
          ...pack.npc_postings.postings,
        },
      };
    }
    if (pack.court_tasks?.tasks) {
      court_tasks = {
        meta: pack.court_tasks.meta || court_tasks.meta,
        tasks: {
          ...(court_tasks.tasks || {}),
          ...pack.court_tasks.tasks,
        },
      };
    }
    if (pack.council_seats?.seats || pack.council_seats?.portfolios) {
      council_seats = {
        meta: pack.council_seats.meta || council_seats.meta,
        seats: {
          ...(council_seats.seats || {}),
          ...(pack.council_seats.seats || {}),
        },
        portfolios: {
          ...(council_seats.portfolios || {}),
          ...(pack.council_seats.portfolios || {}),
        },
      };
    }
    if (pack.story_quests?.quests) {
      story_quests = {
        meta: pack.story_quests.meta || story_quests.meta,
        quests: {
          ...(story_quests.quests || {}),
          ...pack.story_quests.quests,
        },
      };
    }
    if (pack.internal_blocs?.blocs) {
      internal_blocs = {
        meta: pack.internal_blocs.meta || internal_blocs.meta,
        blocs: {
          ...(internal_blocs.blocs || {}),
          ...pack.internal_blocs.blocs,
        },
      };
    }
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
        tech_upgrades: {
          ...(id_aliases.tech_upgrades || {}),
          ...(pack.id_aliases.tech_upgrades || {}),
        },
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
    economy_balance,
    intents,
    ships,
    units,
    map_resources,
    races,
    taxes,
    loyalty_tiers,
    pois,
    combat_matchups,
    combat_stances,
    combat_property_matchups,
    consequences,
    system_presets,
    buildings,
    colonies,
    stations,
    technologies,
    tech_combos,
    tech_recipes,
    tech_icons,
    tech_market,
    space_objects,
    superpower_market,
    faction_currencies,
    faction_currency_bindings,
    market_quote_seed,
    faction_traits,
    diplomacy_stances,
    yearly_quests,
    story_quests,
    hybrid_rules,
    cultures,
    faiths,
    npc_traits,
    npc_postings,
    court_tasks,
    council_seats,
    internal_blocs,
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
      forceAp: c.rules.forceAp,
      apBanking: c.rules.apBanking,
      tickTimezone: c.rules.tickTimezone,
      deficit: c.rules.deficit,
      tax: c.rules.tax,
      population: c.rules.population,
      combat: c.rules.combat,
      cardBattle: c.rules.cardBattle,
      fog: c.rules.fog,
      races: c.rules.races,
      variants: c.rules.variants,
      alchemy: c.rules.alchemy,
      intel: c.rules.intel,
    },
    combat_matchups: c.combat_matchups,
    currencies: c.currencies,
    economy_schema: c.economy_schema,
    economy_balance: c.economy_balance,
    intents: c.intents,
    ships: c.ships,
    units: c.units,
    map_resources: c.map_resources,
    races: c.races,
    taxes: c.taxes,
    loyalty_tiers: c.loyalty_tiers,
    pois: c.pois,
    consequences: c.consequences,
    system_presets: c.system_presets,
    buildings: c.buildings,
    colonies: c.colonies,
    stations: c.stations,
    technologies: c.technologies,
    tech_combos: c.tech_combos,
    tech_recipes: c.tech_recipes,
    tech_icons: c.tech_icons,
    tech_market: c.tech_market,
    space_objects: c.space_objects,
    combat_stances: c.combat_stances,
    combat_property_matchups: c.combat_property_matchups,
    faction_currencies: c.faction_currencies,
    faction_currency_bindings: c.faction_currency_bindings,
    market_quote_seed: c.market_quote_seed,
    id_aliases: c.id_aliases,
    faction_traits: c.faction_traits,
    diplomacy_stances: c.diplomacy_stances,
    yearly_quests: c.yearly_quests,
    story_quests: c.story_quests,
    hybrid_rules: c.hybrid_rules,
    cultures: c.cultures,
    faiths: c.faiths,
    npc_traits: c.npc_traits,
    npc_postings: c.npc_postings,
    court_tasks: c.court_tasks,
    council_seats: c.council_seats,
    internal_blocs: c.internal_blocs,
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
