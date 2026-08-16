/**
 * validateRaces — Race Registry hierarchy, forks, balance budget.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveRace,
  validateRaceBudget,
} from "../server/raceRegistry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE = path.resolve(__dirname, "../content/core");

function readJson(name) {
  const p = path.join(CORE, name);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const races = readJson("races.json") || {};
const rules = readJson("rules.json") || {};
const errors = [];

for (const [id, raw] of Object.entries(races)) {
  if (raw.id && raw.id !== id) {
    errors.push(`${id}: key !== id (${raw.id})`);
  }
  const forkBase = raw.base || raw.forked_from;
  if (forkBase && !races[forkBase]) {
    errors.push(`${id}: fork base missing ${forkBase}`);
  }
  if (raw.parent && !races[raw.parent]) {
    errors.push(`${id}: parent missing ${raw.parent}`);
  }
  for (const rid of raw.remove_traits || []) {
    // soft check after resolve
  }
  const resolved = resolveRace(id, races);
  if (!resolved) {
    errors.push(`${id}: failed to resolve`);
    continue;
  }
  for (const e of validateRaceBudget(raw, resolved, rules)) {
    errors.push(e);
  }
  for (const t of resolved.traits || []) {
    if (!t.id) errors.push(`${id}: trait without id`);
    if (t.balanceBudget == null) {
      errors.push(`${id}: trait ${t.id} missing balanceBudget`);
    }
  }
  const ownCount = [
    ...(raw.traits || []),
    ...(raw.override_traits || []),
  ].length;
  const isSub = !!(raw.parent || forkBase);
  const max = isSub
    ? rules.races?.maxTraitsSubrace ?? 4
    : rules.races?.maxTraitsBase ?? 6;
  if (ownCount > max) {
    errors.push(`${id}: own traits ${ownCount} > ${max}`);
  }
}

// Building variant refs
const buildings = readJson("buildings.json") || {};
for (const [id, def] of Object.entries(buildings)) {
  if (def.base && !buildings[def.base]) {
    errors.push(`building ${id}: base missing ${def.base}`);
  }
  for (const vid of def.variants || []) {
    if (!buildings[vid]) {
      errors.push(`building ${id}: variant missing ${vid}`);
    } else if (buildings[vid].base && buildings[vid].base !== id) {
      errors.push(
        `building ${vid}: base ${buildings[vid].base} !== parent ${id}`,
      );
    }
  }
  for (const tag of def.tags || []) {
    if (String(tag).startsWith("race_") && !races[tag]) {
      errors.push(`building ${id}: unknown race tag ${tag}`);
    }
  }
}

if (errors.length) {
  console.error(`[validateRaces] ${errors.length} issue(s):`);
  for (const e of errors.slice(0, 50)) console.error(" -", e);
  if (errors.length > 50) console.error(` ... +${errors.length - 50} more`);
  process.exit(1);
}

console.log(
  `[validateRaces] ok — ${Object.keys(races).length} races, variant refs clean`,
);
