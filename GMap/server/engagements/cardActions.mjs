/**
 * Card-battle mode for an engagement: consent/force triggers, prepared-state
 * migration, and the per-action entry points (play/strike/ready/stance/draw/
 * reorder/retreat/trophy). Extracted from ../engagements.mjs.
 */
import {
  prepareCardBattle,
  playCardRound,
  claimCardBattleSalvage,
  skipCardBattleSalvage,
  shouldOfferCardBattle,
  drawFromDeck,
  readyRound,
  applyStanceOrder,
  strikeWithFrontCard,
  maybeRunAiSeats,
  reorderFrontCard,
  retreatFromBattle,
} from "../cardBattle.mjs";
import { getContent } from "../contentLoader.mjs";
import { isOpenEngagement, readEngagements, writeEngagements } from "./store.mjs";
import { finishCardEngagement } from "./resolveTick.mjs";

export function setEngagementStance(engagementId, factionId, stance) {
  const content = getContent();
  if (!content.combat_stances?.[stance]) {
    return { ok: false, error: "unknown stance" };
  }
  const list = readEngagements();
  const eng = list.find((e) => e.id === engagementId);
  if (!eng || !isOpenEngagement(eng)) {
    return { ok: false, error: "engagement not open" };
  }
  const side = eng.sides.find((s) => s.factionId === factionId);
  if (!side) return { ok: false, error: "not a side" };
  side.stance = stance;
  side.locked = true;
  writeEngagements(list);
  return { ok: true, engagement: eng };
}

/**
 * Card battle request: mutual consent → mode=card (+ prepare if world given).
 */
export function requestCardBattle(engagementId, factionId, world = null) {
  const list = readEngagements();
  const eng = list.find((e) => e.id === engagementId);
  if (!eng || !isOpenEngagement(eng)) {
    return { ok: false, error: "engagement not open" };
  }
  if (!eng.sides.some((s) => s.factionId === factionId)) {
    return { ok: false, error: "not a side" };
  }
  const reqs = new Set(eng.cardBattleRequests || []);
  reqs.add(factionId);
  eng.cardBattleRequests = [...reqs];
  const sideIds = eng.sides.map((s) => s.factionId);
  const mutual = sideIds.every((id) => reqs.has(id));
  if (mutual) {
    eng.mode = "card";
    if (world && (!eng.cardBattle || eng.cardBattle.status !== "active")) {
      const content = getContent();
      prepareCardBattle(eng, world, content);
      maybeRunAiSeats(eng.cardBattle, world, content);
    }
  }
  writeEngagements(list);
  return {
    ok: true,
    engagement: eng,
    mode: eng.mode,
    mutual,
  };
}

export function forceCardBattle(engagementId, world = null) {
  const list = readEngagements();
  const eng = list.find((e) => e.id === engagementId);
  if (!eng || !isOpenEngagement(eng)) {
    return { ok: false, error: "engagement not open" };
  }
  eng.gmForceCard = true;
  eng.mode = "card";
  if (world && (!eng.cardBattle || eng.cardBattle.status !== "active")) {
    const content = getContent();
    prepareCardBattle(eng, world, content);
    maybeRunAiSeats(eng.cardBattle, world, content);
  }
  writeEngagements(list);
  return { ok: true, engagement: eng };
}

/**
 * Apply triggers after engagement creation (power corridor offer / gm force).
 */
export function applyCardBattleTriggers(world, eng, opts = {}) {
  const content = getContent();
  const triggers = content.rules?.cardBattle?.triggers || {};

  if (opts.gmForce || eng.gmForceCard) {
    if (triggers.gmForce !== false) {
      eng.mode = "card";
      return { mode: "card", reason: "gm_force" };
    }
  }

  const requests = new Set(eng.cardBattleRequests || []);
  const sideIds = (eng.sides || []).map((s) => s.factionId);
  const mutual =
    triggers.mutualConsent !== false &&
    sideIds.length >= 2 &&
    sideIds.every((id) => requests.has(id));

  if (mutual) {
    eng.mode = "card";
    return { mode: "card", reason: "mutual_consent" };
  }

  if (shouldOfferCardBattle(world, eng, content)) {
    eng.cardBattleOffer = true;
    return { mode: eng.mode || "auto", reason: "power_corridor_offer" };
  }

  eng.mode = eng.mode || "auto";
  return { mode: eng.mode, reason: "auto" };
}

