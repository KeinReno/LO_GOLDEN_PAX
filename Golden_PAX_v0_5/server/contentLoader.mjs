/**
 * Load + merge content packs from content/* (core pack first, then any
 * overlay packs such as content/golden_pax — a specific campaign's data
 * layered on top of the universal rules in content/core).
 *
 * Behavior ported 1:1 from GMap/server/contentLoader.mjs — see
 * server/contentLoader.parity.test.mjs, which diffs this against the old
 * loader on the same content. What changed is the *shape* of the code:
 * the old file was ~50 hand-written per-key merge blocks (the definition
 * of the hardcoding this rebuild exists to get away from — see
 * CLAUDE.md). Here every key's merge behavior is one line in MERGE_SPEC;
 * adding a new content key is a one-line addition, not a new block.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CONTENT_ROOT = path.resolve(__dirname, "../content");

// Every content/<pack>/<key>.json file this loader knows about.
const FILE_KEYS = [
  "pack", "rules", "effects", "currencies", "economy_schema", "economy_balance",
  "id-aliases", "intents", "ships", "units", "map_resources", "races", "taxes",
  "loyalty_tiers", "pois", "combat_matchups", "combat_stances",
  "combat_property_matchups", "consequences", "system_presets", "buildings",
  "colonies", "stations", "technologies", "tech_paths", "power_paths",
  "civic_paths", "role_milestones", "tech_combos", "tech_recipes", "tech_icons",
  "tech_market", "space_objects", "superpower_market", "faction_currencies",
  "faction_currency_bindings", "market_quote_seed", "faction_traits",
  "diplomacy_stances", "yearly_quests", "story_quests", "hybrid_rules",
  "cultures", "faiths", "npc_traits", "npc_postings", "court_tasks",
  "council_seats", "internal_blocs",
];

const dictMerge = (a, b) => (a && b ? { ...a, ...b } : a || b || {});

/**
 * How each top-level content key combines across packs. Each entry is a
 * function `(current, incoming) => next`, called once per pack in order
 * (core first) with `current` = merged-so-far, `incoming` = this pack's
 * raw value for that key (may be undefined/null).
 */
const MERGE_SPEC = {
  // Plain shallow-merge dicts: last pack wins per entry-id, nothing lost.
  ...Object.fromEntries(
    [
      "currencies", "economy_schema", "economy_balance", "intents", "ships",
      "units", "map_resources", "races", "taxes", "pois", "combat_matchups",
      "combat_stances", "combat_property_matchups", "consequences",
      "system_presets", "buildings", "colonies", "stations", "technologies",
      "tech_combos", "tech_recipes", "tech_icons", "tech_market",
      "space_objects", "faction_currencies", "diplomacy_stances",
      "yearly_quests", "hybrid_rules", "rules",
    ].map((key) => [key, dictMerge]),
  ),

  // { meta, <subkeys...> } shape: outer shallow-merge, then each named
  // subkey dict-merged on top (so e.g. tech_paths.paths accumulates across
  // packs instead of one pack's paths replacing another's).
  tech_paths: nestedMerge(["meta", "paths"]),
  civic_paths: nestedMerge(["meta", "paths", "thresholds", "scoring", "unlockProperties"]),
  role_milestones: nestedMerge(["meta"]),
  superpower_market: nestedMerge(["relationRank", "superpowers"]),
  faction_currency_bindings: nestedMerge(["bindings", "seedStocks"]),
  cultures: nestedMerge(["cultures"]),
  faiths: nestedMerge(["faiths"]),

  // { meta, <one subkey> } shape: replaces meta+subkey only when the pack
  // actually has content for that subkey — a pack overlay with no entries
  // here must not wipe out what core already defined.
  faction_traits: (current, incoming) => {
    if (incoming?.traits) {
      return { meta: incoming.meta || current.meta, traits: { ...current.traits, ...incoming.traits } };
    }
    if (incoming && typeof incoming === "object") {
      // Legacy flat-dict pack format: every non-meta/traits key is itself a trait entry.
      const flat = { ...incoming };
      delete flat.meta;
      delete flat.traits;
      if (Object.keys(flat).length) {
        return { meta: incoming.meta || current.meta, traits: { ...current.traits, ...flat } };
      }
    }
    return current;
  },
  npc_traits: metaSubkeyMerge("traits"),
  npc_postings: metaSubkeyMerge("postings"),
  court_tasks: metaSubkeyMerge("tasks"),
  story_quests: metaSubkeyMerge("quests"),
  internal_blocs: metaSubkeyMerge("blocs"),
  council_seats: (current, incoming) => {
    if (!incoming?.seats && !incoming?.portfolios) return current;
    return {
      meta: incoming.meta || current.meta,
      seats: { ...current.seats, ...incoming.seats },
      portfolios: { ...current.portfolios, ...incoming.portfolios },
    };
  },

  // Odd one out: the sub-object is *replaced*, not merged, when present.
  loyalty_tiers: (current, incoming) => ({
    ...current,
    ...incoming,
    loyalty_tiers: incoming?.loyalty_tiers || current.loyalty_tiers,
  }),

  // Effects: named-effect dict merges, meta is replaced wholesale.
  effects: (current, incoming) => {
    if (!incoming?.effects) return current;
    return { effects: { ...current.effects, ...incoming.effects }, meta: incoming.meta || current.meta };
  },

  // Full replace, only when the incoming pack actually seeds quotes.
  market_quote_seed: (current, incoming) => {
    if (incoming && typeof incoming === "object" && (incoming.resources || incoming.currencies)) {
      return incoming;
    }
    return current;
  },

  id_aliases: (current, incoming) => {
    if (!incoming) return current;
    return {
      version: incoming.version ?? current.version,
      ships: { ...current.ships, ...incoming.ships },
      resources: { ...current.resources, ...incoming.resources },
      units: { ...current.units, ...incoming.units },
      tech_upgrades: { ...current.tech_upgrades, ...incoming.tech_upgrades },
    };
  },
};

