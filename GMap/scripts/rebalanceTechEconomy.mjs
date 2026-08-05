/**
 * Align technologies.json costs/upgrades to economy_balance.json targets.
 * - Era base cognitio + ranges
 * - Upgrade costs ≈ 50%/50%/55% of base
 * - Breakthroughs: no upgrades, clamp to era 5 range
 * - Bare cost_mult → tag: "build"
 * Idempotent.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE = path.resolve(__dirname, "../content/core");
const TECH_PATH = path.join(CORE, "technologies.json");
const BAL_PATH = path.join(CORE, "economy_balance.json");

const bal = JSON.parse(fs.readFileSync(BAL_PATH, "utf8"));
const techs = JSON.parse(fs.readFileSync(TECH_PATH, "utf8"));

const eraBase = bal.tech.eraBaseCognitio;
const eraRange = bal.tech.eraRange;
const upRatio = bal.tech.upgradeRatio;
const premiumMax = bal.tech.premiumMaxMult ?? 1.35;

function isPremium(tech) {
  const tags = tech.tags || [];
  return (
    tech.raceLock ||
    tech.factionTraitLock ||
    tags.some(
      (t) =>
        t.startsWith("race_") ||
        t.startsWith("faction_") ||
        t.startsWith("trait.") ||
        t === "breakthrough",
    )
  );
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function upgradeKind(id = "") {
  if (id.endsWith(".efficiency") || id.includes(".efficiency")) return "efficiency";
  if (id.endsWith(".austerity") || id.includes(".austerity")) return "austerity";
  if (id.endsWith(".feature") || id.includes(".feature")) return "feature";
  return "efficiency";
}

let changed = 0;
const stats = { base: 0, upgrades: 0, strippedUpgrades: 0, costMultTag: 0 };

for (const tech of Object.values(techs)) {
  const era = String(tech.era || 1);
  const [lo, hi] = eraRange[era] || [12, 14];
  const baseTarget = eraBase[era] ?? lo;
  const cur = Number(tech.cost?.["currency.cognitio"] || 0);
  let next = cur;

  // Modal bulk → exact base; outliers clamp into range (premium may stretch)
  const maxAllowed = Math.round(hi * (isPremium(tech) ? premiumMax : 1));
  if (cur === 40 && era === "3") next = 42;
  else if (cur === 120 && era === "4") next = 144;
  else if (cur < lo) next = isPremium(tech) ? lo : baseTarget;
  else if (cur > maxAllowed) next = isPremium(tech) ? Math.min(cur, maxAllowed) : hi;
  else if (!isPremium(tech) && Math.abs(cur - baseTarget) <= 2) next = baseTarget;

  // Era 5 breakthroughs: soft-cap named premiums into range
  if (tech.isBreakthrough || era === "5") {
    next = clamp(next > hi ? hi : next || baseTarget, lo, hi);
    if (Array.isArray(tech.upgrades) && tech.upgrades.length) {
      tech.upgrades = [];
      stats.strippedUpgrades++;
      changed++;
    }
  }

  if (next !== cur) {
    tech.cost = { ...(tech.cost || {}), "currency.cognitio": next };
    stats.base++;
    changed++;
  }

  const baseCost = Number(tech.cost?.["currency.cognitio"] || baseTarget);

  for (const u of tech.upgrades || []) {
    const kind = upgradeKind(u.id);
    const ratio = upRatio[kind] ?? 0.5;
    const want = Math.max(1, Math.round(baseCost * ratio));
    const uc = Number(u.cost?.["currency.cognitio"] || 0);
    if (uc !== want) {
      u.cost = { ...(u.cost || {}), "currency.cognitio": want };
      stats.upgrades++;
      changed++;
    }
  }

  for (const e of tech.effects || []) {
    if (e.effect === "cost_mult" && e.args && !e.args.tag && !e.args.resource) {
      e.args.tag = "build";
      stats.costMultTag++;
      changed++;
    }
  }
  for (const u of tech.upgrades || []) {
    for (const e of u.effects || []) {
      if (e.effect === "cost_mult" && e.args && !e.args.tag && !e.args.resource) {
        e.args.tag = "build";
        stats.costMultTag++;
        changed++;
      }
    }
  }
}

fs.writeFileSync(TECH_PATH, JSON.stringify(techs, null, 2) + "\n", "utf8");
console.log("[rebalanceTechEconomy]", { changed, ...stats, path: TECH_PATH });