function ensureCardBattlePrepared(eng, world, content) {
  if (!eng.cardBattle || eng.cardBattle.status !== "active") {
    const prep = prepareCardBattle(eng, world, content);
    if (!prep.ok) return prep;
    maybeRunAiSeats(eng.cardBattle, world, content);
  }
  // Migrate legacy states missing energy/phase
  const st = eng.cardBattle;
  if (st && !st.energy) {
    const ids = (eng.sides || []).map((s) => s.factionId);
    const rules = content?.rules?.cardBattle || {};
    const e = rules.energyPerRound ?? 5;
    const mf = rules.maxFront ?? 5;
    st.energy = Object.fromEntries(ids.map((id) => [id, e]));
    st.maxEnergy = e;
    st.maxFront = st.maxFront ?? mf;
    st.readySides = st.readySides || [];
    st.stanceOrderUsedRound = st.stanceOrderUsedRound || {};
    st.buffs = st.buffs || {};
    st.block = st.block || Object.fromEntries(ids.map((id) => [id, 0]));
    st.statuses = st.statuses || {};
    st.intents = st.intents || {};
    st.struckThisRound = st.struckThisRound || {};
    st.phase = st.phase || "plan";
    st.baseHpMax = st.baseHpMax || { ...st.baseHp };
    st.styleMoments = st.styleMoments || [];
  }
  return { ok: true };
}

function afterCardAction(eng, world, content, result) {
  eng.cardBattle = result.state;
  maybeRunAiSeats(eng.cardBattle, world, content);
  const journal = [];
  if (eng.cardBattle.status === "resolved") {
    finishCardEngagement(world, eng, journal);
  }
  return journal;
}

export function playEngagementCard(
  engagementId,
  factionId,
  cardId,
  world,
  opts = {},
) {
  const content = getContent();
  const list = readEngagements();
  const eng = list.find((e) => e.id === engagementId);
  if (!eng) return { ok: false, error: "engagement missing" };
  if (eng.mode !== "card") return { ok: false, error: "not card mode" };

  const prep = ensureCardBattlePrepared(eng, world, content);
  if (!prep.ok) return prep;

  if (!eng.sides.some((s) => s.factionId === factionId)) {
    return { ok: false, error: "not a side" };
  }

  const result = playCardRound(eng.cardBattle, factionId, cardId, content, {
    targetId: opts.targetId,
    mode: opts.mode,
  });
  if (!result.ok) return result;

  const journal = afterCardAction(eng, world, content, result);
  writeEngagements(list);
  return {
    ok: true,
    engagement: eng,
    journal,
    pairResult: result.pairResult,
  };
}

export function strikeEngagementFront(
  engagementId,
  factionId,
  cardId,
  targetId,
  world,
) {
  const content = getContent();
  const list = readEngagements();
  const eng = list.find((e) => e.id === engagementId);
  if (!eng) return { ok: false, error: "engagement missing" };
  if (eng.mode !== "card") return { ok: false, error: "not card mode" };
  const prep = ensureCardBattlePrepared(eng, world, content);
  if (!prep.ok) return prep;
  if (!eng.sides.some((s) => s.factionId === factionId)) {
    return { ok: false, error: "not a side" };
  }
  const result = strikeWithFrontCard(
    eng.cardBattle,
    factionId,
    cardId,
    targetId,
    content,
  );
  if (!result.ok) return result;
  const journal = afterCardAction(eng, world, content, result);
  writeEngagements(list);
  return {
    ok: true,
    engagement: eng,
    journal,
    pairResult: result.pairResult,
  };
}

export function readyEngagementCard(engagementId, factionId, world) {
  const content = getContent();
  const list = readEngagements();
  const eng = list.find((e) => e.id === engagementId);
  if (!eng) return { ok: false, error: "engagement missing" };
  if (eng.mode !== "card" || !eng.cardBattle) {
    return { ok: false, error: "no card battle" };
  }
  const result = readyRound(eng.cardBattle, factionId, content);
  if (!result.ok) return result;
  const journal = afterCardAction(eng, world, content, result);
  writeEngagements(list);
  return { ok: true, engagement: eng, journal, clashed: result.clashed };
}

