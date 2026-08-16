/**
 * Treaty formation, breaking, and the ModifierStack effects active treaties
 * grant. Ported from GMap/server/opinionTick.mjs's syncTreatiesFromEdge/
 * breakTreaty/collectTreatyEffects/bumpOpinion — reshaped to operate on
 * plain faction objects passed in directly (immutable, returns new
 * objects) instead of mutating entries found by searching `world.factions`.
 * Parity verified in treaties.parity.test.mjs for collectTreatyEffects
 * (exported and pure in GMap); the others are behavior-tested (GMap's
 * versions search+mutate world.factions, not directly diffable).
 *
 * Track-aware replacement (`track` on each stance: same-track replaces,
 * different tracks coexist) is NOT in GMap — new design from
 * notes/2026-08-13-currency-peg-grill.md Q6/Q7. Missing `track` is treated
 * as `"political"` so existing callers/tests keep one-relation-per-pair
 * behavior for the original 10 stances.
 */
import { clampOpinion } from "./opinion.mjs";

/** Matches GMap/server/opinionTick.mjs's HISTORY_CAP — history is trimmed, not left to grow unboundedly. */
const HISTORY_CAP = 40;

/** Political vs economic track. Missing `track` = political (the original 10 stances). */
export function stanceTrack(stance) {
  return stance?.track || "political";
}

export function treatyTrack(treaty) {
  return treaty?.track || "political";
}

function pushHistory(history, entry) {
  const next = [...(history || []), { at: new Date().toISOString(), ...entry }];
  return next.length > HISTORY_CAP ? next.slice(-HISTORY_CAP) : next;
}

function stanceEffectsForParty(stance, relation, selfId, { subjectId, overlordId }) {
  const base = Array.isArray(stance.effects) ? stance.effects : [];
  const asymmetric =
    stance.asymmetric === true ||
    relation === "vassal" ||
    Array.isArray(stance.effectsSubject) ||
    Array.isArray(stance.effectsOverlord);

  const filterSide = (effects, role) =>
    (effects || []).filter((e) => {
      if (!e?.effect) return false;
      const side = e.side || e.args?.side;
      if (!side || side === "both") return true;
      if (side === "vassal" || side === "subject") return role === "subject";
      if (side === "overlord") return role === "overlord";
      return true; // "self" and any other unlisted side value applies unconditionally
    });

  if (!asymmetric) return filterSide(base, "both").map((e) => ({ ...e }));
  if (!subjectId && !overlordId) return [];
  if (selfId === subjectId) {
    const subj = Array.isArray(stance.effectsSubject) ? stance.effectsSubject : base;
    return filterSide(subj, "subject").map((e) => ({ ...e }));
  }
  if (selfId === overlordId || (subjectId && selfId !== subjectId)) {
    const over = Array.isArray(stance.effectsOverlord) ? stance.effectsOverlord : [];
    return filterSide(over, "overlord").map((e) => ({ ...e }));
  }
  return [];
}

/**
 * Sync a relation into bilateral treaty records on both factions.
 * @param {object} factionA @param {object} factionB
 * @param {string} relation
 * @param {number} turn
 * @param {object} stances  content.diplomacy_stances
 * @param {{ subjectFactionId?: string, overlordFactionId?: string }} [opts]
 * @returns {{ factionA: object, factionB: object }}
 */
export function syncTreatiesFromEdge(factionA, factionB, relation, turn, stances, opts = {}) {
  const stance = stances?.[relation] || { effects: [], defaultDurationTurns: null };
  let expiresTurn = null;
  if (stance.duration === "turns" && stance.defaultDurationTurns) {
    expiresTurn = turn + Number(stance.defaultDurationTurns);
  }

  const subjectId = opts.subjectFactionId || (relation === "vassal" || stance.asymmetric ? factionB.id : null);
  const overlordId =
    opts.overlordFactionId || (subjectId && subjectId === factionB.id ? factionA.id : subjectId && subjectId === factionA.id ? factionB.id : null);

  const apply = (self, other) => {
    const d = { ...self.diplomacy };
    const newTrack = stanceTrack(stance);
    // Same-track relations replace each other; different tracks coexist
    // (political alliance + economic currency union). Treaties without a
    // track field are treated as political — matches the 10 original stances.
    d.treaties = (d.treaties || []).filter((t) => t.withFactionId !== other.id || treatyTrack(t) !== newTrack);
    if (relation && relation !== "neutral") {
      const effects = stanceEffectsForParty(stance, relation, self.id, { subjectId, overlordId });
      d.treaties = [
        ...d.treaties,
        {
          id: `treaty_${self.id}_${other.id}_${relation}`,
          type: relation,
          withFactionId: other.id,
          startedTurn: turn,
          expiresTurn,
          effects,
          track: newTrack,
          ...(subjectId ? { subjectFactionId: subjectId } : {}),
          ...(overlordId ? { overlordFactionId: overlordId } : {}),
          ...(opts.treatyExtras && typeof opts.treatyExtras === "object" ? opts.treatyExtras : {}),
        },
      ];
    }
    d.history = pushHistory(d.history, { turn, type: "relation", withFactionId: other.id, label: `Отношения: ${relation}` });
    return { ...self, diplomacy: d };
  };

  return { factionA: apply(factionA, factionB), factionB: apply(factionB, factionA) };
}

