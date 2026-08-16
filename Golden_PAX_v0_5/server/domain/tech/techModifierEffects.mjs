import { resolveTechDef } from "./resolveTechDef.mjs";
import { factionTechGrade, gradeEffectMagnitude } from "./techGrade.mjs";

/**
 * Non-unlock modifier effects from researched techs for
 * `domain/economy/modifierStack.mjs`.
 *
 * Started as a byte-parity port of GMap/server/techActions.mjs's
 * `collectTechModifierEffects` (parent techs + nested unlocked upgrades).
 * Tech Tree 2.0 Priority 0 replaced the upgrade walk with grade scaling:
 * each remaining effect's `args.mult` / `args.amount` is multiplied by
 * `gradeEffectMagnitude(def, currentGrade)`. Non-gradeable techs use
 * magnitude 1, so their Pass 4 behavior is unchanged. Nested `upgrades[]`
 * are no longer consumed.
 *
 * @param {{ unlockedTechs?: string[], techGrades?: Record<string, number> }} techAccount
 * @param {object} content
 */
export function collectTechModifierEffects(techAccount, content) {
  const effects = [];

  for (const id of techAccount?.unlockedTechs || []) {
    const def = resolveTechDef(content, id);
    if (!def) continue;
    const grade = factionTechGrade(techAccount, id);
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

function scaleEffectArgs(args, mag) {
  if (!args || mag === 1) return args;
  const next = { ...args };
  if (next.mult != null) next.mult = Number(next.mult) * mag;
  if (next.amount != null) next.amount = Number(next.amount) * mag;
  return next;
}