function nestedMerge(subkeys) {
  return (current, incoming) => {
    if (!incoming || typeof incoming !== "object") return current;
    const next = { ...current, ...incoming };
    for (const sk of subkeys) next[sk] = { ...(current[sk] || {}), ...(incoming[sk] || {}) };
    return next;
  };
}

function metaSubkeyMerge(subkey) {
  return (current, incoming) => {
    if (!incoming?.[subkey]) return current;
    return { meta: incoming.meta || current.meta, [subkey]: { ...current[subkey], ...incoming[subkey] } };
  };
}

const INITIAL = {
  rules: {}, effects: { meta: {}, effects: {} }, currencies: {}, economy_schema: {},
  economy_balance: {}, intents: {}, ships: {}, units: {}, map_resources: {}, races: {},
  taxes: {}, loyalty_tiers: {}, pois: {}, combat_matchups: {}, combat_stances: {},
  combat_property_matchups: {}, consequences: {}, system_presets: {}, buildings: {},
  colonies: {}, stations: {}, technologies: {}, tech_paths: { meta: {}, paths: {} },
  civic_paths: { meta: {}, paths: {} }, role_milestones: { meta: {} }, tech_combos: {},
  tech_recipes: {}, tech_icons: {}, tech_market: {}, space_objects: {},
  superpower_market: {}, faction_currencies: {}, faction_currency_bindings: {},
  market_quote_seed: {}, faction_traits: { meta: {}, traits: {} }, diplomacy_stances: {},
  yearly_quests: {}, story_quests: { meta: {}, quests: {} }, hybrid_rules: {},
  cultures: {}, faiths: {}, npc_traits: { meta: {}, traits: {} },
  npc_postings: { meta: {}, postings: {} }, court_tasks: { meta: {}, tasks: {} },
  council_seats: { meta: {}, seats: {}, portfolios: {} }, internal_blocs: { meta: {}, blocs: {} },
  id_aliases: { version: 1, ships: {}, resources: {}, units: {}, tech_upgrades: {} },
};

let cache = null;

function readJsonSafe(file, fallback = {}) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    const msg = `[CONTENT_PARSE_FAIL] ${file}: ${e.message}`;
    console.error(msg);
    throw new Error(msg, { cause: e });
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

/** @param {string[]} [packIds] */
export function loadContent(packIds) {
  const fromEnv = (process.env.GOLDEN_PAX_CONTENT_PACKS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ids = packIds && packIds.length ? packIds : fromEnv.length ? fromEnv : ["core", "golden_pax"];
  const ordered = [...new Set(["core", ...ids.filter((id) => id !== "core")])];

  const merged = structuredClone(INITIAL);
  const packs = [];
  for (const id of ordered) {
    const pack = loadPack(id);
    if (!pack) {
      console.warn(`[content] missing pack: ${id}`);
      continue;
    }
    packs.push(pack.pack);
    for (const key of Object.keys(MERGE_SPEC)) {
      merged[key] = MERGE_SPEC[key](merged[key], pack[key]);
    }
  }

  cache = { packs, packIds: ordered, ...merged, loadedAt: new Date().toISOString() };
  return cache;
}

export function getContent(forceReload = false) {
  if (!cache || forceReload) return loadContent();
  return cache;
}
