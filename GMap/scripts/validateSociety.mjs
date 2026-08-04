/**
 * Validate cultures.json, faiths.json, hybrid_rules.json, hybrid races & techs.
 * Usage: node scripts/validateSociety.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function load(rel) {
  return JSON.parse(readFileSync(join(root, rel), "utf8"));
}

const errors = [];
function err(msg) {
  errors.push(msg);
}

const races = load("content/core/races.json");
const techs = load("content/core/technologies.json");
const hybridRules = load("content/core/hybrid_rules.json");
const cultures = load("content/core/cultures.json");
const faiths = load("content/core/faiths.json");

const compat = hybridRules.compatibility || {};
for (const [raceId, partners] of Object.entries(compat)) {
  if (!races[raceId]) err(`hybrid_rules: unknown race ${raceId}`);
  for (const p of partners || []) {
    if (!races[p]) err(`hybrid_rules: ${raceId} → unknown partner ${p}`);
  }
}

for (const [id, def] of Object.entries(races)) {
  if (def.kind !== "hybrid") continue;
  if (!Array.isArray(def.hybridOf) || def.hybridOf.length !== 2) {
    err(`${id}: hybrid must have hybridOf[2]`);
    continue;
  }
  for (const p of def.hybridOf) {
    if (!races[p]) err(`${id}: parent ${p} missing`);
  }
}

for (const def of Object.values(techs)) {
  if (!def.hybridOf && !def.requiresLineage) continue;
  if (def.hybridOf?.length === 2) {
    const [a, b] = def.hybridOf;
    const listA = compat[a] || [];
    const listB = compat[b] || [];
    if (!listA.includes(b) && !listB.includes(a)) {
      err(`${def.id}: hybridOf pair not in compatibility matrix`);
    }
  }
  if (def.requiresLineage && !races[def.requiresLineage]) {
    err(`${def.id}: requiresLineage ${def.requiresLineage} not in races.json`);
  }
}

for (const def of Object.values(cultures.cultures || {})) {
  if (!def.id || !def.name) err(`culture missing id/name`);
}

for (const def of Object.values(faiths.faiths || {})) {
  if (!def.id || !def.name) err(`faith missing id/name`);
}

if (errors.length) {
  console.error("validateSociety FAILED:");
  for (const e of errors) console.error(" -", e);
  process.exit(1);
}
console.log("validateSociety OK");
