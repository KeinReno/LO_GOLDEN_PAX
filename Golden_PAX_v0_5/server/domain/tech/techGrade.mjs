import { canAffordCost } from "./afford.mjs";
import { adjustStock } from "../economy/adjustStock.mjs";
import { resolveTechDef } from "./resolveTechDef.mjs";

/**
 * NOT a port — new design (notes/2026-08-14-tech-tree-redesign-grill.md Q2,
 * agent-tasks/TECH_TREE_2_INTEGRATION_SPEC.md Priority 0). GMap's nested
 * `.efficiency`/`.austerity`/`.feature` upgrades were never reachable here
 * (`unlockedUpgrades` persisted empty; resolveTechDef only looks up
 * top-level ids). Catalog `upgrades[]` was stripped after a live-prereq
 * count of zero (GMap still has them; parity drops the key on both sides).
 * Runtime ignores nested upgrades (see techModifierEffects.test.mjs).
 * Grades replace that branch: one 1→5 ladder per gradeable tech, same
 * shape as domain/planets/planetGrade.mjs (counter + real purchase cost
 * per step + magnitude-per-grade table).
 *
 * Not every tech is gradeable — a content flag (`gradeable` / `gradeTable`).
 * A tech with neither has no grade action; its effect magnitude is 1.
 *
 * `factionTechGrade`: 0 if the tech is not in unlockedTechs; 1 if unlocked
 * but ungraded; otherwise the stored counter.
 */

export const MAX_TECH_GRADE = 5;

/** First-pass defaults (index = grade-1). Content `gradeTable.magnitude` wins. */
export const DEFAULT_GRADE_MAGNITUDE = [1, 1.15, 1.3, 1.5, 1.75];

/** First-pass costs for steps 1→2 … 4→5. Index 0 unused. */
const DEFAULT_UPGRADE_COST = [
  null,
  { "currency.cognitio": 20 },
  { "currency.cognitio": 40 },
  { "currency.cognitio": 70 },
  { "currency.cognitio": 110 },
];

export function isGradeable(def) {
  if (!def) return false;
  if (def.gradeable === true) return true;
  const table = def.gradeTable;
  if (Array.isArray(table) && table.length > 0) return true;
  if (table && typeof table === "object" && Array.isArray(table.magnitude) && table.magnitude.length > 0) return true;
  return false;
}

function clampGrade(grade) {
  const n = Math.floor(Number(grade) || 1);
  return Math.max(1, Math.min(MAX_TECH_GRADE, n));
}

export function factionTechGrade(techAccount, techId) {
  if (!(techAccount?.unlockedTechs || []).includes(techId)) return 0;
  const stored = techAccount?.techGrades?.[techId];
  if (stored == null || stored === "") return 1;
  return clampGrade(stored);
}

function magnitudeTable(def) {
  const table = def?.gradeTable;
  if (Array.isArray(table) && table.length >= MAX_TECH_GRADE) return table;
  if (Array.isArray(table?.magnitude) && table.magnitude.length >= MAX_TECH_GRADE) return table.magnitude;
  return DEFAULT_GRADE_MAGNITUDE;
}

/**
 * Multiplier applied to the tech's effect `args.mult` / `args.amount`.
 * Non-gradeable techs (and missing defs) return 1 — Pass 4 income for
 * those techs is unchanged.
 */
export function gradeEffectMagnitude(def, grade) {
  if (!isGradeable(def)) return 1;
  const g = clampGrade(grade);
  const table = magnitudeTable(def);
  const n = Number(table[g - 1]);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function gradeUpgradeCost(currentGrade, def) {
  const g = clampGrade(currentGrade);
  if (g >= MAX_TECH_GRADE) return null;
  const table = def?.gradeTable?.upgradeCost;
  if (Array.isArray(table) && table[g]) return table[g];
  return DEFAULT_UPGRADE_COST[g];
}

function spendCost(factionId, stocks, cost, reason, techId) {
  let nextStocks = stocks;
  const journal = [];
  for (const [currencyId, amount] of Object.entries(cost || {})) {
    const n = Number(amount || 0);
    if (!n) continue;
    const result = adjustStock({ factionId, stocks: nextStocks }, currencyId, -n, { reason, intentId: techId });
    nextStocks = result.stocks;
    if (result.journalEntry) journal.push(result.journalEntry);
  }
  return { stocks: nextStocks, journal };
}

/**
 * Afford-check, spend, bump the per-tech grade counter.
 * @returns {{ ok: true, techAccount, stocks, journal } | { ok: false, error: string }}
 */
export function upgradeTechGrade(techAccount, techId, stocks, content) {
  const def = resolveTechDef(content, techId);
  if (!def) return { ok: false, error: "unknown tech" };
  if (!(techAccount?.unlockedTechs || []).includes(techId)) {
    return { ok: false, error: "tech not researched" };
  }
  if (!isGradeable(def)) return { ok: false, error: "tech is not gradeable" };

  const current = factionTechGrade(techAccount, techId);
  if (current >= MAX_TECH_GRADE) return { ok: false, error: "max tech grade reached" };

  const cost = gradeUpgradeCost(current, def);
  const afford = canAffordCost(stocks, cost);
  if (!afford.ok) return afford;

  const spent = spendCost(techAccount.factionId, stocks, cost, "upgrade_tech_grade", techId);
  const techGrades = { ...(techAccount.techGrades || {}), [techId]: current + 1 };
  return {
    ok: true,
    techAccount: { ...techAccount, techGrades },
    stocks: spent.stocks,
    journal: spent.journal,
  };
}
