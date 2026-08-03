/**
 * lint:balance — race traits + faction traits (+ techs) balanceBudget in [-2, +2].
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

function raceBudget(race) {
  return (race.traits || []).reduce((s, t) => s + traitBudget(t), 0);
}

const races = readJson("races.json") || {};
const factionTraitsFile = readJson("faction_traits.json") || {};
const factionTraits = Object.values(factionTraitsFile.traits || {});
const techs = Object.values(readJson("technologies.json") || {});

const MIN = -2;
const MAX = 2;
const errors = [];

for (const race of Object.values(races)) {
  const rb = raceBudget(race);
  if (rb < MIN || rb > MAX) {
    errors.push(`race ${race.id}: traits budget ${rb} outside [${MIN},${MAX}]`);
  }
  for (const t of race.traits || []) {
    if (t.balanceBudget == null) {
      errors.push(`race ${race.id} trait ${t.id}: missing balanceBudget`);
    }
  }
}

// Combinations: race + up to 3 faction traits (empty + singles + pairs sampled)
const raceList = Object.values(races);
if (factionTraits.length) {
  for (const race of raceList) {
    const rb = raceBudget(race);
    // empty
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
  `[lint:balance] ok — ${raceList.length} races, ${factionTraits.length} faction traits`,
);
