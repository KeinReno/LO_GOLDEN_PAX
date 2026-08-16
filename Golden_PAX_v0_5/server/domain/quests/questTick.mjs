import { rollDie } from "../combat/dice.mjs";
import { matchesFilter } from "./filterContext.mjs";

/**
 * Expire quests whose expiresTurn has arrived. Ported from GMap/server/
 * questEngine.mjs's expireQuests — reshaped to take a plain `quests[]`
 * array and return a new one (CLAUDE.md rule 3) instead of mutating
 * `world.quests`. Parity verified in questTick.parity.test.mjs.
 */
export function expireQuests(quests, turn) {
  const journal = [];
  const next = quests.map((q) => {
    if (q.status !== "active" || q.expiresTurn == null || Number(q.expiresTurn) > turn) return q;
    journal.push({ type: "quest_expired", questId: q.id, name: q.name });
    return {
      ...q,
      status: "expired",
      history: [...(q.history || []), { at: new Date().toISOString(), turn, kind: "message", body: "Срок истёк — квест закрыт без решения.", outcome: "expired" }],
    };
  });
  return { quests: next, journal };
}

/** Yearly quest count: 1d6. Ported from GMap/server/dice.mjs's rollRecurringQuests. */
export function rollRecurringQuests() {
  const roll = rollDie(6);
  return { count: roll, roll };
}

/**
 * GMap's rollYearlyQuests refuses to roll twice for the same faction in
 * the same turn (`world.meta.yearlyQuestRolls[factionId] === turn`) —
 * this port has no persistent world to check that against yet, so the
 * caller passes in the faction's own last-known roll turn (same
 * caller-supplied-state pattern as domain/economy's categoryIncome).
 */
export function canRollYearlyQuests(lastRollTurn, turn) {
  return lastRollTurn == null || lastRollTurn !== turn;
}

/**
 * Pick one system to host a quest instance. Ported from the
 * random-selection half of GMap's pickSystemId (the "which of the
 * faction's owned systems" half is caller-supplied here, same as
 * elsewhere — see catalogQuestToInstance's systemId param).
 */
export function pickRandomSystemId(systemIds) {
  if (!systemIds?.length) return null;
  return systemIds[Math.floor(Math.random() * systemIds.length)];
}

/**
 * Which catalog defs get offered this roll: everything matching the
 * faction's filter context, padded with neutral (unfiltered) defs up to
 * `count`, lightly shuffled, then capped at `count`. Ported from the pool
 * -building portion of GMap/server/questEngine.mjs's rollYearlyQuests —
 * that function also picks a system per quest and writes into `world`;
 * this port stops at "which defs," leaving instantiation to
 * quest.mjs's catalogQuestToInstance with a caller-supplied systemId.
 * Behavior-tested (this exact selection logic was inline in GMap, not its
 * own function, and shuffle uses Math.random — not diffable by nature).
 *
 * @param {object[]} defs  Object.values(content.yearly_quests)
 * @param {object} ctx  see filterContext.mjs's matchesFilter
 * @param {number} count
 */
export function selectYearlyQuestPool(defs, ctx, count) {
  const matched = defs.filter((d) => matchesFilter(d.filterBy, ctx));
  const neutrals = defs.filter((d) => d.neutral || !d.filterBy || !Object.keys(d.filterBy).length);

  const pool = [...matched];
  while (pool.length < count) {
    const filler = neutrals[pool.length % Math.max(1, neutrals.length)];
    if (!filler) break;
    pool.push(filler);
    if (pool.length > defs.length + count) break;
  }

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool.slice(0, count);
}
