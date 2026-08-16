/**
 * Diplomacy v2 — opinion tick + treaty helpers (A8).
 */
import { getContent } from "./contentLoader.mjs";

const OPINION_MIN = -100;
const OPINION_MAX = 100;
const HISTORY_CAP = 40;

const ALLY_RELATIONS = new Set(["alliance", "trade", "nap", "research_pact", "migration_treaty"]);
const ENEMY_RELATIONS = new Set(["war", "embargo"]);

export function clampOpinion(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(OPINION_MIN, Math.min(OPINION_MAX, Math.round(x)));
}

export function ensureFactionDiplomacy(faction) {
  if (!faction.diplomacy || typeof faction.diplomacy !== "object") {
    faction.diplomacy = { opinions: {}, treaties: [], history: [] };
  }
  if (!faction.diplomacy.opinions || typeof faction.diplomacy.opinions !== "object") {
    faction.diplomacy.opinions = {};
  }
  if (!Array.isArray(faction.diplomacy.treaties)) {
    faction.diplomacy.treaties = [];
  }
  if (!Array.isArray(faction.diplomacy.history)) {
    faction.diplomacy.history = [];
  }
  return faction.diplomacy;
}

export function pushDiploHistory(faction, entry) {
  const d = ensureFactionDiplomacy(faction);
  d.history.push({
    at: new Date().toISOString(),
    ...entry,
  });
  if (d.history.length > HISTORY_CAP) {
    d.history = d.history.slice(-HISTORY_CAP);
  }
}

export const TRACK_POLITICAL = "political";
export const TRACK_ECONOMIC = "economic";

/** Missing `track` = political (the original 10 stances). */
export function stanceTrack(stance) {
  return stance?.track || TRACK_POLITICAL;
}

export function treatyTrack(treaty) {
  return treaty?.track || TRACK_POLITICAL;
}

export function edgeTrack(edge) {
  return edge?.track || TRACK_POLITICAL;
}

export function isPoliticalDiplomacyEdge(edge) {
  return edgeTrack(edge) === TRACK_POLITICAL;
}

export function findDiplomacyEdge(world, aId, bId, track = TRACK_POLITICAL) {
  if (!aId || !bId || aId === bId) return null;
  const [x, y] = aId < bId ? [aId, bId] : [bId, aId];
  return (
    (world.diplomacy ?? []).find(
      (e) => e.aId === x && e.bId === y && edgeTrack(e) === track,
    ) || null
  );
}

export function getRelation(world, aId, bId) {
  if (!aId || !bId || aId === bId) return "neutral";
  return findDiplomacyEdge(world, aId, bId, TRACK_POLITICAL)?.relation ?? "neutral";
}

function relationOf(world, aId, bId) {
  return getRelation(world, aId, bId);
}

function traitIds(faction) {
  const raw = faction?.traits;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => (typeof t === "string" ? t : t?.id))
    .filter(Boolean);
}

