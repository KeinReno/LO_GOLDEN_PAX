/**
 * Server-side RNG for combat/quest rolls. Ported verbatim from GMap/
 * server/dice.mjs's core roll functions (already pure) — the RP-channel
 * logging functions (logDiceToRp, rollDiceToRpEpisode) aren't ported here
 * since they belong to domain/narrative (rpStore.mjs), not combat.
 */
import { randomInt } from "node:crypto";

/** @param {number} sides @returns {number} 1..sides inclusive */
export function rollDie(sides) {
  const s = Math.max(1, Math.floor(Number(sides) || 1));
  return randomInt(1, s + 1);
}

/** @param {{ count?: number, sides?: number }} spec @returns {number[]} */
export function rollDice(spec) {
  const count = Math.max(1, Math.floor(Number(spec?.count) || 1));
  const sides = Math.max(1, Math.floor(Number(spec?.sides) || 6));
  const rolls = [];
  for (let i = 0; i < count; i++) rolls.push(rollDie(sides));
  return rolls;
}

/** @param {{ threshold?: number }} spec @param {number[]} rolls */
export function rollSuccess(spec, rolls) {
  const threshold = Number(spec?.threshold);
  if (!Number.isFinite(threshold)) return null;
  const sum = (rolls || []).reduce((a, b) => a + Number(b || 0), 0);
  return sum >= threshold;
}

/** Human-readable dice line for RP/history. */
export function formatDiceMessage(spec, rolls, success = null, actorName = null) {
  const count = Math.max(1, Math.floor(Number(spec?.count) || rolls?.length || 1));
  const sides = Math.max(1, Math.floor(Number(spec?.sides) || 6));
  const label = spec?.label || `${count}d${sides}`;
  const sum = (rolls || []).reduce((a, b) => a + Number(b || 0), 0);
  const rollText = rolls.length === 1 ? String(rolls[0]) : `${rolls.join("+")}=${sum}`;
  const who = actorName ? `${actorName} бросил` : "Бросок";
  let body = `${who} ${label}: ${rollText}`;
  if (success === true) body += " (успех)";
  else if (success === false) body += " (провал)";
  return body;
}

/**
 * Court-task progress dice. Ported verbatim from GMap/server/dice.mjs's
 * `rollNpcTaskProgress` (1-2→0.6x, 3-4→1x, 5-6→1.4x). Optional `rng`
 * is a test seam; production callers omit it and use `rollDie`.
 */
export function rollNpcTaskProgress(_world, _npc, rng = rollDie) {
  const roll = rng(6);
  let mult = 1;
  if (roll <= 2) mult = 0.6;
  else if (roll >= 5) mult = 1.4;
  return { mult, roll };
}
