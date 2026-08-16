/**
 * Validate tech_recipes.json + tech_combos.json (alchemy stubs).
 * Usage: node scripts/validateTechRecipes.mjs
 * Exit 1 on errors. Missing catalog ingredients → warnings (until migration).
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadJson(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

const recipes = loadJson("content/core/tech_recipes.json") || {};
const combos = loadJson("content/core/tech_combos.json") || {};
const liveTechs = loadJson("content/core/technologies.json") || {};

const RING = ["A", "B", "C", "D", "E", "F"];
const ADJACENT = new Set();
for (let i = 0; i < RING.length; i++) {
  const a = RING[i];
  const b = RING[(i + 1) % RING.length];
  ADJACENT.add(`${a}|${a}`);
  ADJACENT.add(`${a}|${b}`);
  ADJACENT.add(`${b}|${a}`);
}

const KNOWN_EFFECTS = new Set([
  "unlock_tech_tier",
  "unlock_property",
  "production_mult",
  "upkeep_mult",
  "production_flat",
  "research_cost_mult",
  "unit_upgrade",
  "stat_mult",
  "capacity_add",
  "ap_add",
  "cost_mult",
  "pop_growth_mult",
  "move_cost_mult",
  "building_level_mult",
  "logistics_disconnected_penalty",
  "combat_role_mult",
]);

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

function catFromTechId(id) {
  const m = String(id).match(/^tech\.([a-f])_/i);
  if (m) return m[1].toUpperCase();
  const live = liveTechs[id];
  if (live?.category) return live.category;
  const combo = combos[id];
  if (combo?.category) return combo.category;
  return null;
}

function pairOk(a, b) {
  const ca = catFromTechId(a);
  const cb = catFromTechId(b);
  if (!ca || !cb) return { ok: true, unknown: true };
  return { ok: ADJACENT.has(`${ca}|${cb}`), ca, cb };
}

if (!Object.keys(recipes).length) err("tech_recipes.json empty or missing");
if (!Object.keys(combos).length) err("tech_combos.json empty or missing");

const pairSeen = new Map();

for (const [key, def] of Object.entries(combos)) {
  if (key !== def.id) err(`${key}: key !== id`);
  if (!/^tech\.combo_[a-z0-9_]+$/.test(def.id)) err(`${def.id}: bad combo id`);
  if (!def.alchemyOnly && !(def.tags || []).includes("alchemy")) {
    warn(`${def.id}: prefer alchemyOnly or tags includes alchemy`);
  }
  if (!Array.isArray(def.effects) || !def.effects.length) err(`${def.id}: effects required`);
  for (const e of def.effects || []) {
    if (!KNOWN_EFFECTS.has(e.effect)) err(`${def.id}: unknown effect ${e.effect}`);
  }
  if (def.isBreakthrough && (def.upgrades || []).length) {
    err(`${def.id}: breakthrough must not have upgrades`);
  }
}

for (const [key, def] of Object.entries(recipes)) {
  if (key !== def.id) err(`${key}: key !== id`);
  if (!/^recipe\.[a-z0-9_]+$/.test(def.id)) err(`${def.id}: bad recipe id`);
  if (!Array.isArray(def.ingredients) || def.ingredients.length !== 2) {
    err(`${def.id}: ingredients must be length 2`);
    continue;
  }
  const [a, b] = def.ingredients;
  if (a === b) err(`${def.id}: duplicate ingredient`);
  const sorted = [a, b].slice().sort();
  if (a !== sorted[0] || b !== sorted[1]) {
    err(`${def.id}: ingredients must be lexicographically sorted`);
  }
  const pairKey = sorted.join("+");
  if (pairSeen.has(pairKey)) {
    // live_bridge may share result with catalog; same ingredient pair is ok only if different recipe namespaces
    const prev = pairSeen.get(pairKey);
    if (prev === def.id) err(`${def.id}: duplicate recipe`);
  } else {
    pairSeen.set(pairKey, def.id);
  }

  const adj = pairOk(a, b);
  if (!adj.ok) err(`${def.id}: non-adjacent categories ${adj.ca}+${adj.cb}`);

  if (!Array.isArray(def.results) || !def.results.length) {
    err(`${def.id}: results required`);
  }
  for (const rid of def.results || []) {
    if (!combos[rid]) err(`${def.id}: missing result combo ${rid}`);
  }

  for (const ing of def.ingredients) {
    const inLive = Boolean(liveTechs[ing]);
    const inCombos = Boolean(combos[ing]);
    if (!inLive && !inCombos) {
      if (def.catalogPending) warn(`${def.id}: ingredient ${ing} not in live techs (catalog pending)`);
      else err(`${def.id}: ingredient ${ing} missing from technologies.json`);
    }
  }

  if (def.flavor && String(def.flavor).length > 200) err(`${def.id}: flavor > 200`);
  if (def.era >= 5 && def.discoverableBlind) {
    warn(`${def.id}: Era 5 should not be discoverableBlind`);
  }
}

const liveBridge = Object.values(recipes).filter((r) => (r.tags || []).includes("live_bridge"));
console.log(`validateTechRecipes: ${Object.keys(recipes).length} recipes, ${Object.keys(combos).length} combos, ${liveBridge.length} live bridges`);
for (const w of warnings) console.log(`  WARN  ${w}`);
for (const e of errors) console.log(`  ERROR ${e}`);

if (errors.length) {
  console.log(`FAIL  ${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(1);
}
console.log(`PASS  0 errors, ${warnings.length} warning(s)`);
