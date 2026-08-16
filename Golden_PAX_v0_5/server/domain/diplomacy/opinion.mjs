/**
 * Structural opinion + drift-with-decay tick. Ported from GMap/server/
 * opinionTick.mjs — same formula, reshaped to take a relations lookup
 * (see relations.mjs) and an explicit faction-id list instead of a full
 * `world` object, since there's no world model here yet. Parity verified
 * in opinion.parity.test.mjs for clampOpinion/computeTargetOpinion (both
 * exported and pure in GMap); stepOpinion/tickOpinions are behavior-tested
 * (module-private / reshaped, respectively).
 */
import { getRelation } from "./relations.mjs";

const OPINION_MIN = -100;
const OPINION_MAX = 100;

const ALLY_RELATIONS = new Set(["alliance", "trade", "nap", "research_pact", "migration_treaty"]);
const ENEMY_RELATIONS = new Set(["war", "embargo"]);

export function clampOpinion(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(OPINION_MIN, Math.min(OPINION_MAX, Math.round(x)));
}

function traitIds(faction) {
  const raw = faction?.traits;
  if (!Array.isArray(raw)) return [];
  return raw.map((t) => (typeof t === "string" ? t : t?.id)).filter(Boolean);
}

function diplomacyBiasFor(faction, traitsCatalog) {
  let bias = 0;
  for (const id of traitIds(faction)) {
    const def = traitsCatalog?.[id];
    if (def && typeof def.diplomacyBias === "number") bias += def.diplomacyBias;
  }
  return bias;
}

function trustDecayMult(faction, traitsCatalog) {
  let mult = 1;
  for (const id of traitIds(faction)) {
    const def = traitsCatalog?.[id];
    for (const e of def?.effects || []) {
      if (e.effect === "diplomacy_trust_decay_mult") {
        const m = Number(e.args?.mult ?? 1);
        if (Number.isFinite(m) && m > 0) mult *= m;
      }
    }
  }
  return mult;
}

function xenorelationsDelta(factionA, factionB, racesContent) {
  const raceA = factionA?.primaryRaceId || factionA?.primaryRace || factionA?.dominantRaceId || "race_human";
  const raceB = factionB?.primaryRaceId || factionB?.primaryRace || factionB?.dominantRaceId || "race_human";
  const xr = racesContent?.[raceA]?.xenorelations?.[raceB];
  if (typeof xr !== "number") return 0;
  if (xr < 0) return -10;
  if (xr > 0) return 5;
  return 0;
}

function sharedEnemyBonus(relations, allFactionIds, aId, bId) {
  let bonus = 0;
  for (const otherId of allFactionIds) {
    if (otherId === aId || otherId === bId) continue;
    const ra = getRelation(relations, aId, otherId);
    const rb = getRelation(relations, bId, otherId);
    if (ENEMY_RELATIONS.has(ra) && ENEMY_RELATIONS.has(rb)) bonus += 5;
    if (ALLY_RELATIONS.has(ra) && ALLY_RELATIONS.has(rb)) bonus += 3;
  }
  return bonus;
}

function tradeGiftBonus(faction, otherId) {
  const hist = faction?.diplomacy?.history || [];
  let bonus = 0;
  for (let i = hist.length - 1; i >= 0 && i >= hist.length - 8; i--) {
    const h = hist[i];
    if (h.withFactionId !== otherId) continue;
    if (h.type === "gift" || h.type === "deal" || h.type === "trade") {
      bonus += 2;
      break;
    }
  }
  return bonus;
}

/**
 * Target (structural) opinion of factionA toward factionB.
 * @param {object} factionA @param {object} factionB
 * @param {string[]} allFactionIds  every faction in the campaign (for sharedEnemyBonus)
 * @param {import("./relations.mjs").RelationsTable} relations
 * @param {object} content
 */
export function computeTargetOpinion(factionA, factionB, allFactionIds, relations, content) {
  const races = content?.races || {};
  const traits = content?.faction_traits?.traits || content?.faction_traits || {};
  let opinion = 0;
  opinion += xenorelationsDelta(factionA, factionB, races);
  opinion += diplomacyBiasFor(factionA, traits);
  opinion += sharedEnemyBonus(relations, allFactionIds, factionA.id, factionB.id);
  opinion += tradeGiftBonus(factionA, factionB.id);

  const rel = getRelation(relations, factionA.id, factionB.id);
  if (rel === "war") opinion -= 30;
  else if (rel === "alliance") opinion += 20;
  else if (rel === "trade" || rel === "research_pact") opinion += 10;
  else if (rel === "nap" || rel === "migration_treaty") opinion += 5;
  else if (rel === "embargo") opinion -= 15;
  else if (rel === "vassal") opinion -= 5;

  if (typeof factionA.diplomacy?.lastBrokenTreatyTurn === "number" && factionA.diplomacy.lastBrokenTreatyTurn >= 0) {
    opinion -= 20;
  }

  for (const id of traitIds(factionA)) {
    const def = traits[id];
    for (const e of def?.effects || []) {
      if (e.effect !== "diplomacy_opinion_add") continue;
      const toward = e.args?.towardFactionId;
      if (toward && toward !== "*" && toward !== factionB.id) continue;
      opinion += Number(e.args?.amount ?? 0) || 0;
    }
  }

  return clampOpinion(opinion);
}

/** Move current opinion toward target; apply trust decay toward 0. */
export function stepOpinion(current, target, decayMult) {
  const cur = clampOpinion(current);
  const tgt = clampOpinion(target);
  let next = cur + Math.sign(tgt - cur) * Math.min(3, Math.abs(tgt - cur));
  const decay = Math.max(0.25, 1 * (decayMult || 1));
  if (next > 0) next = Math.max(0, next - decay);
  else if (next < 0) next = Math.min(0, next + decay);
  return clampOpinion(next);
}

/**
 * Recalculate every faction pair's opinion for one turn.
 * @param {object[]} factions  each with { id, traits?, diplomacy: { opinions, history, ... } }
 * @param {import("./relations.mjs").RelationsTable} relations
 * @param {object} content
 * @returns {{ factions: object[], journal: object[] }}
 */
export function tickOpinions(factions, relations, content) {
  const traits = content?.faction_traits?.traits || content?.faction_traits || {};
  const allIds = factions.map((f) => f.id);
  const journal = [];

  const nextFactions = factions.map((a) => {
    const decay = trustDecayMult(a, traits);
    const nextOpinions = { ...a.diplomacy.opinions };
    for (const b of factions) {
      if (a.id === b.id) continue;
      const target = computeTargetOpinion(a, b, allIds, relations, content);
      const prev = nextOpinions[b.id] ?? 0;
      const next = stepOpinion(prev, target, decay);
      nextOpinions[b.id] = next;
      if (next !== prev) {
        journal.push({ type: "opinion_change", fromFactionId: a.id, toFactionId: b.id, from: prev, to: next });
      }
    }
    return { ...a, diplomacy: { ...a.diplomacy, opinions: nextOpinions } };
  });

  return { factions: nextFactions, journal };
}