/**
 * Break the treaty between two factions; casus belli opinion hit to every
 * other faction in the campaign (bigger hit against the victim).
 * @param {object[]} factions
 * @param {string} breakerId @param {string} otherId
 * @param {number} turn
 * @param {object} stances  content.diplomacy_stances
 * @returns {object[]} updated factions
 */
export function breakTreaty(factions, breakerId, otherId, turn, stances) {
  const breaker = factions.find((f) => f.id === breakerId);
  const other = factions.find((f) => f.id === otherId);
  if (!breaker || !other) return factions;

  const removed = (breaker.diplomacy.treaties || []).filter((t) => t.withFactionId === otherId);
  let decay = 20;
  for (const t of removed) {
    const stance = stances?.[t.type];
    if (typeof stance?.trustDecayOnBreak === "number") decay = Math.max(decay, stance.trustDecayOnBreak);
  }

  return factions.map((f) => {
    if (f.id === breakerId) {
      const d = { ...f.diplomacy };
      d.treaties = (d.treaties || []).filter((t) => t.withFactionId !== otherId);
      d.opinions = { ...d.opinions, [otherId]: clampOpinion((d.opinions[otherId] ?? 0) - decay) };
      d.lastBrokenTreatyTurn = turn;
      d.history = pushHistory(d.history, { turn, type: "break", withFactionId: otherId, label: "Договор разорван", opinionDelta: -decay });
      return { ...f, diplomacy: d };
    }
    if (f.id === otherId) {
      const d = { ...f.diplomacy };
      d.treaties = (d.treaties || []).filter((t) => t.withFactionId !== breakerId);
      const hit = decay + 10;
      d.opinions = { ...d.opinions, [breakerId]: clampOpinion((d.opinions[breakerId] ?? 0) - hit) };
      return { ...f, diplomacy: d };
    }
    // Third-party reputation hit.
    const d = { ...f.diplomacy };
    d.opinions = { ...d.opinions, [breakerId]: clampOpinion((d.opinions[breakerId] ?? 0) - 20) };
    return { ...f, diplomacy: d };
  });
}

/** ModifierStack effects granted by a faction's active treaties. */
export function collectTreatyEffects(faction, stancesCatalog) {
  const d = faction?.diplomacy;
  if (!d?.treaties?.length) return [];
  const catalog = stancesCatalog || {};
  const out = [];
  for (const t of d.treaties) {
    let effects;
    if (Array.isArray(t.effects)) {
      effects = t.effects;
    } else {
      const stance = catalog[t.type];
      const asymmetric =
        stance?.asymmetric === true || t.type === "vassal" || Array.isArray(stance?.effectsSubject) || Array.isArray(stance?.effectsOverlord);
      if (asymmetric) {
        const subjectId = t.subjectFactionId || null;
        if (subjectId && faction.id !== subjectId) {
          effects = Array.isArray(stance?.effectsOverlord) ? stance.effectsOverlord : [];
        } else {
          effects = Array.isArray(stance?.effectsSubject) ? stance.effectsSubject : Array.isArray(stance?.effects) ? stance.effects : [];
        }
      } else {
        effects = Array.isArray(stance?.effects) ? stance.effects : [];
      }
    }
    for (const e of effects) {
      if (!e?.effect) continue;
      const source = { kind: "treaty", id: t.id, label: t.type };
      if (e.effect === "treaty_effect") {
        if (e.args?.effect) out.push({ effect: e.args.effect, args: e.args.args || {}, source });
        continue;
      }
      out.push({ ...e, source });
    }
  }
  return out;
}

/** @param {object} faction @returns {object} updated faction */
export function bumpOpinion(faction, towardId, amount, turn, label) {
  const d = { ...faction.diplomacy };
  const prev = d.opinions[towardId] ?? 0;
  d.opinions = { ...d.opinions, [towardId]: clampOpinion(prev + amount) };
  d.history = pushHistory(d.history, { turn: turn ?? 0, type: "gift", withFactionId: towardId, label: label || "Дипломатический жест", opinionDelta: amount });
  return { ...faction, diplomacy: d };
}