function diplomacyBiasFor(faction, traitsCatalog) {
  let bias = 0;
  for (const id of traitIds(faction)) {
    const def = traitsCatalog?.[id];
    if (def && typeof def.diplomacyBias === "number") {
      bias += def.diplomacyBias;
    }
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
  const raceA =
    factionA?.primaryRaceId ||
    factionA?.primaryRace ||
    factionA?.dominantRaceId ||
    "race_human";
  const raceB =
    factionB?.primaryRaceId ||
    factionB?.primaryRace ||
    factionB?.dominantRaceId ||
    "race_human";
  const xr = racesContent?.[raceA]?.xenorelations?.[raceB];
  if (typeof xr !== "number") return 0;
  if (xr < 0) return -10;
  if (xr > 0) return 5;
  return 0;
}

function sharedEnemyBonus(world, aId, bId) {
  const factions = (world.factions ?? []).filter(
    (f) => f.id !== aId && f.id !== bId,
  );
  let bonus = 0;
  for (const other of factions) {
    const ra = relationOf(world, aId, other.id);
    const rb = relationOf(world, bId, other.id);
    if (ENEMY_RELATIONS.has(ra) && ENEMY_RELATIONS.has(rb)) bonus += 5;
    if (ALLY_RELATIONS.has(ra) && ALLY_RELATIONS.has(rb)) bonus += 3;
  }
  return bonus;
}

function tradeGiftBonus(faction, otherId) {
  // Soft sticky bonus encoded as history markers from recent deals.
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
 * Build target opinion for A toward B from structural factors.
 */
export function computeTargetOpinion(world, factionA, factionB, content) {
  const races = content?.races || {};
  const traits = content?.faction_traits?.traits || content?.faction_traits || {};
  let opinion = 0;
  opinion += xenorelationsDelta(factionA, factionB, races);
  opinion += diplomacyBiasFor(factionA, traits);
  opinion += sharedEnemyBonus(world, factionA.id, factionB.id);
  opinion += tradeGiftBonus(factionA, factionB.id);

  const rel = relationOf(world, factionA.id, factionB.id);
  if (rel === "war") opinion -= 30;
  else if (rel === "alliance") opinion += 20;
  else if (rel === "trade" || rel === "research_pact") opinion += 10;
  else if (rel === "nap" || rel === "migration_treaty") opinion += 5;
  else if (rel === "embargo") opinion -= 15;
  else if (rel === "vassal") opinion -= 5;

  if (
    typeof factionA.diplomacy?.lastBrokenTreatyTurn === "number" &&
    factionA.diplomacy.lastBrokenTreatyTurn >= 0
  ) {
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

/**
 * Move current opinion toward target; apply trust decay toward 0.
 */
function stepOpinion(current, target, decayMult) {
  const cur = clampOpinion(current);
  const tgt = clampOpinion(target);
  // Pull toward structural target
  let next = cur + Math.sign(tgt - cur) * Math.min(3, Math.abs(tgt - cur));
  // Trust decay toward 0
  const decay = Math.max(0.25, 1 * (decayMult || 1));
  if (next > 0) next = Math.max(0, next - decay);
  else if (next < 0) next = Math.min(0, next + decay);
  return clampOpinion(next);
}

/**
 * Recalculate opinions for every faction pair. Mutates world.factions.
 * @returns {{ journal: object[] }}
 */
export function runOpinionTick(world, turn, content = null) {
  const c = content || getContent();
  const traits = c?.faction_traits?.traits || c?.faction_traits || {};
  const factions = world.factions ?? [];
  const journal = [];

  for (const a of factions) {
    ensureFactionDiplomacy(a);
    // Expire treaties
    a.diplomacy.treaties = (a.diplomacy.treaties || []).filter((t) => {
      if (t.expiresTurn == null) return true;
      return t.expiresTurn > turn;
    });
  }

  for (const a of factions) {
    const decay = trustDecayMult(a, traits);
    for (const b of factions) {
      if (a.id === b.id) continue;
      const target = computeTargetOpinion(world, a, b, c);
      const prev = a.diplomacy.opinions[b.id] ?? 0;
      const next = stepOpinion(prev, target, decay);
      a.diplomacy.opinions[b.id] = next;
      if (next !== prev) {
        journal.push({
          type: "opinion_change",
          fromFactionId: a.id,
          toFactionId: b.id,
          from: prev,
          to: next,
          turn,
        });
      }
    }
  }

  return { journal };
}

/**
 * Sync DiplomacyEdge relation into bilateral Treaty objects on both factions.
 * Convention for asymmetric relations (vassal): aId = overlord, bId = subject,
 * unless opts.subjectFactionId / opts.overlordFactionId override.
 * Content may supply effectsSubject / effectsOverlord / asymmetric / effect.side.
 */
export function syncTreatiesFromEdge(world, aId, bId, relation, turn, stances, opts = {}) {
  const catalog = stances || getContent()?.diplomacy_stances || {};
  const stance = catalog[relation] || { effects: [], defaultDurationTurns: null };
  let expiresTurn = null;
  if (stance.duration === "turns" && stance.defaultDurationTurns) {
    expiresTurn = turn + Number(stance.defaultDurationTurns);
  }

  const subjectId =
    opts.subjectFactionId ||
    opts.vassalFactionId ||
    (relation === "vassal" || stance.asymmetric ? bId : null);
  const overlordId =
    opts.overlordFactionId ||
    (subjectId && subjectId === bId
      ? aId
      : subjectId && subjectId === aId
        ? bId
        : null);

  for (const [selfId, otherId] of [
    [aId, bId],
    [bId, aId],
  ]) {
    const fac = (world.factions ?? []).find((f) => f.id === selfId);
    if (!fac) continue;
    const d = ensureFactionDiplomacy(fac);
    const newTrack = opts.track || stanceTrack(stance);
    // Same-track relations replace each other; different tracks coexist
    // (political alliance + economic currency union).
    d.treaties = d.treaties.filter(
      (t) => t.withFactionId !== otherId || treatyTrack(t) !== newTrack,
    );
    if (relation && relation !== "neutral") {
      const effects = stanceEffectsForParty(stance, relation, selfId, {
        subjectId,
        overlordId,
      });
      d.treaties.push({
        id: `treaty_${selfId}_${otherId}_${relation}`,
        type: relation,
        withFactionId: otherId,
        startedTurn: turn,
        expiresTurn,
        effects: effects.map((e) => ({ ...e })),
        track: newTrack,
        ...(subjectId ? { subjectFactionId: subjectId } : {}),
        ...(overlordId ? { overlordFactionId: overlordId } : {}),
        ...(opts.treatyExtras && typeof opts.treatyExtras === "object"
          ? opts.treatyExtras
          : {}),
      });
    }
    pushDiploHistory(fac, {
      turn,
      type: "relation",
      withFactionId: otherId,
      label: `Отношения: ${relation}`,
    });
  }
}

/**
 * Resolve which stance effects apply to one party of a bilateral relation.
 */
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
      if (side === "self") return true;
      return true;
    });

  if (!asymmetric) {
    return filterSide(base, "both").map((e) => ({ ...e }));
  }

  // Without a known subject, skip effects rather than applying bilaterally.
  if (!subjectId && !overlordId) return [];

  if (selfId === subjectId) {
    const subj = Array.isArray(stance.effectsSubject)
      ? stance.effectsSubject
      : base;
    return filterSide(subj, "subject").map((e) => ({ ...e }));
  }
  if (selfId === overlordId || (subjectId && selfId !== subjectId)) {
    const over = Array.isArray(stance.effectsOverlord)
      ? stance.effectsOverlord
      : [];
    return filterSide(over, "overlord").map((e) => ({ ...e }));
  }
  return [];
}

/**
 * Break treaty — apply casus belli opinion hit.
 */
export function breakTreaty(world, breakerId, otherId, turn, stances, opts = {}) {
  const catalog = stances || getContent()?.diplomacy_stances || {};
  const fac = (world.factions ?? []).find((f) => f.id === breakerId);
  const other = (world.factions ?? []).find((f) => f.id === otherId);
  if (!fac || !other) return;

  const track = opts.track || TRACK_POLITICAL;
  const d = ensureFactionDiplomacy(fac);
  const removed = d.treaties.filter(
    (t) => t.withFactionId === otherId && treatyTrack(t) === track,
  );
  d.treaties = d.treaties.filter(
    (t) => t.withFactionId !== otherId || treatyTrack(t) !== track,
  );
  ensureFactionDiplomacy(other).treaties = other.diplomacy.treaties.filter(
    (t) => t.withFactionId !== breakerId || treatyTrack(t) !== track,
  );

  let decay = 20;
  for (const t of removed) {
    const stance = catalog[t.type];
    if (typeof stance?.trustDecayOnBreak === "number") {
      decay = Math.max(decay, stance.trustDecayOnBreak);
    }
  }

  // Casus belli: political track only. Economic unwind is a commercial break.
  if (track === TRACK_POLITICAL) {
    for (const f of world.factions ?? []) {
      if (f.id === breakerId) continue;
      const fd = ensureFactionDiplomacy(f);
      const hit = f.id === otherId ? decay + 10 : 20;
      fd.opinions[breakerId] = clampOpinion((fd.opinions[breakerId] ?? 0) - hit);
    }
    d.opinions[otherId] = clampOpinion((d.opinions[otherId] ?? 0) - decay);
  }
  d.lastBrokenTreatyTurn = turn;
  pushDiploHistory(fac, {
    turn,
    type: "break",
    withFactionId: otherId,
    label: track === TRACK_ECONOMIC ? "Экономический договор разорван" : "Договор разорван",
    opinionDelta: track === TRACK_POLITICAL ? -decay : 0,
  });
}

/**
 * Collect ModifierStack effects from active treaties for a faction.
 */
export function collectTreatyEffects(faction) {
  const d = faction?.diplomacy;
  if (!d?.treaties?.length) return [];
  const catalog = getContent()?.diplomacy_stances || {};
  const out = [];
  for (const t of d.treaties) {
    let effects;
    if (Array.isArray(t.effects)) {
      // Respect explicit [] (asymmetric overlord / empty subject side).
      effects = t.effects;
    } else {
      const stance = catalog[t.type];
      const asymmetric =
        stance?.asymmetric === true ||
        t.type === "vassal" ||
        Array.isArray(stance?.effectsSubject) ||
        Array.isArray(stance?.effectsOverlord);
      if (asymmetric) {
        const subjectId = t.subjectFactionId || null;
        if (subjectId && faction.id !== subjectId) {
          effects = Array.isArray(stance?.effectsOverlord)
            ? stance.effectsOverlord
            : [];
        } else {
          effects = Array.isArray(stance?.effectsSubject)
            ? stance.effectsSubject
            : Array.isArray(stance?.effects)
              ? stance.effects
              : [];
        }
      } else {
        effects = Array.isArray(stance?.effects) ? stance.effects : [];
      }
    }
    for (const e of effects) {
      if (!e?.effect) continue;
      const source = {
        kind: "treaty",
        id: t.id,
        label: t.type,
      };
      if (e.effect === "treaty_effect") {
        // Unwrap nested effect only — avoid stacking treaty_effect + direct mult.
        if (e.args?.effect) {
          out.push({
            effect: e.args.effect,
            args: e.args.args || {},
            source,
          });
        }
        continue;
      }
      out.push({ ...e, source });
    }
  }
  return out;
}

export function bumpOpinion(faction, towardId, amount, turn, label) {
  const d = ensureFactionDiplomacy(faction);
  const prev = d.opinions[towardId] ?? 0;
  d.opinions[towardId] = clampOpinion(prev + amount);
  pushDiploHistory(faction, {
    turn: turn ?? 0,
    type: "gift",
    withFactionId: towardId,
    label: label || "Дипломатический жест",
    opinionDelta: amount,
  });
}