export function stanceOrderEngagement(
  engagementId,
  factionId,
  world,
  opts = {},
) {
  const content = getContent();
  const list = readEngagements();
  const eng = list.find((e) => e.id === engagementId);
  if (!eng) return { ok: false, error: "engagement missing" };
  if (eng.mode !== "card") return { ok: false, error: "not card mode" };
  const prep = ensureCardBattlePrepared(eng, world, content);
  if (!prep.ok) return prep;
  if (!eng.sides.some((s) => s.factionId === factionId)) {
    return { ok: false, error: "not a side" };
  }
  const side = eng.sides.find((s) => s.factionId === factionId);
  const stance = opts.stance || side?.stance || "hold";
  const result = applyStanceOrder(
    eng.cardBattle,
    factionId,
    stance,
    content,
    { cardId: opts.cardId },
  );
  if (!result.ok) return result;
  const journal = afterCardAction(eng, world, content, result);
  writeEngagements(list);
  return { ok: true, engagement: eng, journal };
}

export function passEngagementCard(engagementId, factionId, world) {
  return readyEngagementCard(engagementId, factionId, world);
}

export function drawEngagementCard(engagementId, factionId, world) {
  const content = getContent();
  const list = readEngagements();
  const eng = list.find((e) => e.id === engagementId);
  if (!eng) return { ok: false, error: "engagement missing" };
  if (eng.mode !== "card") return { ok: false, error: "not card mode" };
  const prep = ensureCardBattlePrepared(eng, world, content);
  if (!prep.ok) return prep;
  if (!eng.sides.some((s) => s.factionId === factionId)) {
    return { ok: false, error: "not a side" };
  }
  const result = drawFromDeck(eng.cardBattle, factionId, content);
  if (!result.ok) return result;
  eng.cardBattle = result.state;
  maybeRunAiSeats(eng.cardBattle, world, content);
  writeEngagements(list);
  return { ok: true, engagement: eng, drawn: result.drawn };
}

export function reorderEngagementFront(
  engagementId,
  factionId,
  cardId,
  toIndex,
  world,
) {
  const content = getContent();
  const list = readEngagements();
  const eng = list.find((e) => e.id === engagementId);
  if (!eng) return { ok: false, error: "engagement missing" };
  if (eng.mode !== "card") return { ok: false, error: "not card mode" };
  const prep = ensureCardBattlePrepared(eng, world, content);
  if (!prep.ok) return prep;
  if (!eng.sides.some((s) => s.factionId === factionId)) {
    return { ok: false, error: "not a side" };
  }
  const result = reorderFrontCard(
    eng.cardBattle,
    factionId,
    cardId,
    toIndex,
    content,
  );
  if (!result.ok) return result;
  const journal = afterCardAction(eng, world, content, result);
  writeEngagements(list);
  return { ok: true, engagement: eng, journal };
}

export function retreatEngagementCard(engagementId, factionId, world) {
  const content = getContent();
  const list = readEngagements();
  const eng = list.find((e) => e.id === engagementId);
  if (!eng) return { ok: false, error: "engagement missing" };
  if (eng.mode !== "card" || !eng.cardBattle) {
    return { ok: false, error: "no card battle" };
  }
  if (!eng.sides.some((s) => s.factionId === factionId)) {
    return { ok: false, error: "not a side" };
  }
  const result = retreatFromBattle(eng.cardBattle, factionId, content);
  if (!result.ok) return result;
  const journal = [];
  finishCardEngagement(world, eng, journal);
  writeEngagements(list);
  return { ok: true, engagement: eng, journal, retreated: true };
}

/** Resolved card battle: winner picks one salvage module into an empty slot. */
export function claimEngagementTrophy(engagementId, factionId, world, pick = {}) {
  const list = readEngagements();
  const eng = list.find((e) => e.id === engagementId);
  if (!eng) return { ok: false, error: "engagement missing" };
  if (!eng.sides.some((s) => s.factionId === factionId)) {
    return { ok: false, error: "not a side" };
  }
  const result = claimCardBattleSalvage(world, eng, factionId, pick);
  if (!result.ok) return result;
  writeEngagements(list);
  return { ok: true, engagement: eng, trophies: result.trophies };
}

export function skipEngagementTrophy(engagementId, factionId, world) {
  const list = readEngagements();
  const eng = list.find((e) => e.id === engagementId);
  if (!eng) return { ok: false, error: "engagement missing" };
  if (!eng.sides.some((s) => s.factionId === factionId)) {
    return { ok: false, error: "not a side" };
  }
  const result = skipCardBattleSalvage(world, eng, factionId);
  if (!result.ok) return result;
  writeEngagements(list);
  return { ok: true, engagement: eng, trophies: result.trophies };
}
