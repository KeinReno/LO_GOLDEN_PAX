/**
 * Tech grading 1→5. Port of Golden_PAX_v0_5/server/domain/tech/techGrade.mjs
 * (Tech Tree 2.0 P0). Nested `.efficiency`/`.austerity`/`.feature` upgrades
 * are not consumed here — magnitude comes from `gradeTable` (or defaults).
 *
 * `factionTechGrade`: 0 if not in unlockedTechs; 1 if unlocked but ungraded.
 */

export const MAX_TECH_GRADE = 5;

/** First-pass defaults (index = grade-1). Content `gradeTable.magnitude` wins. */
export const DEFAULT_GRADE_MAGNITUDE = [1, 1.15, 1.3, 1.5, 1.75];

/** First-pass costs for steps 1→2 … 4→5. Index 0 unused. */
export const DEFAULT_UPGRADE_COST = [
  null,
  { "currency.cognitio": 20 },
  { "currency.cognitio": 40 },
  { "currency.cognitio": 70 },
  { "currency.cognitio": 110 },
];

function resolveDef(content, techId) {
  if (!techId) return null;
  return content?.technologies?.[techId] || content?.tech_combos?.[techId] || null;
}

export function isGradeable(def) {
  if (!def) return false;
  if (def.gradeable === true) return true;
  const table = def.gradeTable;
  if (Array.isArray(table) && table.length > 0) return true;
  if (table && typeof table === "object" && Array.isArray(table.magnitude) && table.magnitude.length > 0) {
    return true;
  }
  return false;
}

function clampGrade(grade) {
  const n = Math.floor(Number(grade) || 1);
  return Math.max(1, Math.min(MAX_TECH_GRADE, n));
}

export function factionTechGrade(eco, techId) {
  if (!(eco?.unlockedTechs || []).includes(techId)) return 0;
  const stored = eco?.techGrades?.[techId];
  if (stored == null || stored === "") return 1;
  return clampGrade(stored);
}

function magnitudeTable(def) {
  const table = def?.gradeTable;
  if (Array.isArray(table) && table.length >= MAX_TECH_GRADE) return table;
  if (Array.isArray(table?.magnitude) && table.magnitude.length >= MAX_TECH_GRADE) {
    return table.magnitude;
  }
  return DEFAULT_GRADE_MAGNITUDE;
}

/**
 * Multiplier on effect `args.mult` / `args.amount`.
 * Non-gradeable techs (and missing defs) return 1.
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

export function scaleEffectArgs(args, mag) {
  if (!args || mag === 1) return args;
  const next = { ...args };
  if (next.mult != null) next.mult = Number(next.mult) * mag;
  if (next.amount != null) next.amount = Number(next.amount) * mag;
  return next;
}

function canAffordStocks(stocks, cost) {
  for (const [cur, amt] of Object.entries(cost || {})) {
    const n = Number(amt || 0);
    if (n < 0) return { ok: false, error: "Отрицательная стоимость недопустима" };
    if ((stocks?.[cur] ?? 0) < n) {
      return { ok: false, error: `Не хватает ${cur} (нужно ${n})` };
    }
  }
  return { ok: true };
}

function spendStocks(stocks, cost) {
  const next = { ...stocks };
  for (const [cur, amt] of Object.entries(cost || {})) {
    const n = Number(amt || 0);
    if (!n) continue;
    next[cur] = Math.max(0, Number(next[cur] || 0) - n);
  }
  return next;
}

/**
 * Validate + cost for a grade bump. Does not spend.
 * @returns {{ ok: true, nextGrade: number, cost: object, techGrades: object } | { ok: false, error: string }}
 */
export function prepareGradeUpgrade(eco, techId, content) {
  const def = resolveDef(content, techId);
  if (!def) return { ok: false, error: "unknown tech" };
  if (!(eco?.unlockedTechs || []).includes(techId)) {
    return { ok: false, error: "tech not researched" };
  }
  if (!isGradeable(def)) return { ok: false, error: "tech is not gradeable" };

  const current = factionTechGrade(eco, techId);
  if (current >= MAX_TECH_GRADE) return { ok: false, error: "max tech grade reached" };

  const cost = gradeUpgradeCost(current, def);
  if (!cost) return { ok: false, error: "max tech grade reached" };

  return {
    ok: true,
    nextGrade: current + 1,
    cost,
    techGrades: { ...(eco.techGrades || {}), [techId]: current + 1 },
  };
}

/**
 * Afford-check, spend stocks copy, bump the per-tech grade counter.
 * @returns {{ ok: true, eco, stocks } | { ok: false, error: string }}
 */
export function upgradeTechGrade(eco, techId, stocks, content) {
  const prepared = prepareGradeUpgrade(eco, techId, content);
  if (!prepared.ok) return prepared;
  const afford = canAffordStocks(stocks, prepared.cost);
  if (!afford.ok) return afford;
  return {
    ok: true,
    eco: { ...eco, techGrades: prepared.techGrades },
    stocks: spendStocks(stocks, prepared.cost),
    cost: prepared.cost,
    grade: prepared.nextGrade,
  };
}

/**
 * Non-unlock modifier effects from researched techs.
 * Nested `.efficiency`/`.austerity` upgrades are not consumed.
 */
export function collectTechModifierEffects(eco, content) {
  const effects = [];
  for (const id of eco?.unlockedTechs || []) {
    const def = resolveDef(content, id);
    if (!def) continue;
    const grade = factionTechGrade(eco, id);
    const mag = gradeEffectMagnitude(def, grade);
    for (const e of def.effects || []) {
      if (e.effect === "unlock_tech_tier" || e.effect === "unlock_property") continue;
      effects.push({
        ...e,
        args: scaleEffectArgs(e.args, mag),
        source: { kind: "tech", id, label: def.name },
      });
    }
  }
  return effects;
}
