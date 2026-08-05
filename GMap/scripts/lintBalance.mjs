/**
 * lint:balance — race traits + faction traits (+ techs) balanceBudget in [-2, +2],
 * plus tech era costs and building cost/yield curves from economy_balance.json.
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
const bal = readJson("economy_balance.json") || {};
const factionTraitsFile = readJson("faction_traits.json") || {};
const factionTraits = Object.values(factionTraitsFile.traits || {});
const techs = Object.values(readJson("technologies.json") || {});
const buildings = Object.values(readJson("buildings.json") || {});

const MIN = rules.races?.budgetMin ?? -2;
const MAX = rules.races?.budgetMax ?? 2;
const errors = [];
const warnings = [];

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

// --- Tech era costs vs economy_balance ---
const eraRange = bal.tech?.eraRange || {};
const upRatio = bal.tech?.upgradeRatio || {};
const premiumMax = bal.tech?.premiumMaxMult ?? 1.35;
for (const tech of techs) {
  const era = String(tech.era || 1);
  const range = eraRange[era];
  if (!range) continue;
  const [lo, hi] = range;
  const cost = Number(tech.cost?.["currency.cognitio"] || 0);
  const tags = tech.tags || [];
  const premium =
    tech.raceLock ||
    tech.factionTraitLock ||
    tags.some(
      (t) =>
        t.startsWith("race_") ||
        t.startsWith("faction_") ||
        t.startsWith("trait.") ||
        t === "breakthrough",
    );
  const maxOk = Math.round(hi * (premium ? premiumMax : 1));
  if (cost < lo || cost > maxOk) {
    errors.push(
      `tech ${tech.id}: cognitio ${cost} outside era ${era} [${lo},${maxOk}]`,
    );
  }
  if ((tech.isBreakthrough || Number(era) === 5) && (tech.upgrades || []).length) {
    errors.push(`tech ${tech.id}: breakthrough/era5 must not have upgrades`);
  }
  for (const u of tech.upgrades || []) {
    const id = u.id || "";
    let kind = "efficiency";
    if (id.includes(".austerity")) kind = "austerity";
    else if (id.includes(".feature")) kind = "feature";
    const ratio = upRatio[kind] ?? 0.5;
    const want = Math.max(1, Math.round(cost * ratio));
    const uc = Number(u.cost?.["currency.cognitio"] || 0);
    if (Math.abs(uc - want) > 1) {
      warnings.push(
        `tech ${tech.id} upgrade ${u.id}: cost ${uc} ≈ want ${want} (${kind})`,
      );
    }
  }
}

// --- Building cost curve + yield sanity ---
const metalByTier = bal.buildings?.metalByTier || {};
const yieldByTier = bal.buildings?.yieldFlatByTier || {};
const volumeMult = bal.buildings?.volumeBonusMult || 1.5;
for (const b of buildings) {
  if (b.base && !b.cost) continue; // pure variant
  const tier = Number(b.tier) || 1;
  const metal = Number(b.cost?.["currency.metal"] || 0);
  const target = Number(metalByTier[String(tier)] || 0);
  if (target && metal) {
    const lo = Math.floor(target * 0.75);
    const hi = Math.ceil(target * 1.35);
    if (metal < lo || metal > hi) {
      warnings.push(
        `building ${b.id}: metal ${metal} outside tier${tier} band [${lo},${hi}]`,
      );
    }
  }
  for (const e of b.effects || []) {
    if (e.effect !== "yield_flat" && e.effect !== "production_flat") continue;
    const amt = Number(e.args?.amount || 0);
    const baseY = Number(yieldByTier[String(tier)] || 1);
    const maxY = Math.ceil(baseY * volumeMult) + 2;
    if (amt > maxY) {
      errors.push(
        `building ${b.id}: yield ${amt} > max ${maxY} for tier ${tier}`,
      );
    }
  }
  const econFx = (b.effects || []).some((e) =>
    [
      "yield_flat",
      "production_flat",
      "flow_convert",
      "capacity_add",
      "pop_cap_add",
      "cost_mult",
      "unlock_tech_tier",
      "unlock_property",
      "pop_growth_mult",
      "habitability_mult",
      "stability_add",
      "ap_add",
      "stat_mult",
    ].includes(e.effect),
  );
  if (!b.base && (!b.effects || !b.effects.length || !econFx)) {
    warnings.push(`building ${b.id}: no economy-relevant effects`);
  }
}

// --- Colonies ---
const colonies = Object.values(readJson("colonies.json") || {});
const colTargets = bal.colonies?.colonizeMetal || {};
const colSupplyRatio = Number(bal.colonies?.supplyRatio ?? 0.42);
for (const c of colonies) {
  const type = c.colonyType;
  const want = colTargets[type];
  const metal = Number(c.colonizeCost?.["currency.metal"] || 0);
  const supply = Number(c.colonizeCost?.["currency.supply"] || 0);
  if (want != null && Math.abs(metal - want) > 2) {
    warnings.push(`colony ${c.id}: metal ${metal} ≈ want ${want}`);
  }
  if (metal > 0) {
    const wantS = Math.max(1, Math.round(metal * colSupplyRatio));
    if (Math.abs(supply - wantS) > 3) {
      warnings.push(`colony ${c.id}: supply ${supply} ≈ want ${wantS}`);
    }
  }
}

// --- Ships / units must have tier ---
const ships = Object.values(readJson("ships.json") || {});
const units = Object.values(readJson("units.json") || {});
for (const s of ships) {
  if (s.tier == null) errors.push(`ship ${s.id}: missing tier`);
}
for (const u of units) {
  if (u.tier == null) errors.push(`unit ${u.id}: missing tier`);
}

if (warnings.length) {
  console.warn(`[lint:balance] ${warnings.length} warning(s):`);
  for (const w of warnings.slice(0, 25)) console.warn(" -", w);
  if (warnings.length > 25) console.warn(` ... +${warnings.length - 25} more`);
}

if (errors.length) {
  console.error(`[lint:balance] ${errors.length} issue(s):`);
  for (const e of errors.slice(0, 40)) console.error(" -", e);
  if (errors.length > 40) console.error(` ... +${errors.length - 40} more`);
  process.exit(1);
}

console.log(
  `[lint:balance] ok — ${raceList.length} races, ${factionTraits.length} faction traits, ${techs.length} techs, ${buildings.length} buildings, ${ships.length} ships, ${units.length} units, ${colonies.length} colonies`,
);
