/**
 * Server-side RNG for quests / RP dice (A9).
 * Client only animates already-known results.
 */
import { randomInt } from "node:crypto";
import {
  appendMessage,
  ensurePlayerChannels,
  pickHomeEpisode,
  readRpIndex,
} from "./rpStore.mjs";

/**
 * @param {number} sides
 * @returns {number} 1..sides inclusive
 */
export function rollDie(sides) {
  const s = Math.max(1, Math.floor(Number(sides) || 1));
  return randomInt(1, s + 1);
}

/**
 * @param {{ count?: number, sides?: number, label?: string, threshold?: number }} spec
 * @returns {number[]}
 */
export function rollDice(spec) {
  const count = Math.max(1, Math.floor(Number(spec?.count) || 1));
  const sides = Math.max(1, Math.floor(Number(spec?.sides) || 6));
  const rolls = [];
  for (let i = 0; i < count; i++) rolls.push(rollDie(sides));
  return rolls;
}

/**
 * @param {{ threshold?: number }} spec
 * @param {number[]} rolls
 */
export function rollSuccess(spec, rolls) {
  const threshold = Number(spec?.threshold);
  if (!Number.isFinite(threshold)) return null;
  const sum = (rolls || []).reduce((a, b) => a + Number(b || 0), 0);
  return sum >= threshold;
}

/**
 * Yearly quest count: 1d6 → number of events this turn for a faction.
 * Extra args kept for call-site compatibility with the A9 spec.
 * @param {string} [_factionId]
 * @param {object} [_world]
 * @param {object} [_content]
 * @returns {{ count: number, roll: number }}
 */
export function rollRecurringQuests(_factionId, _world, _content) {
  const roll = rollDie(6);
  return { count: roll, roll };
}

/**
 * Multiplier for NPC court task progress (A10).
 * 1d6: 1–2 slow, 3–4 normal, 5–6 fast.
 * @param {object} [_world]
 * @param {object} [_npc]
 * @returns {number}
 */
export function npcTaskDiceMultiplier(_world, _npc) {
  return rollNpcTaskProgress(_world, _npc).mult;
}

/**
 * Full NPC task progress roll for journal + tick (A10).
 * @param {object} [_world]
 * @param {object} [_npc]
 * @returns {{ mult: number, roll: number }}
 */
export function rollNpcTaskProgress(_world, _npc) {
  const roll = rollDie(6);
  let mult = 1;
  if (roll <= 2) mult = 0.6;
  else if (roll >= 5) mult = 1.4;
  return { mult, roll };
}

/**
 * Format a human-readable dice line for RP / history.
 * @param {{ label?: string, count?: number, sides?: number, threshold?: number }} spec
 * @param {number[]} rolls
 * @param {boolean | null} [success]
 * @param {string} [actorName]
 */
export function formatDiceMessage(spec, rolls, success = null, actorName = null) {
  const count = Math.max(1, Math.floor(Number(spec?.count) || rolls?.length || 1));
  const sides = Math.max(1, Math.floor(Number(spec?.sides) || 6));
  const label = spec?.label || `${count}d${sides}`;
  const sum = (rolls || []).reduce((a, b) => a + Number(b || 0), 0);
  const rollText =
    rolls.length === 1 ? String(rolls[0]) : `${rolls.join("+")}=${sum}`;
  const who = actorName ? `${actorName} бросил` : "Бросок";
  let body = `${who} ${label}: ${rollText}`;
  if (success === true) body += " (успех)";
  else if (success === false) body += " (провал)";
  return body;
}

/**
 * Write a system dice line into the faction HQ RP channel (best-effort).
 * @param {string} factionId
 * @param {string} body
 * @param {{ authorName?: string, campaignId?: string }} [opts]
 */
export function logDiceToRp(factionId, body, opts = {}) {
  try {
    const campaignId = opts.campaignId;
    let index = readRpIndex(campaignId);
    index = ensurePlayerChannels(index, [{ id: factionId }], campaignId);
    const home = pickHomeEpisode(index, factionId);
    if (!home) return { ok: false, error: "no_hq_episode" };
    return appendMessage(
      home.chapterId,
      home.episode.id,
      {
        type: "system",
        body,
        authorFactionId: factionId,
        authorName: opts.authorName || "Система",
        isMaster: true,
      },
      campaignId,
    );
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}
