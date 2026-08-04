/**
 * lint:balance — race traits + faction traits (+ techs) balanceBudget in [-2, +2].
 * Uses Race Registry resolveRace for forks/parents.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveRace,
  raceTraitBudget,
  validateRaceBudget,
} from "../server/raceRegistry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE = path.resolve(__dirname, "../content/core");

function readJson(name) {
  const p = path.join(CORE, name);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function traitBudget(t) {
  return Number(t?.balanceBudget) || 0;
}

const races = readJson("races.json") || {};
const rules = readJson("rules.json") || {};
const factionTraitsFile = readJson("faction_traits.json") || {};
const factionTraits = Object.values(factionTraitsFile.traits || {});
const techs = Object.values(readJson("technologies.json") || {});

const MIN = rules.races?.budgetMin ?? -2;
const MAX = rules.races?.budgetMax ?? 2;
const errors = [];

const resolvedRaces = {};
for (const [id, raw] of Object.entries(races)) {
  const resolved = resolveRace(id, races);
  resolvedRaces[id] = resolved;
  for (const e of validateRaceBudget(raw, resolved, rules)) {
    errors.push(e);
  }
  for (const t of raw.traits || []) {
    if (t.balanceBudget == null) {
      errors.push(`race ${id} trait ${t.id}: missing balanceBudget`);
    }
  }
  for (const t of raw.override_traits || []) {
    if (t.balanceBudget == null) {
      errors.push(`race ${id} override ${t.id}: missing balanceBudget`);
    }
  }
}

const raceList = Object.values(resolvedRaces).filter(Boolean);
if (factionTraits.length) {
  for (const race of raceList) {
    const rb = raceTraitBudget(race);
    if (rb < MIN || rb > MAX) {
      errors.push(`combo ${race.id}+[]: ${rb}`);
    }
    for (const a of factionTraits) {
      const s1 = rb + traitBudget(a);
      if (s1 < MIN || s1 > MAX) {
        errors.push(`combo ${race.id}+[${a.id}]: ${s1}`);
      }
      for (const b of factionTraits) {
        if (b.id <= a.id) continue;
        const s2 = s1 + traitBudget(b);
        if (s2 < MIN || s2 > MAX) {
          errors.push(`combo ${race.id}+[${a.id},${b.id}]: ${s2}`);
        }
        for (const c of factionTraits) {
          if (c.id <= b.id) continue;
          const s3 = s2 + traitBudget(c);
          if (s3 < MIN || s3 > MAX) {
            errors.push(`combo ${race.id}+[${a.id},${b.id},${c.id}]: ${s3}`);
          }
        }
      }
    }
  }
}

for (const tech of techs) {
  if (tech.balanceBudget == null) continue;
  const b = traitBudget(tech);
  if (b < MIN || b > MAX) {
    errors.push(`tech ${tech.id}: balanceBudget ${b} outside [${MIN},${MAX}]`);
  }
}

if (errors.length) {
  console.error(`[lint:balance] ${errors.length} issue(s):`);
  for (const e of errors.slice(0, 40)) console.error(" -", e);
  if (errors.length > 40) console.error(` ... +${errors.length - 40} more`);
  process.exit(1);
}

console.log(
  `[lint:balance] ok — ${raceList.length} races (resolved), ${factionTraits.length} faction traits`,
);
