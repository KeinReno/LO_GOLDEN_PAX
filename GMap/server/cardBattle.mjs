/**
 * Optional card-battle mode over the same fleet/legion composition.
 * Deterministic: shuffle seeded from engagementId.
 */
import {
  gatherGroups,
  propertyCombatMult,
  cleanupEmptyComposition,
} from "./combatResolve.mjs";
import { getContent } from "./contentLoader.mjs";

const DEFAULT_RULES = {
  handSize: 4,
  drawPerRound: 1,
  maxRounds: 8,
  forceCardThreshold: 5,
  triggers: {
    mutualConsent: true,
    gmForce: true,
    powerCorridor: { min: 0.4, max: 0.6 },
  },
};

function cardBattleRules(content) {
  return { ...DEFAULT_RULES, ...(content?.rules?.cardBattle || {}) };
}

/** Deterministic PRNG from string seed (Mulberry32). */
function seededRng(seedStr) {
  let h = 1779033703 ^ String(seedStr).length;
  for (let i = 0; i < String(seedStr).length; i++) {
    h = Math.imul(h ^ String(seedStr).charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function next() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    const t = (h ^= h >>> 16) >>> 0;
    return t / 4294967296;
  };
}

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Split heavy stacks (count > 5) into 2–3 cards of 3–5 units. */
export function splitStackCounts(count) {
  const n = Math.max(1, count | 0);
  if (n <= 5) return [n];
  const chunks = [];
  let rem = n;
  while (rem > 0) {
    if (rem <= 5) {
      chunks.push(rem);
      break;
    }
    const partsLeft = Math.ceil(rem / 5);
    const size = Math.min(5, Math.max(3, Math.ceil(rem / partsLeft)));
    chunks.push(size);
    rem -= size;
  }
  return chunks;
}

/** Stable id on the live composition ref so finalize can restore duplicate stacks. */
function ensureGroupId(group, indexBase) {
  const ref = group.ref;
  const fallback = `${group.parentKind || "x"}_${group.parentId || "?"}_${group.defId}_${indexBase}`;
  if (ref && typeof ref === "object") {
    if (!ref.id) ref.id = fallback;
    return String(ref.id);
  }
  if (!group.id) group.id = fallback;
  return String(group.id);
}

function groupToCards(group, sideId, indexBase) {
  const chunks = splitStackCounts(group.count || 1);
  const role = (group.roles && group.roles[0]) || "line";
  const groupId = ensureGroupId(group, indexBase);
  return chunks.map((count, i) => ({
    cardId: `${sideId}_${group.defId}_${indexBase}_${i}`,
    defId: group.defId,
    groupId,
    role,
    count,
    hp: group.hp ?? group.maxHp ?? 40,
    maxHp: group.maxHp ?? group.hp ?? 40,
    damage: group.damage ?? 10,
    defense: group.armor ?? 0,
    shields: group.shields ?? 0,
    accuracy: group.accuracy ?? 50,
    targeting: group.targeting || "line_first",
    filledSlots: { ...(group.filledSlots || {}) },
    veterancyLevel: group.veterancyLevel ?? 0,
    parentId: group.parentId,
    parentKind: group.parentKind,
    kind: group.kind,
  }));
}

function cardAsGroup(card) {
  return {
    defId: card.defId,
    roles: [card.role],
    count: card.count,
    hp: card.hp,
    maxHp: card.maxHp,
    damage: card.damage,
    armor: card.defense,
    shields: card.shields,
    accuracy: card.accuracy,
    targeting: card.targeting,
    filledSlots: card.filledSlots || {},
    compSlots: [],
  };
}

function cardPower(card, content, vsCard) {
  const matchups = content.combat_matchups || {};
  const roleMult = vsCard
    ? matchups?.[card.role]?.[vsCard.role] ?? 1
    : 1;
  const prop = vsCard
    ? propertyCombatMult(cardAsGroup(card), cardAsGroup(vsCard), content)
    : 1;
  const unit =
    card.damage *
    (0.5 + card.accuracy / 200) *
    (1 + card.shields / 200) *
    card.count *
    (card.hp / Math.max(1, card.maxHp));
  return unit * roleMult * prop;
}

/**
 * Matchup + property duel. Returns winner/loser + damageDealt.
 */
export function resolveCardPair(attackerCard, defenderCard, content) {
  const atk = cardPower(attackerCard, content, defenderCard);
  const def = cardPower(defenderCard, content, attackerCard);
  const absorb =
    Math.max(1, defenderCard.defense * 0.15 + defenderCard.shields * 0.1) / 10;
  const raw = Math.max(1, atk * 0.55);
  const damageDealt = Math.round(raw / Math.max(0.5, absorb));

  const hpPool = defenderCard.hp * defenderCard.count;
  const inflicted = Math.min(hpPool, damageDealt);
  const unitsLost = Math.floor(inflicted / Math.max(1, defenderCard.maxHp));
  const remainCount = Math.max(0, defenderCard.count - unitsLost);
  const remainHp =
    remainCount === 0
      ? 0
      : Math.max(
          1,
          Math.floor(
            defenderCard.hp - (inflicted % Math.max(1, defenderCard.maxHp)),
          ),
        );

  defenderCard.count = remainCount;
  defenderCard.hp = remainCount > 0 ? remainHp : 0;

  // Light counter-scratch on attacker when defender is stronger
  if (def > atk * 1.15 && attackerCard.count > 0) {
    const scratch = Math.max(1, Math.round(def * 0.15));
    const aPool = attackerCard.hp * attackerCard.count;
    const aHit = Math.min(aPool, scratch);
    const aLost = Math.floor(aHit / Math.max(1, attackerCard.maxHp));
    attackerCard.count = Math.max(0, attackerCard.count - aLost);
    if (attackerCard.count === 0) attackerCard.hp = 0;
  }

  const atkAlive = attackerCard.count > 0;
  const defAlive = defenderCard.count > 0;
  let winnerCard = null;
  let loserCard = null;
  if (atkAlive && !defAlive) {
    winnerCard = attackerCard.cardId;
    loserCard = defenderCard.cardId;
  } else if (!atkAlive && defAlive) {
    winnerCard = defenderCard.cardId;
    loserCard = attackerCard.cardId;
  } else if (atk >= def) {
    winnerCard = attackerCard.cardId;
    loserCard = defAlive ? undefined : defenderCard.cardId;
  } else {
    winnerCard = defenderCard.cardId;
    loserCard = atkAlive ? undefined : attackerCard.cardId;
  }

  return { winnerCard, loserCard, damageDealt: inflicted };
}

function sideIds(engagement) {
  return (engagement.sides || []).map((s) => s.factionId);
}

function emptySideMap(ids, factory) {
  const out = {};
  for (const id of ids) out[id] = factory();
  return out;
}

function totalBaseHp(cards) {
  return cards.reduce(
    (s, c) => s + (c.hp || 0) * Math.max(1, c.count || 0),
    0,
  );
}

/**
 * Turn composition[] of both sides into decks + hands.
 */
export function prepareCardBattle(engagement, world, content = getContent()) {
  const rules = cardBattleRules(content);
  const theater = engagement.theater || "space";
  const ids = sideIds(engagement);
  if (ids.length < 2) {
    return { ok: false, error: "need two sides" };
  }

  const rng = seededRng(engagement.id || "card");
  const decks = {};
  const hands = {};
  const discard = emptySideMap(ids, () => []);
  const frontLines = emptySideMap(ids, () => []);
  const baseHp = {};

  for (let si = 0; si < ids.length; si++) {
    const side = engagement.sides[si];
    const groups = gatherGroups(world, side, theater, content, engagement);
    const cards = [];
    groups.forEach((g, gi) => {
      cards.push(...groupToCards(g, side.factionId, gi));
    });
    shuffleInPlace(cards, rng);
    const handSize = Math.min(rules.handSize, cards.length);
    hands[side.factionId] = cards.splice(0, handSize);
    decks[side.factionId] = cards;
    baseHp[side.factionId] = totalBaseHp([
      ...hands[side.factionId],
      ...decks[side.factionId],
    ]);
  }

  const state = {
    engagementId: engagement.id,
    hands,
    decks,
    discard,
    frontLines,
    baseHp,
    round: 1,
    currentSide: ids[0],
    status: "active",
    log: [
      {
        round: 1,
        side: ids[0],
        action: "draw",
        outcome: { damageDealt: 0 },
      },
    ],
    winnerFactionId: null,
  };

  engagement.mode = "card";
  engagement.status = "active";
  engagement.cardBattle = state;
  return { ok: true, state };
}

function opponentId(state, sideId) {
  return Object.keys(state.hands).find((id) => id !== sideId) || null;
}

function drawCards(state, sideId, n) {
  const hand = state.hands[sideId] || (state.hands[sideId] = []);
  const deck = state.decks[sideId] || (state.decks[sideId] = []);
  const drawn = [];
  for (let i = 0; i < n && deck.length > 0; i++) {
    const c = deck.shift();
    hand.push(c);
    drawn.push(c.cardId);
  }
  return drawn;
}

/**
 * Manual draw from deck (UI: click deck pile). Consumes the turn so the
 * table cannot free-draw the whole deck (aligns with play/pass).
 */
export function drawFromDeck(state, sideId, content = getContent()) {
  if (!state || state.status !== "active") {
    return { ok: false, error: "battle not active" };
  }
  if (state.currentSide !== sideId) {
    return { ok: false, error: "not your turn" };
  }
  const deck = state.decks[sideId] || [];
  if (deck.length === 0) return { ok: false, error: "deck empty" };
  const drawn = drawCards(state, sideId, 1);
  state.log.push({
    round: state.round,
    side: sideId,
    action: "draw",
    cardId: drawn[0],
  });
  const rules = cardBattleRules(content);
  advanceTurn(state, rules);
  if (checkEndCondition(state, content)) {
    state.status = "resolved";
    settleWinner(state);
  }
  return { ok: true, state, drawn };
}

function advanceTurn(state, rules) {
  const ids = Object.keys(state.hands);
  const cur = ids.indexOf(state.currentSide);
  const next = ids[(cur + 1) % ids.length];
  // Full round when we wrap to first side
  if (next === ids[0]) {
    state.round += 1;
    for (const id of ids) {
      drawCards(state, id, rules.drawPerRound || 1);
    }
  }
  state.currentSide = next;
}

function sideHasCards(state, sideId) {
  return (
    (state.hands[sideId]?.length || 0) +
      (state.decks[sideId]?.length || 0) +
      (state.frontLines[sideId]?.length || 0) >
    0
  );
}

/**
 * End when max rounds or one side has no cards left anywhere
 * (hand+deck+front). Empty board ends the fight even if baseHp remains.
 */
export function checkEndCondition(state, content = getContent()) {
  const rules = cardBattleRules(content);
  if (state.status === "resolved") return true;
  if (state.round > rules.maxRounds) return true;
  const ids = Object.keys(state.hands);
  for (const id of ids) {
    if (!sideHasCards(state, id)) {
      state.baseHp[id] = 0;
      return true;
    }
  }
  return false;
}

function settleWinner(state) {
  const ids = Object.keys(state.hands);
  if (ids.length < 2) {
    state.winnerFactionId = ids[0] || null;
    return;
  }
  const score = (id) =>
    (state.baseHp[id] || 0) +
    totalBaseHp([
      ...(state.hands[id] || []),
      ...(state.decks[id] || []),
      ...(state.frontLines[id] || []),
    ]);
  const a = score(ids[0]);
  const b = score(ids[1]);
  if (a > b) state.winnerFactionId = ids[0];
  else if (b > a) state.winnerFactionId = ids[1];
  else state.winnerFactionId = null;
}

function moveDeadToDiscard(state, sideId, card) {
  if (card.count > 0) return false;
  const fl = state.frontLines[sideId] || [];
  state.frontLines[sideId] = fl.filter((c) => c.cardId !== card.cardId);
  state.discard[sideId] = state.discard[sideId] || [];
  state.discard[sideId].push(card);
  return true;
}

/**
 * Play a card onto the front line. Resolves vs opposing front card or hits base.
 */
export function playCardRound(state, sideId, cardId, content = getContent()) {
  if (!state || state.status !== "active") {
    return { ok: false, error: "battle not active" };
  }
  if (state.currentSide !== sideId) {
    return { ok: false, error: "not your turn" };
  }
  const hand = state.hands[sideId] || [];
  const idx = hand.findIndex((c) => c.cardId === cardId);
  if (idx < 0) return { ok: false, error: "card not in hand" };

  const card = hand.splice(idx, 1)[0];
  state.frontLines[sideId] = state.frontLines[sideId] || [];
  state.frontLines[sideId].push(card);

  state.log.push({
    round: state.round,
    side: sideId,
    action: "play",
    cardId: card.cardId,
  });

  const opp = opponentId(state, sideId);
  const oppLine = opp ? state.frontLines[opp] || [] : [];
  let pairResult = null;

  if (opp && oppLine.length > 0) {
    const defender = oppLine[oppLine.length - 1];
    pairResult = resolveCardPair(card, defender, content);
    state.log.push({
      round: state.round,
      side: sideId,
      action: "resolve",
      cardId: card.cardId,
      outcome: pairResult,
    });
    moveDeadToDiscard(state, opp, defender);
    moveDeadToDiscard(state, sideId, card);
  } else if (opp) {
    // Hit base: damage proportional to card power
    const dmg = Math.max(
      1,
      Math.round(cardPower(card, content, null) * 0.4),
    );
    state.baseHp[opp] = Math.max(0, (state.baseHp[opp] || 0) - dmg);
    state.log.push({
      round: state.round,
      side: sideId,
      action: "base_hit",
      cardId: card.cardId,
      outcome: { damageDealt: dmg },
    });
    // Spent card stays on front briefly then discards if one-shot? Keep on line.
  }

  const rules = cardBattleRules(content);
  if (checkEndCondition(state, content)) {
    state.status = "resolved";
    settleWinner(state);
  } else {
    advanceTurn(state, rules);
    if (checkEndCondition(state, content)) {
      state.status = "resolved";
      settleWinner(state);
    }
  }

  return { ok: true, state, pairResult };
}

export function passCardRound(state, sideId, content = getContent()) {
  if (!state || state.status !== "active") {
    return { ok: false, error: "battle not active" };
  }
  if (state.currentSide !== sideId) {
    return { ok: false, error: "not your turn" };
  }
  state.log.push({ round: state.round, side: sideId, action: "pass" });
  const rules = cardBattleRules(content);
  advanceTurn(state, rules);
  if (checkEndCondition(state, content)) {
    state.status = "resolved";
    settleWinner(state);
  }
  return { ok: true, state };
}

function stackKey(card) {
  const parentKind = card.parentKind || "fleet";
  const parentId = card.parentId || "?";
  if (card.groupId) return `${parentKind}|${parentId}|gid:${card.groupId}`;
  return `${parentKind}|${parentId}|def:${card.defId}`;
}

function findCompositionGroup(composition, meta) {
  if (!Array.isArray(composition)) return null;
  if (meta.groupId) {
    const byId = composition.find((x) => x.id === meta.groupId);
    if (byId) return byId;
  }
  return composition.find((x) => (x.defId || x.type) === meta.defId) || null;
}

/**
 * Write surviving card counts back onto fleet/legion composition.
 * Prefer group id/ref so duplicate defId stacks do not collapse.
 */
export function finalizeCardBattle(state, world) {
  if (!state) return { ok: false, error: "no state" };

  const survivors = new Map(); // stackKey -> count/hp
  const participated = new Map(); // stackKey -> meta

  const noteParticipated = (card) => {
    if (!card?.parentId || !card.defId) return;
    const key = stackKey(card);
    participated.set(key, {
      parentKind: card.parentKind || "fleet",
      parentId: card.parentId,
      defId: card.defId,
      groupId: card.groupId || null,
    });
  };

  const collect = (card) => {
    noteParticipated(card);
    if (!card || (card.count || 0) <= 0) return;
    const key = stackKey(card);
    const cur = survivors.get(key) || {
      parentKind: card.parentKind || "fleet",
      parentId: card.parentId,
      defId: card.defId,
      groupId: card.groupId || null,
      count: 0,
      hp: card.hp,
    };
    cur.count += card.count;
    cur.hp = Math.min(cur.hp || card.maxHp, card.hp);
    survivors.set(key, cur);
  };

  for (const id of Object.keys(state.hands || {})) {
    for (const c of state.hands[id] || []) collect(c);
    for (const c of state.decks[id] || []) collect(c);
    for (const c of state.frontLines[id] || []) collect(c);
    for (const c of state.discard?.[id] || []) noteParticipated(c);
  }

  // Zero every participated stack, then restore survivors.
  for (const p of participated.values()) {
    if (p.parentKind === "fleet") {
      const fleet = (world.fleets ?? []).find((f) => f.id === p.parentId);
      const g = findCompositionGroup(fleet?.composition, p);
      if (g) {
        g.count = 0;
        g.hp = 0;
      }
    } else if (p.parentKind === "legion") {
      const legion = (world.legions ?? []).find((l) => l.id === p.parentId);
      const g = findCompositionGroup(legion?.composition, p);
      if (g) {
        g.count = 0;
        g.hp = 0;
      }
    }
  }

  for (const v of survivors.values()) {
    if (!v.parentId) continue;
    if (v.parentKind === "fleet") {
      const fleet = (world.fleets ?? []).find((f) => f.id === v.parentId);
      if (!fleet) continue;
      const g = findCompositionGroup(fleet.composition, v);
      if (g) {
        g.count = v.count;
        g.hp = v.hp;
      }
    } else if (v.parentKind === "legion") {
      const legion = (world.legions ?? []).find((l) => l.id === v.parentId);
      if (!legion || !Array.isArray(legion.composition)) continue;
      const g = findCompositionGroup(legion.composition, v);
      if (g) {
        g.count = v.count;
        g.hp = v.hp;
      }
    }
  }

  cleanupEmptyComposition(world);
  state.status = "resolved";
  return {
    ok: true,
    winnerFactionId: state.winnerFactionId ?? null,
  };
}

/**
 * Rough power ratio of sideA / (sideA+sideB) for corridor trigger.
 */
export function estimatePowerShare(world, engagement, content = getContent()) {
  const theater = engagement.theater || "space";
  const sideA = engagement.sides?.[0];
  const sideB = engagement.sides?.[1];
  if (!sideA || !sideB) return 0.5;
  const groupsA = gatherGroups(world, sideA, theater, content, engagement);
  const groupsB = gatherGroups(world, sideB, theater, content, engagement);
  const pow = (groups) =>
    groups.reduce(
      (s, g) =>
        s +
        g.damage *
          (0.5 + g.accuracy / 200) *
          g.count *
          (g.hp / Math.max(1, g.maxHp)),
      0,
    );
  const a = pow(groupsA);
  const b = pow(groupsB);
  return a / Math.max(1, a + b);
}

export function shouldOfferCardBattle(world, engagement, content = getContent()) {
  const rules = cardBattleRules(content);
  const corridor = rules.triggers?.powerCorridor;
  if (!corridor) return false;
  const share = estimatePowerShare(world, engagement, content);
  return share >= corridor.min && share <= corridor.max;
}
