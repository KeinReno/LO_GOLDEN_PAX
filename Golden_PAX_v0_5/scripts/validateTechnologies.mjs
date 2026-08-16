/**
 * Validate content/core/technologies.json against tech_schema + graph rules.
 * Usage: node scripts/validateTechnologies.mjs
 * Exit 1 on errors; warnings print but do not fail (unless --strict).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const strict = process.argv.includes("--strict");

let ERA_COST = {
  1: [12, 16],
  2: [24, 32],
  3: [42, 58],
  4: [144, 180],
  5: [180, 220],
};
let PREMIUM_MAX = 1.35;
try {
  const bal = JSON.parse(
    readFileSync(join(root, "content/core/economy_balance.json"), "utf8"),
  );
  if (bal?.tech?.eraRange) {
    ERA_COST = Object.fromEntries(
      Object.entries(bal.tech.eraRange).map(([k, v]) => [Number(k), v]),
    );
  }
  if (bal?.tech?.premiumMaxMult) PREMIUM_MAX = bal.tech.premiumMaxMult;
} catch {
  /* keep defaults */
}

const KNOWN_EFFECTS = new Set([
  "unlock_tech_tier",
  "unlock_property",
  "open_path",
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

const ICON_TAGS = new Set([
  "extraction",
  "metallurgy",
  "industry",
  "energy",
  "biology",
  "psionics",
  "megastructure",
  "trade",
  "diplomacy",
]);

function loadJson(rel) {
  return JSON.parse(readFileSync(join(root, rel), "utf8"));
}

const techs = loadJson("content/core/technologies.json");
const schema = loadJson("content/core/tech_schema.json");
const icons = loadJson("content/core/tech_icons.json");

const errors = [];
const warnings = [];

function err(msg) {
  errors.push(msg);
}
function warn(msg) {
  warnings.push(msg);
}

const byId = new Map();
for (const [key, def] of Object.entries(techs)) {
  if (key !== def.id) err(`${key}: key !== id (${def.id})`);
  if (byId.has(def.id)) err(`duplicate id ${def.id}`);
  byId.set(def.id, def);
}

for (const def of byId.values()) {
  if (!/^tech\.[a-z0-9_.]+$/.test(def.id)) err(`${def.id}: bad id pattern`);
  if (!def.name) err(`${def.id}: missing name`);
  if (!["A", "B", "C", "D", "E", "F"].includes(def.category)) {
    err(`${def.id}: bad category ${def.category}`);
  }
  if (!Number.isInteger(def.era) || def.era < 1 || def.era > 5) {
    err(`${def.id}: bad era ${def.era}`);
  }
  const cogn = Number(def.cost?.["currency.cognitio"]);
  if (!Number.isFinite(cogn) || cogn < 1) {
    err(`${def.id}: missing currency.cognitio cost`);
  } else {
    const range = ERA_COST[def.era];
    if (range) {
      const tags = def.tags || [];
      const premium =
        def.raceLock ||
        def.factionTraitLock ||
        tags.some(
          (t) =>
            String(t).startsWith("race_") ||
            String(t).startsWith("faction_") ||
            String(t).startsWith("trait.") ||
            t === "breakthrough",
        );
      const hi = Math.round(range[1] * (premium ? PREMIUM_MAX : 1));
      if (cogn < range[0] || cogn > hi) {
        warn(
          `${def.id}: cost ${cogn} outside era ${def.era} band ${range[0]}–${hi}`,
        );
      }
    }
  }
  if (!Array.isArray(def.effects) || def.effects.length < 1) {
    err(`${def.id}: effects required`);
  }
  for (const e of def.effects || []) {
    if (!e?.effect || !e?.args) err(`${def.id}: effect missing effect/args`);
    else if (!KNOWN_EFFECTS.has(e.effect)) {
      err(`${def.id}: unknown effect ${e.effect}`);
    }
  }
  for (const pre of def.prerequisites || []) {
    if (!byId.has(pre) && !String(pre).includes(".efficiency") && !String(pre).includes(".austerity") && !String(pre).includes(".feature") && !String(pre).includes(".overclock")) {
      // prereq may be upgrade id — check upgrades across techs
      let found = byId.has(pre);
      if (!found) {
        for (const t of byId.values()) {
          if ((t.upgrades || []).some((u) => u.id === pre)) {
            found = true;
            break;
          }
        }
      }
      if (!found) err(`${def.id}: missing prerequisite ${pre}`);
    }
  }
  if (!def.tags || !def.tags.length) {
    warn(`${def.id}: no tags (prefer ["general"] or race/trait tags)`);
  }
  if (def.raceLock && def.tags && !def.tags.some((t) => t === def.raceLock || t === `race_${String(def.raceLock).replace(/^race_/, "")}` || t.startsWith("race_"))) {
    warn(`${def.id}: raceLock without matching race_* tag`);
  }
  if (def.iconTag && !ICON_TAGS.has(def.iconTag)) {
    err(`${def.id}: unknown iconTag ${def.iconTag}`);
  }
  if (def.flavor && String(def.flavor).length > 200) {
    err(`${def.id}: flavor > 200 chars`);
  }
  if (def.isBreakthrough && (def.upgrades || []).length > 0) {
    warn(`${def.id}: breakthrough should not have upgrades`);
  }
  if ((def.upgrades || []).length > 3) {
    err(`${def.id}: more than 3 upgrades`);
  }
  for (const u of def.upgrades || []) {
    if (!u.id || !u.name || !u.cost || !u.effects) {
      err(`${def.id}: incomplete upgrade`);
      continue;
    }
    if (!/\.(efficiency|austerity|feature)$/.test(u.id)) {
      warn(`${u.id}: non-canonical upgrade suffix (prefer efficiency|austerity|feature)`);
    }
    for (const e of u.effects || []) {
      if (!KNOWN_EFFECTS.has(e.effect)) err(`${u.id}: unknown effect ${e.effect}`);
    }
  }
}

// Cycle detection on tech prerequisites (tech ids only)
function hasCycle() {
  const visiting = new Set();
  const done = new Set();
  function dfs(id, stack) {
    if (done.has(id)) return false;
    if (visiting.has(id)) {
      err(`cycle: ${[...stack, id].join(" → ")}`);
      return true;
    }
    visiting.add(id);
    const def = byId.get(id);
    for (const pre of def?.prerequisites || []) {
      if (!byId.has(pre)) continue;
      if (dfs(pre, [...stack, id])) return true;
    }
    visiting.delete(id);
    done.add(id);
    return false;
  }
  for (const id of byId.keys()) {
    if (dfs(id, [])) return true;
  }
  return false;
}
hasCycle();

// Schema file sanity
if (!schema.definitions?.effect) err("tech_schema.json missing definitions.effect");
for (const k of Object.keys(icons)) {
  if (!ICON_TAGS.has(k)) warn(`tech_icons.json: unexpected key ${k}`);
}

console.log(`validateTechnologies: ${byId.size} techs`);
for (const w of warnings) console.log(`  WARN  ${w}`);
for (const e of errors) console.log(`  ERROR ${e}`);

if (errors.length) {
  console.log(`FAIL  ${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(1);
}
if (strict && warnings.length) {
  console.log(`FAIL  --strict with ${warnings.length} warning(s)`);
  process.exit(1);
}
console.log(`PASS  0 errors, ${warnings.length} warning(s)`);
void schema;
