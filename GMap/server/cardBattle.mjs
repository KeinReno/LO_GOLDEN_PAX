/**
 * Tactical skirmish card battle — energy, front slots, targeted strikes,
 * end-of-round clash, stance orders. Composition still seeds the deck.
 */
import {
  gatherGroups,
  propertyCombatMult,
  cleanupEmptyComposition,
  veterancyConfig,
  levelFromXp,
} from "./combatResolve.mjs";
import { getContent } from "./contentLoader.mjs";
import { readLedger, writeLedger, adjustStock, ensureFactionEco } from "./ledger.mjs";
import { bumpSystemIntel } from "./intel.mjs";

const DEFAULT_RULES = {
  handSize: 4,
  maxHandSize: 7,
  drawPerRound: 2,
  maxRounds: 4,
  energyPerRound: 4,
  maxFront: 5,
  minDeckCards: 6,
  forceCardThreshold: 5,
  stanceOrderCooldownRounds: 2,
  blockRetainHold: 0.25,
  vulnerableMult: 1.5,
  weakMult: 0.75,
  holdOrderBlock: 28,
  holdOpeningBlock: 12,
  braceBlockFactor: 0.35,
  braceBlockMin: 6,
  focusEnergyCost: 1,
  retreatLossMult: 0.45,
  freeReorderPerRound: 1,
  xpPerCardBattle: 50,
  overwhelmSplashMult: 0.35,
  trophies: {
    metalPerLostUnit: 1,
    metalFloor: 2,
    cognitioOnWin: 6,
    intelBump: 6,
    loyaltyHit: 5,
    styleCognitioPerBanner: 1,
    styleMaxCognitio: 3,
  },
  triggers: {
    mutualConsent: true,
    gmForce: true,
    powerCorridor: { min: 0.4, max: 0.6 },
  },
};

const HEAVY_ROLES = new Set(["capital", "carrier", "armor", "bombard"]);

export function cardBattleRules(content) {
  return { ...DEFAULT_RULES, ...(content?.rules?.cardBattle || {}) };
}

export function cardEnergyCost(card) {
  const role = card?.role || "line";
  return HEAVY_ROLES.has(role) ? 2 : 1;
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

/**
 * Deal hand/deck honouring Forces composition order (deployOrder).
 * Front of the Forces fan → preferred opening hand; remaining units keep draw order;
 * tactical cards are shuffled into the draw pile.
 */
export function dealWithDeployOrder(cards, handSize, rng) {
  const units = [];
  const tacs = [];
  for (const c of cards || []) {
    if (c?.tactical) tacs.push(c);
    else units.push(c);
  }
  units.sort((a, b) => {
    const da = Number(a.deployOrder);
    const db = Number(b.deployOrder);
    const oa = Number.isFinite(da) ? da : 999;
    const ob = Number.isFinite(db) ? db : 999;
    if (oa !== ob) return oa - ob;
    return rng() - 0.5;
  });
  const hs = Math.max(0, Math.min(handSize | 0, units.length + tacs.length));
  const hand = [];
  const unitRest = [];
  for (const c of units) {
    if (hand.length < hs) hand.push(c);
    else unitRest.push(c);
  }
  while (hand.length < hs && tacs.length) {
    hand.push(tacs.pop());
  }
  shuffleInPlace(tacs, rng);
  // Keep unit draw order; sprinkle tactical cards into the pile.
  const deck = [...unitRest];
  for (const t of tacs) {
    const at = Math.floor(rng() * (deck.length + 1));
    deck.splice(at, 0, t);
  }
  return { hand, deck };
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
    veterancyLevel: group.veterancyLevel ?? group.level ?? 0,
    parentId: group.parentId,
    parentKind: group.parentKind,
    kind: group.kind,
    energyCost: HEAVY_ROLES.has(role) ? 2 : 1,
    /** Composition index — lower = preferred hand / earlier draw. */
    deployOrder: indexBase,
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

export function roleMatchupMult(attackerRole, defenderRole, content) {
  const matchups = content?.combat_matchups || {};
  return matchups?.[attackerRole]?.[defenderRole] ?? 1;
}

/** Best / worst roles for UI hints. */
export function matchupHintsForRole(role, content = getContent()) {
  const row = content?.combat_matchups?.[role] || {};
  const entries = Object.entries(row);
  if (!entries.length) return { strongVs: [], weakVs: [] };
  const sorted = entries.slice().sort((a, b) => b[1] - a[1]);
  const strongVs = sorted.filter(([, v]) => v >= 1.15).slice(0, 2).map(([r]) => r);
  const weakVs = sorted
    .filter(([, v]) => v <= 0.85)
    .slice(-2)
    .map(([r]) => r);
  return { strongVs, weakVs };
}

/** Role → keyword (LoR-lite). Same map for space + ground. */
export const ROLE_KEYWORDS = {
  screen: "escort",
  capital: "overwhelm",
  bombard: "siege",
  carrier: "support",
  armor: "brace",
  garrison: "escort",
  assault: "overwhelm",
  support: "support",
};

const STYLE_LABELS = {
  escort_vengeance: "Месть эскорта",
  overwhelm_crush: "Сокрушение",
  overwhelm_splash: "Волна прорыва",
  support_rally: "Подкрепление",
  base_breach: "Прорыв базы",
  escort_save: "Спас эскорт",
  perfect_block: "Идеальный блок",
  double_kill: "Двойной удар",
};

function pushStyle(state, sideId, kind, extra = {}) {
  if (!state.styleMoments) state.styleMoments = [];
  const label = STYLE_LABELS[kind] || kind;
  state.styleMoments.push({
    sideId,
    kind,
    label,
    round: state.round,
    ...extra,
  });
  return label;
}

export function keywordForRole(role) {
  return ROLE_KEYWORDS[role] || null;
}

/** Role keyword plus optional tech overlays on the card. */
export function keywordsForCard(card) {
  const out = [];
  const base = keywordForRole(card?.role);
  if (base) out.push(base);
  for (const k of card?.bonusKeywords || []) {
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

function techModsForFaction(factionId) {
  const ids = unlockedTechsForFaction(factionId).map(String);
  const has = (re) => ids.some((t) => re.test(t));
  const mods = {
    blockBonus: 0,
    damageMult: 1,
    freeReorder: false,
    bonusKeywordsByRole: {},
  };
  if (has(/shield|armor|hull|defense/i)) mods.blockBonus += 8;
  if (has(/weapon|gun|laser|missile|combat|war/i)) mods.damageMult *= 1.1;
  if (has(/carrier|drone|fighter|scout|tactics/i)) mods.freeReorder = true;
  if (has(/capital|breakthrough|overwhelm/i)) {
    mods.bonusKeywordsByRole.capital = ["overwhelm"];
  }
  if (has(/siege|bombard|artillery/i)) {
    mods.bonusKeywordsByRole.bombard = ["siege"];
  }
  return mods;
}

function applyTechOverlaysToCards(cards, mods) {
  if (!mods?.bonusKeywordsByRole) return;
  for (const c of cards) {
    const extra = mods.bonusKeywordsByRole[c.role];
    if (!extra?.length) continue;
    c.bonusKeywords = [...new Set([...(c.bonusKeywords || []), ...extra])];
  }
}

export function cardPower(card, content, vsCard, buff = {}, statusMods = {}) {
  const roleMult = vsCard
    ? roleMatchupMult(card.role, vsCard.role, content)
    : 1;
  const prop = vsCard
    ? propertyCombatMult(cardAsGroup(card), cardAsGroup(vsCard), content)
    : 1;
  const dmgMult = (buff.damageMult ?? 1) * (statusMods.outgoingMult ?? 1);
  const hpRatio = Math.max(0.35, (card.hp || 0) / Math.max(1, card.maxHp || 1));
  const unit =
    (card.damage || 0) *
    dmgMult *
    (0.55 + (card.accuracy || 0) / 220) *
    (1 + (card.shields || 0) / 250) *
    Math.max(1, card.count || 0) *
    hpRatio;
  return Math.max(1, unit * roleMult * prop);
}

function ensureStatuses(state) {
  if (!state.statuses) state.statuses = {};
  return state.statuses;
}

function getCardStatus(state, cardId) {
  return ensureStatuses(state)[cardId] || {};
}

function setCardStatus(state, cardId, patch) {
  const all = ensureStatuses(state);
  all[cardId] = { ...(all[cardId] || {}), ...patch };
  return all[cardId];
}

function clearSpentFocus(state, cardId) {
  const st = getCardStatus(state, cardId);
  if (st.focus) {
    setCardStatus(state, cardId, { focus: false });
  }
}

function statusOutgoingMult(state, cardId, rules) {
  const st = getCardStatus(state, cardId);
  return st.weak ? rules.weakMult ?? 0.75 : 1;
}

function statusIncomingMult(state, cardId, rules) {
  const st = getCardStatus(state, cardId);
  return st.vulnerable ? rules.vulnerableMult ?? 1.5 : 1;
}

function ensureBlock(state) {
  if (!state.block) state.block = {};
  return state.block;
}

function addBlock(state, sideId, amount) {
  const b = ensureBlock(state);
  b[sideId] = Math.max(0, (b[sideId] || 0) + Math.round(amount));
  return b[sideId];
}

/**
 * Apply damage through side Block first (StS-style), then remainder.
 * Focus on attacker ignores Block for this hit.
 */
function applyThroughBlock(state, sideId, rawDmg, { pierceBlock = false } = {}) {
  let remaining = Math.max(0, Math.round(rawDmg));
  let blocked = 0;
  if (!pierceBlock && remaining > 0) {
    const b = ensureBlock(state);
    const cur = b[sideId] || 0;
    blocked = Math.min(cur, remaining);
    b[sideId] = cur - blocked;
    remaining -= blocked;
  }
  return { remaining, blocked };
}

/** Inflict HP damage on a front card (count/hp pool). */
function inflictOnCard(card, dmg) {
  if (!card || dmg <= 0) return { inflicted: 0, killed: false };
  const maxHp = Math.max(1, card.maxHp || card.hp || 1);
  const currentHp = card.hp || maxHp;
  const hpPool = Math.max(0, currentHp + Math.max(0, (card.count || 0) - 1) * maxHp);
  const inflicted = Math.min(hpPool, Math.round(dmg));
  
  if (inflicted >= hpPool) {
    card.count = 0;
    card.hp = 0;
    return { inflicted, killed: true };
  }
  
  let remainDmg = inflicted;
  let remainCount = card.count || 0;
  let remainHp = currentHp;
  
  if (remainDmg >= remainHp) {
    remainDmg -= remainHp;
    remainCount -= 1;
    remainHp = maxHp;
    
    if (remainDmg > 0) {
      const unitsLost = Math.floor(remainDmg / maxHp);
      remainCount -= unitsLost;
      remainDmg -= unitsLost * maxHp;
      remainHp -= remainDmg;
    }
  } else {
    remainHp -= remainDmg;
  }
  
  card.count = Math.max(0, remainCount);
  card.hp = card.count > 0 ? Math.max(1, remainHp) : 0;
  return { inflicted, killed: card.count <= 0 };
}

/**
 * Compute strike damage number (no mutation). Exported for client preview parity.
 */
export function estimateStrikeDamage(
  attackerCard,
  defenderCard,
  content,
  opts = {},
) {
  const rules = cardBattleRules(content);
  const atkBuff = opts.atkBuff || {};
  const outgoing = opts.outgoingMult ?? 1;
  let raw = cardPower(
    attackerCard,
    content,
    defenderCard || null,
    atkBuff,
    { outgoingMult: outgoing },
  );
  if (!defenderCard) {
    let mult = 0.5;
    if (atkBuff.flankBase) mult = 0.6;
    if (atkBuff.bombard || keywordsForCard(attackerCard).includes("siege")) {
      mult = 0.75;
    }
    if (keywordsForCard(attackerCard).includes("siege")) raw *= 1.5;
    raw = Math.max(1, Math.round(raw * mult));
  } else {
    const incoming = opts.incomingMult ?? 1;
    const defMit =
      1 +
      Math.min(
        0.35,
        ((defenderCard.defense || 0) * 0.004 + (defenderCard.shields || 0) * 0.002) *
          (opts.defBuff?.defenseMult ?? 1),
      );
    raw = Math.max(1, Math.round((raw * 0.65 * incoming) / defMit));
  }
  return raw;
}

/**
 * Matchup duel with Block-aware HP damage. Returns winner/loser + damageDealt.
 */
export function resolveCardPair(
  attackerCard,
  defenderCard,
  content,
  atkBuff = {},
  defBuff = {},
  opts = {},
) {
  const rules = cardBattleRules(content);
  const outgoing = opts.outgoingMult ?? 1;
  const incoming = opts.incomingMult ?? 1;
  const atk = cardPower(attackerCard, content, defenderCard, atkBuff, {
    outgoingMult: outgoing,
  });
  const def = cardPower(defenderCard, content, attackerCard, defBuff, {});
  const raw = estimateStrikeDamage(attackerCard, defenderCard, content, {
    atkBuff,
    defBuff,
    outgoingMult: outgoing,
    incomingMult: incoming,
  });

  const hit = inflictOnCard(defenderCard, raw);
  let overflow = 0;
  if (hit.killed && keywordsForCard(attackerCard).includes("overwhelm")) {
    overflow = Math.max(0, raw - hit.inflicted);
  }

  // Counter-scratch if defender much stronger
  if (def > atk * 1.2 && attackerCard.count > 0 && !hit.killed) {
    inflictOnCard(attackerCard, Math.max(1, Math.round(def * 0.12)));
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
  } else {
    winnerCard = defenderCard.cardId;
  }

  return {
    winnerCard,
    loserCard,
    damageDealt: hit.inflicted,
    overflowToBase: overflow,
    raw,
  };
}

function setIntent(state, sideId, intent) {
  if (!state.intents) state.intents = {};
  state.intents[sideId] = intent
    ? { ...intent, round: state.round }
    : null;
}

function markStruck(state, sideId, cardId) {
  if (!state.struckThisRound) state.struckThisRound = {};
  if (!state.struckThisRound[sideId]) state.struckThisRound[sideId] = [];
  if (!state.struckThisRound[sideId].includes(cardId)) {
    state.struckThisRound[sideId].push(cardId);
  }
}

function hasStruckThisRound(state, sideId, cardId) {
  return (state.struckThisRound?.[sideId] || []).includes(cardId);
}

function frontStrikeEnergyCost(state, sideId, cardId) {
  // First front strike per card per round is free.
  return hasStruckThisRound(state, sideId, cardId) ? 1 : 0;
}

function applyBraceAtRoundStart(state) {
  for (const sideId of Object.keys(state.frontLines || {})) {
    for (const c of state.frontLines[sideId] || []) {
      if (keywordsForCard(c).includes("brace") && c.count > 0) {
        addBlock(state, sideId, Math.max(2, Math.round((c.defense || 0) * 0.1)));
      }
    }
  }
}

/** Escort dies → neighbors Vulnerable (combo). Survives into next plan. */
function applyEscortDeathCombo(state, defSide, deadCard, killerSide) {
  if (!deadCard || deadCard.count > 0) return null;
  if (!keywordsForCard(deadCard).includes("escort")) return null;
  const line = state.frontLines[defSide] || [];
  const ti = line.findIndex((c) => c.cardId === deadCard.cardId);
  if (ti < 0) return null;
  const applied = [];
  if (!state.carryStatuses) state.carryStatuses = {};
  for (const delta of [-1, 1]) {
    const neighbor = line[ti + delta];
    if (neighbor && (neighbor.count || 0) > 0) {
      setCardStatus(state, neighbor.cardId, { vulnerable: true });
      state.carryStatuses[neighbor.cardId] = {
        ...(state.carryStatuses[neighbor.cardId] || {}),
        vulnerable: true,
      };
      applied.push(neighbor.cardId);
    }
  }
  if (applied.length && killerSide) {
    pushStyle(state, killerSide, "escort_vengeance", {
      cardIds: applied,
    });
  }
  return applied.length ? applied : null;
}

/**
 * Overwhelm kill → splash adjacent OR overflow to base (not both).
 * @returns {{ splashTargetId, splashDamage, splashKilled, suppressOverflow } | { suppressOverflow: false } | null}
 */
function applyOverwhelmKillCombo(
  state,
  atkSide,
  defSide,
  attackerCard,
  killedCard,
  content,
  atkBuff,
  rules,
) {
  if (!killedCard || killedCard.count > 0) return null;
  if (!keywordsForCard(attackerCard).includes("overwhelm")) return null;
  const line = state.frontLines[defSide] || [];
  const ti = line.findIndex((c) => c.cardId === killedCard.cardId);
  let neighbor = null;
  for (const delta of [-1, 1]) {
    const n = line[ti + delta];
    if (n && (n.count || 0) > 0) {
      neighbor = n;
      break;
    }
  }
  if (!neighbor) {
    pushStyle(state, atkSide, "overwhelm_crush", {
      cardId: attackerCard.cardId,
    });
    // No neighbor → overflow to base keeps working
    return { suppressOverflow: false };
  }
  const mult = rules.overwhelmSplashMult ?? 0.35;
  const splashRaw = Math.max(
    1,
    Math.round(
      estimateStrikeDamage(attackerCard, neighbor, content, {
        atkBuff,
        outgoingMult: statusOutgoingMult(state, attackerCard.cardId, rules),
        incomingMult: statusIncomingMult(state, neighbor.cardId, rules),
      }) * mult,
    ),
  );
  const hit = inflictOnCard(neighbor, splashRaw);
  pushStyle(state, atkSide, "overwhelm_splash", {
    cardId: attackerCard.cardId,
    targetId: neighbor.cardId,
  });
  if (hit.killed) {
    applyEscortDeathCombo(state, defSide, neighbor, atkSide);
    moveDeadToDiscard(state, defSide, neighbor);
  }
  return {
    splashTargetId: neighbor.cardId,
    splashDamage: hit.inflicted,
    splashKilled: hit.killed,
    // Splash replaces overflow — no double-dip
    suppressOverflow: true,
  };
}

function notePerfectBlock(state, sideId, blocked, remaining, raw) {
  if (!(blocked > 0 && remaining <= 0 && raw > 0)) return;
  const already = (state.styleMoments || []).some(
    (m) =>
      m.kind === "perfect_block" &&
      m.sideId === sideId &&
      m.round === state.round,
  );
  if (!already) pushStyle(state, sideId, "perfect_block");
}

function noteBaseBreach(state, sideId, remaining) {
  if (!(remaining > 0)) return;
  const already = (state.styleMoments || []).some(
    (m) =>
      m.kind === "base_breach" &&
      m.sideId === sideId &&
      m.round === state.round,
  );
  if (!already) pushStyle(state, sideId, "base_breach");
}

function applySupportOnDeploy(state, sideId, deployedCard, front) {
  if (!keywordsForCard(deployedCard).includes("support")) return;
  const idx = front.findIndex((c) => c.cardId === deployedCard.cardId);
  const right = idx >= 0 ? front[idx + 1] : null;
  // If no right neighbor yet, grant side Block instead
  addBlock(state, sideId, right ? 8 : 6);
  const drawn = drawCards(state, sideId, 1);
  if (drawn.length) {
    pushStyle(state, sideId, "support_rally", { drawn: drawn[0] });
  } else {
    // Empty deck or hand full: extra Block (not +energy)
    addBlock(state, sideId, 4);
    pushStyle(state, sideId, "support_rally", { block: 4 });
  }
}

function findEscortRedirect(state, oppId, targetCardId) {
  const line = state.frontLines[oppId] || [];
  const ti = line.findIndex((c) => c.cardId === targetCardId);
  if (ti < 0) return null;
  if (!state.escortUsed) state.escortUsed = {};
  if (!state.escortUsed[oppId]) state.escortUsed[oppId] = [];
  for (const delta of [-1, 1]) {
    const neighbor = line[ti + delta];
    if (
      neighbor &&
      (neighbor.count || 0) > 0 &&
      keywordsForCard(neighbor).includes("escort") &&
      !state.escortUsed[oppId].includes(neighbor.cardId)
    ) {
      return neighbor;
    }
  }
  return null;
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

function ensureBuff(state, sideId) {
  if (!state.buffs) state.buffs = {};
  if (!state.buffs[sideId]) state.buffs[sideId] = {};
  return state.buffs[sideId];
}

/** Passive starting buff from engagement side stance (map pose). */
export function stanceOpeningBuff(stance) {
  const s = stance || "hold";
  if (s === "assault")
    return { damageMult: 1.15, defenseMult: 0.9, applyVulnerableOnStrike: true, label: "Штурм" };
  if (s === "hold" || s === "fortify")
    return { defenseMult: 1.15, openingBlock: true, retainBlock: true, label: "Удержание" };
  if (s === "skirmish") return { flankBase: true, label: "Перестрелка" };
  if (s === "bombard") return { bombard: true, label: "Обстрел" };
  if (s === "retreat") return { defenseMult: 1.05, label: "Отступление" };
  return { label: s };
}

function makeTacticalCard(sideId, key, opts = {}) {
  return {
    cardId: `${sideId}_tac_${key}_${Math.random().toString(36).slice(2, 6)}`,
    defId: opts.defId || `tactic.${key}`,
    groupId: null,
    role: opts.role || "support",
    count: 1,
    hp: opts.hp ?? 20,
    maxHp: opts.hp ?? 20,
    damage: opts.damage ?? 8,
    defense: opts.defense ?? 0,
    shields: opts.shields ?? 0,
    accuracy: opts.accuracy ?? 55,
    targeting: "line_first",
    filledSlots: {},
    veterancyLevel: 0,
    parentId: null,
    parentKind: null,
    kind: "tactical",
    tactical: true,
    energyCost: opts.energyCost ?? 1,
    tacticLabel: opts.label || key,
  };
}

function stanceTacticalCards(sideId, stance) {
  const s = stance || "hold";
  if (s === "assault") {
    return [
      makeTacticalCard(sideId, "volley", {
        label: "Залп",
        role: "bombard",
        damage: 14,
        energyCost: 1,
      }),
    ];
  }
  if (s === "hold" || s === "fortify") {
    return [
      makeTacticalCard(sideId, "bulwark", {
        label: "Оплот",
        role: "line",
        hp: 35,
        damage: 6,
        defense: 8,
        energyCost: 1,
      }),
    ];
  }
  if (s === "skirmish") {
    return [
      makeTacticalCard(sideId, "flank", {
        label: "Обход",
        role: "screen",
        damage: 10,
        accuracy: 70,
        energyCost: 1,
      }),
    ];
  }
  if (s === "bombard") {
    return [
      makeTacticalCard(sideId, "barrage", {
        label: "Заградогонь",
        role: "bombard",
        damage: 16,
        energyCost: 2,
      }),
    ];
  }
  if (s === "retreat") {
    return [
      makeTacticalCard(sideId, "smoke", {
        label: "Дым",
        role: "support",
        hp: 15,
        damage: 4,
        energyCost: 1,
      }),
    ];
  }
  return [];
}

function techTacticalCards(sideId, unlockedTechs = []) {
  const out = [];
  const ids = unlockedTechs.map(String);
  const has = (re) => ids.some((t) => re.test(t));
  if (has(/shield|armor|hull|defense/i)) {
    out.push(
      makeTacticalCard(sideId, "tech_shield", {
        label: "Тех-щит",
        role: "support",
        hp: 28,
        shields: 12,
        damage: 5,
      }),
    );
  }
  if (has(/weapon|gun|laser|missile|combat|war/i)) {
    out.push(
      makeTacticalCard(sideId, "tech_strike", {
        label: "Орудийный залп",
        role: "line",
        damage: 12,
        accuracy: 65,
      }),
    );
  }
  if (has(/carrier|drone|fighter|scout/i)) {
    out.push(
      makeTacticalCard(sideId, "tech_wing", {
        label: "Крыло",
        role: "screen",
        damage: 9,
        accuracy: 75,
      }),
    );
  }
  return out.slice(0, 2);
}

/** Split thin decks further so a single stack is not a one-card fight. */
function expandThinDeck(cards, sideId, minCards, rng) {
  const out = [...cards];
  let guard = 24;
  while (out.length < minCards && guard-- > 0) {
    // Prefer splitting fattest non-tactical card
    let best = -1;
    let bestCount = 1;
    for (let i = 0; i < out.length; i++) {
      const c = out[i];
      if (c.tactical) continue;
      if ((c.count || 1) > bestCount) {
        bestCount = c.count;
        best = i;
      }
    }
    if (best >= 0 && bestCount >= 2) {
      const c = out[best];
      const half = Math.floor(c.count / 2);
      c.count = c.count - half;
      out.push({
        ...c,
        cardId: `${c.cardId}_s${out.length}`,
        count: half,
      });
      continue;
    }
    // Clone a wing as tactical escort from strongest unit
    const base = out.find((c) => !c.tactical) || out[0];
    if (!base) break;
    out.push(
      makeTacticalCard(sideId, `escort_${out.length}`, {
        label: "Эскорт",
        role: base.role === "capital" ? "screen" : base.role || "line",
        damage: Math.max(4, Math.round((base.damage || 8) * 0.55)),
        hp: Math.max(12, Math.round((base.maxHp || 20) * 0.45)),
        accuracy: Math.min(80, (base.accuracy || 50) + 10),
      }),
    );
  }
  shuffleInPlace(out, rng);
  return out;
}

function unlockedTechsForFaction(factionId) {
  try {
    const ledger = readLedger();
    const eco = ensureFactionEco(ledger, factionId);
    return eco.unlockedTechs || [];
  } catch {
    return [];
  }
}

function refillEnergy(state, rules) {
  const maxE = rules.energyPerRound ?? 4;
  state.maxEnergy = maxE;
  for (const id of Object.keys(state.hands || {})) {
    state.energy[id] = maxE;
  }
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
  const energy = {};
  const stanceOrderUsedRound = emptySideMap(ids, () => 0);
  const buffs = emptySideMap(ids, () => ({}));
  const block = emptySideMap(ids, () => 0);
  const openingLabels = {};
  const techMods = {};
  const reorderFreeLeft = emptySideMap(ids, () => rules.freeReorderPerRound ?? 1);

  for (let si = 0; si < ids.length; si++) {
    const side = engagement.sides[si];
    const fid = side.factionId;
    const mods = techModsForFaction(fid);
    techMods[fid] = mods;
    const groups = gatherGroups(world, side, theater, content, engagement);
    let cards = [];
    groups.forEach((g, gi) => {
      cards.push(...groupToCards(g, fid, gi));
    });
    cards.push(...stanceTacticalCards(fid, side.stance));
    cards.push(...techTacticalCards(fid, unlockedTechsForFaction(fid)));
    cards = expandThinDeck(cards, fid, rules.minDeckCards ?? 6, rng);
    applyTechOverlaysToCards(cards, mods);
    const dealt = dealWithDeployOrder(cards, rules.handSize ?? 4, rng);
    hands[fid] = dealt.hand;
    decks[fid] = dealt.deck;
    const pool = [...hands[fid], ...decks[fid]].filter((c) => !c.tactical);
    baseHp[fid] = Math.max(
      40,
      Math.round(totalBaseHp(pool.length ? pool : [...hands[fid], ...decks[fid]]) * 0.35),
    );
    energy[fid] = rules.energyPerRound ?? 4;

    const open = stanceOpeningBuff(side.stance);
    buffs[fid] = { ...open };
    delete buffs[fid].label;
    if (mods.damageMult && mods.damageMult !== 1) {
      buffs[fid].damageMult =
        (buffs[fid].damageMult || 1) * mods.damageMult;
    }
    openingLabels[fid] = open.label || side.stance || "hold";
    if (open.openingBlock) {
      block[fid] = rules.holdOpeningBlock ?? 12;
    }
    if (mods.blockBonus) {
      block[fid] = (block[fid] || 0) + mods.blockBonus;
    }
    if (mods.freeReorder) {
      reorderFreeLeft[fid] = (reorderFreeLeft[fid] || 0) + 1;
    }
  }

  const state = {
    engagementId: engagement.id,
    hands,
    decks,
    discard,
    frontLines,
    baseHp,
    baseHpMax: { ...baseHp },
    energy,
    maxEnergy: rules.energyPerRound ?? 4,
    maxFront: rules.maxFront ?? 5,
    readySides: [],
    stanceOrderUsedRound,
    buffs,
    block,
    statuses: {},
    intents: emptySideMap(ids, () => null),
    struckThisRound: emptySideMap(ids, () => []),
    escortUsed: emptySideMap(ids, () => []),
    reorderFreeLeft,
    techMods,
    openingStance: openingLabels,
    openingBuffs: Object.fromEntries(
      ids.map((id) => {
        const o = stanceOpeningBuff(
          engagement.sides.find((s) => s.factionId === id)?.stance,
        );
        const { label: _l, ...rest } = o;
        return [id, rest];
      }),
    ),
    phase: "plan",
    round: 1,
    currentSide: ids[0],
    status: "active",
    log: [
      {
        round: 1,
        side: ids[0],
        action: "round_start",
        outcome: {
          label: `Тактический залп · ${Object.values(openingLabels).join(" vs ")}`,
        },
      },
    ],
    winnerFactionId: null,
    clashEvents: [],
    clashSeq: 0,
    styleMoments: [],
    initialCounts: {},
  };

  // Snapshot composition counts for loss reporting
  for (const id of ids) {
    for (const c of [...hands[id], ...decks[id]]) {
      if (!c || c.tactical || !c.parentId) continue;
      const key = stackKey(c);
      state.initialCounts[key] = (state.initialCounts[key] || 0) + (c.count || 0);
    }
  }

  engagement.mode = "card";
  engagement.status = "active";
  engagement.cardBattle = state;
  return { ok: true, state };
}

function opponentId(state, sideId) {
  return Object.keys(state.hands).find((id) => id !== sideId) || null;
}

function drawCards(state, sideId, n, content = getContent()) {
  const rules = cardBattleRules(content);
  const maxHand = rules.maxHandSize ?? Math.max(7, rules.handSize ?? 4);
  const hand = state.hands[sideId] || (state.hands[sideId] = []);
  const deck = state.decks[sideId] || (state.decks[sideId] = []);
  const drawn = [];
  for (let i = 0; i < n && deck.length > 0; i++) {
    if (hand.length >= maxHand) break;
    const c = deck.shift();
    hand.push(c);
    drawn.push(c.cardId);
  }
  return drawn;
}

function moveDeadToDiscard(state, sideId, card) {
  if (!card || card.count > 0) return false;
  const fl = state.frontLines[sideId] || [];
  state.frontLines[sideId] = fl.filter((c) => c.cardId !== card.cardId);
  state.discard[sideId] = state.discard[sideId] || [];
  state.discard[sideId].push(card);
  return true;
}

function purgeDeadFronts(state) {
  for (const id of Object.keys(state.frontLines || {})) {
    const live = [];
    for (const c of state.frontLines[id] || []) {
      if (c.count > 0) live.push(c);
      else {
        state.discard[id] = state.discard[id] || [];
        state.discard[id].push(c);
      }
    }
    state.frontLines[id] = live;
  }
}

function sideHasCards(state, sideId) {
  return (
    (state.hands[sideId]?.length || 0) +
      (state.decks[sideId]?.length || 0) +
      (state.frontLines[sideId]?.length || 0) >
    0
  );
}

export function checkEndCondition(state, content = getContent()) {
  const rules = cardBattleRules(content);
  if (state.status === "resolved") return true;
  if (state.round > rules.maxRounds) return true;
  const ids = Object.keys(state.hands);
  for (const id of ids) {
    if ((state.baseHp[id] || 0) <= 0) return true;
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
    Math.max(0, state.baseHp[id] || 0) +
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

function isReady(state, sideId) {
  return (state.readySides || []).includes(sideId);
}

function markReady(state, sideId) {
  if (!state.readySides) state.readySides = [];
  if (!state.readySides.includes(sideId)) state.readySides.push(sideId);
}

function bothReady(state) {
  const ids = Object.keys(state.hands || {});
  return ids.length >= 2 && ids.every((id) => isReady(state, id));
}

function applyStrikeDamage(state, attackerSide, card, targetId, content) {
  const rules = cardBattleRules(content);
  const opp = opponentId(state, attackerSide);
  if (!opp) return { ok: false, error: "no opponent" };
  const buff = state.buffs?.[attackerSide] || {};
  const defBuff = state.buffs?.[opp] || {};
  const pierce = !!getCardStatus(state, card.cardId).focus;
  const outgoing = statusOutgoingMult(state, card.cardId, rules);

  if (targetId === "base" || !targetId) {
    const oppFront = state.frontLines[opp] || [];
    if (oppFront.length > 0 && !buff.flankBase && !buff.bombard) {
      return { ok: false, error: "Фронт врага блокирует удар по базе" };
    }
    const raw = estimateStrikeDamage(card, null, content, {
      atkBuff: buff,
      outgoingMult: outgoing,
    });
    const { remaining, blocked } = applyThroughBlock(state, opp, raw, {
      pierceBlock: pierce,
    });
    notePerfectBlock(state, opp, blocked, remaining, raw);
    if (pierce) clearSpentFocus(state, card.cardId);
    state.baseHp[opp] = Math.max(0, (state.baseHp[opp] || 0) - remaining);
    if (remaining > 0) noteBaseBreach(state, attackerSide, remaining);
    state.log.push({
      round: state.round,
      side: attackerSide,
      action: "base_hit",
      cardId: card.cardId,
      targetId: "base",
      outcome: { damageDealt: remaining, blocked, raw },
    });
    return {
      ok: true,
      pairResult: {
        damageDealt: remaining,
        blocked,
        targetId: "base",
      },
    };
  }

  let oppLine = state.frontLines[opp] || [];
  let defender = oppLine.find((c) => c.cardId === targetId);
  if (!defender) return { ok: false, error: "цель не на фронте" };
  if ((defender.count || 0) <= 0) return { ok: false, error: "цель уже уничтожена" };

  // Escort redirect (once per escort card per round)
  const escort = findEscortRedirect(state, opp, targetId);
  let redirected = false;
  if (escort) {
    state.escortUsed[opp].push(escort.cardId);
    defender = escort;
    redirected = true;
  }

  const incoming = statusIncomingMult(state, defender.cardId, rules);
  const pairResult = resolveCardPair(card, defender, content, buff, defBuff, {
    outgoingMult: outgoing,
    incomingMult: incoming,
  });

  if (pierce) clearSpentFocus(state, card.cardId);

  if (buff.applyVulnerableOnStrike && defender.count > 0) {
    setCardStatus(state, defender.cardId, { vulnerable: true });
    pairResult.statusApplied = "vulnerable";
  }

  if (redirected && defender.count > 0) {
    pushStyle(state, opp, "escort_save", { cardId: defender.cardId });
  }

  const killedTarget = defender.count <= 0;
  if (killedTarget) {
    applyEscortDeathCombo(state, opp, defender, attackerSide);
    const splash = applyOverwhelmKillCombo(
      state,
      attackerSide,
      opp,
      card,
      defender,
      content,
      buff,
      rules,
    );
    if (splash) {
      pairResult.splashTargetId = splash.splashTargetId;
      pairResult.splashDamage = splash.splashDamage;
      pairResult.splashKilled = splash.splashKilled;
      if (splash.suppressOverflow) pairResult.overflowToBase = 0;
    }
  }

  // Overwhelm overflow to base (suppressed if splash already fired)
  if (pairResult.overflowToBase > 0) {
    const { remaining, blocked } = applyThroughBlock(
      state,
      opp,
      pairResult.overflowToBase,
      { pierceBlock: false },
    );
    notePerfectBlock(state, opp, blocked, remaining, pairResult.overflowToBase);
    state.baseHp[opp] = Math.max(0, (state.baseHp[opp] || 0) - remaining);
    pairResult.overflowToBase = remaining;
    pairResult.overflowBlocked = blocked;
    if (remaining > 0) noteBaseBreach(state, attackerSide, remaining);
  }

  state.log.push({
    round: state.round,
    side: attackerSide,
    action: "resolve",
    cardId: card.cardId,
    targetId: defender.cardId,
    outcome: { ...pairResult, redirected, killedTarget },
  });
  moveDeadToDiscard(state, opp, defender);
  moveDeadToDiscard(state, attackerSide, card);
  return {
    ok: true,
    pairResult: {
      ...pairResult,
      redirected,
      killedTarget,
      targetId: defender.cardId,
    },
  };
}

/**
 * Play: deploy to front (no target) OR strike from hand at target.
 * @param {{ targetId?: string, mode?: 'deploy'|'strike' }} opts
 */
export function playCardRound(
  state,
  sideId,
  cardId,
  content = getContent(),
  opts = {},
) {
  if (!state || state.status !== "active") {
    return { ok: false, error: "battle not active" };
  }
  if (state.phase !== "plan") {
    return { ok: false, error: "сейчас не фаза планирования" };
  }
  if (isReady(state, sideId)) {
    return { ok: false, error: "вы уже готовы — ждите стычку" };
  }

  const hand = state.hands[sideId] || [];
  const idx = hand.findIndex((c) => c.cardId === cardId);
  if (idx < 0) return { ok: false, error: "card not in hand" };

  const card = hand[idx];
  if ((card.count || 0) <= 0) return { ok: false, error: "карта уничтожена" };
  const rules = cardBattleRules(content);
  const targetId = opts.targetId;
  const mode =
    opts.mode ||
    (targetId ? "strike" : "deploy");
  const cost = card.energyCost ?? cardEnergyCost(card);
  const energy = state.energy?.[sideId] ?? 0;
  const need =
    mode === "focus"
      ? Math.min(cost, rules.focusEnergyCost ?? 1)
      : cost;
  if (energy < need) {
    return { ok: false, error: `Недостаточно энергии (нужно ${need})` };
  }

  const maxFront = state.maxFront ?? 5;
  const front = state.frontLines[sideId] || (state.frontLines[sideId] = []);

  if (mode === "deploy") {
    if (front.length >= maxFront) {
      return {
        ok: false,
        error: `Фронт полон (${maxFront}) — атакуйте с выбором цели`,
      };
    }
    hand.splice(idx, 1);
    front.push(card);
    state.energy[sideId] = energy - cost;
    applySupportOnDeploy(state, sideId, card, front);
    setIntent(state, sideId, {
      kind: "deploy",
      cardId: card.cardId,
      label: "выставляет карту",
    });
    state.log.push({
      round: state.round,
      side: sideId,
      action: "deploy",
      cardId: card.cardId,
    });
    return { ok: true, state, pairResult: null };
  }

  if (mode === "brace") {
    hand.splice(idx, 1);
    state.energy[sideId] = energy - cost;
    const gain = Math.max(
      rules.braceBlockMin ?? 6,
      Math.round(
        (card.defense || 0) * 0.2 +
          (card.shields || 0) * 0.15 +
          (card.damage || 8) * (rules.braceBlockFactor ?? 0.35),
      ),
    );
    addBlock(state, sideId, gain);
    state.discard[sideId] = state.discard[sideId] || [];
    state.discard[sideId].push(card);
    setIntent(state, sideId, {
      kind: "brace",
      cardId: card.cardId,
      label: `оплот +${gain}`,
    });
    state.log.push({
      round: state.round,
      side: sideId,
      action: "brace",
      cardId: card.cardId,
      outcome: { blockGained: gain, label: `Block +${gain}` },
    });
    return { ok: true, state, pairResult: { blockGained: gain } };
  }

  if (mode === "focus") {
    if (!targetId || targetId === "base") {
      return { ok: false, error: "Focus: укажите карту врага" };
    }
    const focusCost = Math.min(cost, rules.focusEnergyCost ?? 1);
    if (energy < focusCost) {
      return { ok: false, error: "Недостаточно энергии" };
    }
    const opp = opponentId(state, sideId);
    const def = (state.frontLines[opp] || []).find((c) => c.cardId === targetId);
    if (!def) return { ok: false, error: "цель не на фронте" };
    if ((def.count || 0) <= 0) return { ok: false, error: "цель уже уничтожена" };
    hand.splice(idx, 1);
    state.energy[sideId] = energy - focusCost;
    setCardStatus(state, targetId, { weak: true });
    // Also grant focus pierce on next strike from our cheapest front / self marker
    const myFront = state.frontLines[sideId] || [];
    if (myFront[0]) setCardStatus(state, myFront[0].cardId, { focus: true });
    state.discard[sideId] = state.discard[sideId] || [];
    state.discard[sideId].push(card);
    setIntent(state, sideId, {
      kind: "focus",
      cardId: card.cardId,
      targetId,
      label: "фокус-огонь",
    });
    state.log.push({
      round: state.round,
      side: sideId,
      action: "focus",
      cardId: card.cardId,
      targetId,
      outcome: { statusApplied: "weak", label: "Weak на цели" },
    });
    return { ok: true, state, pairResult: { statusApplied: "weak", targetId } };
  }

  // Strike from hand at target — card is spent (discarded) after strike
  if (!targetId) {
    return { ok: false, error: "Укажите цель атаки" };
  }
  hand.splice(idx, 1);
  state.energy[sideId] = energy - cost;
  const strike = applyStrikeDamage(state, sideId, card, targetId, content);
  if (!strike.ok) {
    // rollback
    hand.splice(idx, 0, card);
    state.energy[sideId] = energy;
    return strike;
  }
  state.discard[sideId] = state.discard[sideId] || [];
  state.discard[sideId].push(card);
  setIntent(state, sideId, {
    kind: "strike",
    cardId: card.cardId,
    targetId,
    label: "удар из руки",
  });
  state.log.push({
    round: state.round,
    side: sideId,
    action: "strike",
    cardId: card.cardId,
    targetId,
  });
  purgeDeadFronts(state);
  if (checkEndCondition(state, content)) {
    state.status = "resolved";
    state.phase = "resolved";
    settleWinner(state);
  }
  return { ok: true, state, pairResult: strike.pairResult };
}

/** Strike with a card already on your front (first per round free, then ⚡1). */
export function strikeWithFrontCard(
  state,
  sideId,
  cardId,
  targetId,
  content = getContent(),
) {
  if (!state || state.status !== "active" || state.phase !== "plan") {
    return { ok: false, error: "battle not in plan phase" };
  }
  if (isReady(state, sideId)) {
    return { ok: false, error: "вы уже готовы" };
  }
  const cost = frontStrikeEnergyCost(state, sideId, cardId);
  const energy = state.energy?.[sideId] ?? 0;
  if (energy < cost) {
    return { ok: false, error: "Недостаточно энергии" };
  }
  const front = state.frontLines[sideId] || [];
  const card = front.find((c) => c.cardId === cardId);
  if (!card) return { ok: false, error: "карта не на фронте" };
  if ((card.count || 0) <= 0) return { ok: false, error: "карта уничтожена" };
  if (!targetId) return { ok: false, error: "Укажите цель" };

  state.energy[sideId] = energy - cost;
  const strike = applyStrikeDamage(state, sideId, card, targetId, content);
  if (!strike.ok) {
    state.energy[sideId] = energy;
    return strike;
  }
  markStruck(state, sideId, cardId);
  setIntent(state, sideId, {
    kind: "strike",
    cardId,
    targetId,
    label: "удар с фронта",
  });
  state.log.push({
    round: state.round,
    side: sideId,
    action: "strike",
    cardId,
    targetId,
    outcome: { energyCost: cost },
  });
  purgeDeadFronts(state);
  if (checkEndCondition(state, content)) {
    state.status = "resolved";
    state.phase = "resolved";
    settleWinner(state);
  }
  return { ok: true, state, pairResult: strike.pairResult };
}

/** Reorder a front card (free N times / round, then ⚡1). */
export function reorderFrontCard(
  state,
  sideId,
  cardId,
  toIndex,
  content = getContent(),
) {
  if (!state || state.status !== "active" || state.phase !== "plan") {
    return { ok: false, error: "не фаза планирования" };
  }
  if (isReady(state, sideId)) {
    return { ok: false, error: "вы уже готовы" };
  }
  const front = state.frontLines[sideId] || [];
  const from = front.findIndex((c) => c.cardId === cardId);
  if (from < 0) return { ok: false, error: "карта не на фронте" };
  if ((front[from].count || 0) <= 0) return { ok: false, error: "карта уничтожена" };
  const dest = Math.max(0, Math.min(front.length - 1, Number(toIndex) | 0));
  if (dest === from) return { ok: true, state };

  const freeLeft = state.reorderFreeLeft?.[sideId] ?? 0;
  const energy = state.energy?.[sideId] ?? 0;
  let cost = 0;
  if (freeLeft > 0) {
    state.reorderFreeLeft[sideId] = freeLeft - 1;
  } else {
    cost = 1;
    if (energy < 1) return { ok: false, error: "Недостаточно энергии" };
    state.energy[sideId] = energy - 1;
  }

  const [card] = front.splice(from, 1);
  front.splice(dest, 0, card);
  setIntent(state, sideId, {
    kind: "reorder",
    cardId,
    label: `перестройка → слот ${dest + 1}`,
  });
  state.log.push({
    round: state.round,
    side: sideId,
    action: "reorder",
    cardId,
    outcome: { toIndex: dest, energyCost: cost, label: `слот ${dest + 1}` },
  });
  return { ok: true, state };
}

/** Concede: opponent wins, retreater keeps more of the fleet. */
export function retreatFromBattle(state, sideId, content = getContent()) {
  if (!state || state.status !== "active") {
    return { ok: false, error: "battle not active" };
  }
  const opp = opponentId(state, sideId);
  if (!opp) return { ok: false, error: "no opponent" };
  state.retreatedFactionId = sideId;
  state.winnerFactionId = opp;
  state.status = "resolved";
  state.phase = "resolved";
  state.log.push({
    round: state.round,
    side: sideId,
    action: "retreat",
    outcome: { label: "Отступление — флот сохранён частично" },
  });
  return { ok: true, state, retreated: true };
}

export const STANCE_ORDERS = {
  assault: {
    id: "assault",
    label: "Залп",
    hint: "+урон, −защита до стычки",
  },
  hold: {
    id: "hold",
    label: "Щит",
    hint: "Поглощение урона",
  },
  skirmish: {
    id: "skirmish",
    label: "Обход",
    hint: "Удар по базе мимо фронта",
  },
  retreat: {
    id: "retreat",
    label: "Отход",
    hint: "Снять карту с фронта в руку",
  },
  bombard: {
    id: "bombard",
    label: "Обстрел",
    hint: "Сильный удар по базе",
  },
  fortify: {
    id: "hold",
    label: "Щит",
    hint: "Поглощение урона",
  },
};

export function applyStanceOrder(
  state,
  sideId,
  stance,
  content = getContent(),
  opts = {},
) {
  if (!state || state.status !== "active" || state.phase !== "plan") {
    return { ok: false, error: "не фаза планирования" };
  }
  if (isReady(state, sideId)) {
    return { ok: false, error: "вы уже готовы" };
  }
  const rules = cardBattleRules(content);
  const cd = rules.stanceOrderCooldownRounds ?? 2;
  const last = state.stanceOrderUsedRound?.[sideId] ?? 0;
  if (last > 0 && state.round - last < cd) {
    return {
      ok: false,
      error: `Приказ перезаряжается (ещё ${cd - (state.round - last)} р.)`,
    };
  }
  const energy = state.energy?.[sideId] ?? 0;
  if (energy < 1) return { ok: false, error: "Недостаточно энергии" };

  const orderKey = STANCE_ORDERS[stance] ? stance : "hold";
  const buff = ensureBuff(state, sideId);

  if (orderKey === "assault") {
    buff.damageMult = 1.35;
    buff.defenseMult = 0.75;
    buff.applyVulnerableOnStrike = true;
  } else if (orderKey === "hold" || orderKey === "fortify") {
    buff.defenseMult = 1.35;
    buff.retainBlock = true;
    addBlock(state, sideId, rules.holdOrderBlock ?? 28);
  } else if (orderKey === "skirmish") {
    buff.flankBase = true;
  } else if (orderKey === "bombard") {
    buff.bombard = true;
  } else if (orderKey === "retreat") {
    const front = state.frontLines[sideId] || [];
    if (!front.length) return { ok: false, error: "Фронт пуст" };
    const pickId = opts.cardId || front[front.length - 1].cardId;
    const fi = front.findIndex((c) => c.cardId === pickId);
    if (fi < 0) return { ok: false, error: "карта не на фронте" };
    if ((front[fi].count || 0) <= 0) return { ok: false, error: "карта уничтожена" };
    const [pulled] = front.splice(fi, 1);
    state.hands[sideId] = state.hands[sideId] || [];
    state.hands[sideId].push(pulled);
  }

  state.energy[sideId] = energy - 1;
  if (!state.stanceOrderUsedRound) state.stanceOrderUsedRound = {};
  state.stanceOrderUsedRound[sideId] = state.round;
  setIntent(state, sideId, {
    kind: "order",
    orderId: orderKey,
    label: STANCE_ORDERS[orderKey]?.label || orderKey,
  });
  state.log.push({
    round: state.round,
    side: sideId,
    action: "stance_order",
    orderId: orderKey,
    outcome: { label: STANCE_ORDERS[orderKey]?.label || orderKey },
  });
  return { ok: true, state };
}

function endOfRoundClash(state, content) {
  const rules = cardBattleRules(content);
  const ids = Object.keys(state.hands);
  if (ids.length < 2) return;
  state.phase = "clash";
  state.clashEvents = [];
  state.clashSeq = (state.clashSeq || 0) + 1;
  const [a, b] = ids;
  const lineA = [...(state.frontLines[a] || [])];
  const lineB = [...(state.frontLines[b] || [])];
  const n = Math.max(lineA.length, lineB.length);

  for (const c of lineA) if (c) c._aliveAtClashStart = c.count > 0;
  for (const c of lineB) if (c) c._aliveAtClashStart = c.count > 0;

  const clashLane = (atkSide, defSide, ca, cb, laneIndex) => {
    if (!ca || ca.count <= 0) return;
    const atkBuff = state.buffs?.[atkSide] || {};
    const defBuff = state.buffs?.[defSide] || {};
    const outgoing = statusOutgoingMult(state, ca.cardId, rules);
    const styleAt = (state.styleMoments || []).length;

    if (cb && cb._aliveAtClashStart) {
      let defender = cb;
      let redirected = false;
      const escort = findEscortRedirect(state, defSide, cb.cardId);
      if (escort) {
        state.escortUsed[defSide].push(escort.cardId);
        defender = escort;
        redirected = true;
      }
      const beforeAtk = ca.count;
      const beforeDef = defender.count;
      const incoming = statusIncomingMult(state, defender.cardId, rules);
      const r1 = resolveCardPair(ca, defender, content, atkBuff, defBuff, {
        outgoingMult: outgoing,
        incomingMult: incoming,
      });
      if (redirected && defender.count > 0) {
        pushStyle(state, defSide, "escort_save", { cardId: defender.cardId });
      }
      const killedTarget = defender.count <= 0;
      let splash = null;
      if (killedTarget) {
        applyEscortDeathCombo(state, defSide, defender, atkSide);
        splash = applyOverwhelmKillCombo(
          state,
          atkSide,
          defSide,
          ca,
          defender,
          content,
          atkBuff,
          rules,
        );
        if (splash?.suppressOverflow) r1.overflowToBase = 0;
      }
      if (r1.overflowToBase > 0) {
        const { remaining, blocked } = applyThroughBlock(
          state,
          defSide,
          r1.overflowToBase,
        );
        notePerfectBlock(state, defSide, blocked, remaining, r1.overflowToBase);
        state.baseHp[defSide] = Math.max(
          0,
          (state.baseHp[defSide] || 0) - remaining,
        );
        r1.overflowToBase = remaining;
        r1.blocked = (r1.blocked || 0) + blocked;
        if (remaining > 0) noteBaseBreach(state, atkSide, remaining);
      }
      const newStyles = (state.styleMoments || [])
        .slice(styleAt)
        .map((s) => s.label);
      state.clashEvents.push({
        kind: "pair",
        side: atkSide,
        cardId: ca.cardId,
        targetId: defender.cardId,
        laneIndex,
        damageDealt: r1.damageDealt,
        blocked: r1.blocked,
        overflowToBase: r1.overflowToBase,
        redirected,
        killedTarget,
        killedAttacker: ca.count <= 0,
        lostA: Math.max(0, beforeAtk - ca.count),
        lostB: Math.max(0, beforeDef - defender.count),
        splashTargetId: splash?.splashTargetId,
        splashDamage: splash?.splashDamage,
        styleTags: newStyles,
      });
      state.log.push({
        round: state.round,
        side: atkSide,
        action: "clash",
        cardId: ca.cardId,
        targetId: defender.cardId,
        outcome: { ...r1, splash, styleTags: newStyles },
      });
      return;
    }

    // Open lane → base (Siege / Overwhelm scale)
    const raw = estimateStrikeDamage(ca, null, content, {
      atkBuff,
      outgoingMult: outgoing,
    });
    const { remaining, blocked } = applyThroughBlock(state, defSide, raw);
    notePerfectBlock(state, defSide, blocked, remaining, raw);
    state.baseHp[defSide] = Math.max(
      0,
      (state.baseHp[defSide] || 0) - remaining,
    );
    if (remaining > 0) noteBaseBreach(state, atkSide, remaining);
    const newStyles = (state.styleMoments || [])
      .slice(styleAt)
      .map((s) => s.label);
    state.clashEvents.push({
      kind: "base",
      side: atkSide,
      cardId: ca.cardId,
      targetId: "base",
      laneIndex,
      damageDealt: remaining,
      blocked,
      styleTags: newStyles,
    });
    state.log.push({
      round: state.round,
      side: atkSide,
      action: "base_hit",
      cardId: ca.cardId,
      targetId: "base",
      outcome: { damageDealt: remaining, blocked, label: "залп по базе" },
    });
  };

  for (let i = 0; i < n; i++) {
    const ca = lineA[i];
    const cb = lineB[i];
    // True same-lane simultaneity: both fire if alive at lane open,
    // even if the other side's strike kills them mid-lane.
    const aFires = !!(ca && ca.count > 0);
    const bFires = !!(cb && cb.count > 0);
    const cbAtk = bFires && aFires ? { ...cb } : cb;
    if (aFires) clashLane(a, b, ca, cb, i);
    if (bFires) clashLane(b, a, cbAtk, ca, i);
  }

  // Double kill style (2+ kills by same side this clash)
  const afterLanes = (state.styleMoments || []).length;
  const killsBySide = {};
  for (const ev of state.clashEvents) {
    if (!ev.killedTarget) continue;
    killsBySide[ev.side] = (killsBySide[ev.side] || 0) + 1;
  }
  for (const [sideId, kills] of Object.entries(killsBySide)) {
    if (kills >= 2) pushStyle(state, sideId, "double_kill", { kills });
  }

  const finale = (state.styleMoments || []).slice(afterLanes);
  if (finale.length && state.clashEvents.length) {
    const last = state.clashEvents[state.clashEvents.length - 1];
    last.styleTags = [...(last.styleTags || []), ...finale.map((s) => s.label)];
  }

  purgeDeadFronts(state);
}

function startNextRound(state, content) {
  const rules = cardBattleRules(content);
  state.round += 1;
  state.readySides = [];
  // Keep clashEvents for client cinema; next clash() resets the array.
  const ids = Object.keys(state.hands);

  // Block decay (hold retains a fraction)
  const block = ensureBlock(state);
  for (const id of ids) {
    const retain =
      state.buffs?.[id]?.retainBlock || state.openingBuffs?.[id]?.retainBlock
        ? rules.blockRetainHold ?? 0.25
        : 0;
    block[id] = Math.floor((block[id] || 0) * retain);
  }

  // Re-apply opening stance buffs each round (map pose matters).
  state.buffs = {};
  for (const id of ids) {
    state.buffs[id] = { ...(state.openingBuffs?.[id] || {}) };
    if (state.openingBuffs?.[id]?.openingBlock) {
      addBlock(state, id, rules.holdOpeningBlock ?? 12);
    }
  }

  // Decay one-shot statuses, then re-apply clash carry (escort vengeance).
  const carry = { ...(state.carryStatuses || {}) };
  state.carryStatuses = {};
  state.statuses = {};
  const liveIds = new Set();
  for (const id of ids) {
    for (const c of state.frontLines[id] || []) {
      if (c?.cardId && (c.count || 0) > 0) liveIds.add(c.cardId);
    }
  }
  for (const [cardId, patch] of Object.entries(carry)) {
    if (!liveIds.has(cardId)) continue;
    setCardStatus(state, cardId, patch);
  }

  state.struckThisRound = emptySideMap(ids, () => []);
  state.escortUsed = emptySideMap(ids, () => []);
  state.intents = emptySideMap(ids, () => null);
  state.reorderFreeLeft = emptySideMap(
    ids,
    () => rules.freeReorderPerRound ?? 1,
  );
  for (const id of ids) {
    if (state.techMods?.[id]?.freeReorder) {
      state.reorderFreeLeft[id] = (state.reorderFreeLeft[id] || 0) + 1;
    }
  }

  refillEnergy(state, rules);
  state.phase = "plan";
  applyBraceAtRoundStart(state);
  for (const id of ids) {
    drawCards(state, id, rules.drawPerRound || 1);
  }
  state.currentSide = ids[0];
  state.log.push({
    round: state.round,
    side: ids[0],
    action: "round_start",
    outcome: { label: `Раунд ${state.round}` },
  });
}

/**
 * Mark side ready; when both ready → clash → next round or end.
 */
export function readyRound(state, sideId, content = getContent()) {
  if (!state || state.status !== "active") {
    return { ok: false, error: "battle not active" };
  }
  if (state.phase !== "plan") {
    return { ok: false, error: "не фаза планирования" };
  }
  if (!Object.keys(state.hands).includes(sideId)) {
    return { ok: false, error: "not a side" };
  }
  markReady(state, sideId);
  setIntent(state, sideId, { kind: "pass", label: "готов к стычке" });
  state.log.push({ round: state.round, side: sideId, action: "ready" });

  if (!bothReady(state)) {
    return { ok: true, state, clashed: false };
  }

  endOfRoundClash(state, content);
  if (checkEndCondition(state, content)) {
    state.status = "resolved";
    state.phase = "resolved";
    settleWinner(state);
    return { ok: true, state, clashed: true };
  }

  const rules = cardBattleRules(content);
  if (state.round >= rules.maxRounds) {
    state.status = "resolved";
    state.phase = "resolved";
    settleWinner(state);
    return { ok: true, state, clashed: true };
  }

  startNextRound(state, content);
  if (checkEndCondition(state, content)) {
    state.status = "resolved";
    state.phase = "resolved";
    settleWinner(state);
  }
  return { ok: true, state, clashed: true };
}

/** Legacy pass = ready. */
export function passCardRound(state, sideId, content = getContent()) {
  return readyRound(state, sideId, content);
}

/** Free draw no longer consumes turn — costs 1 energy instead. */
export function drawFromDeck(state, sideId, content = getContent()) {
  if (!state || state.status !== "active" || state.phase !== "plan") {
    return { ok: false, error: "battle not active" };
  }
  if (isReady(state, sideId)) {
    return { ok: false, error: "вы уже готовы" };
  }
  const deck = state.decks[sideId] || [];
  if (deck.length === 0) return { ok: false, error: "deck empty" };
  const energy = state.energy?.[sideId] ?? 0;
  if (energy < 1) return { ok: false, error: "Недостаточно энергии" };
  const drawn = drawCards(state, sideId, 1);
  state.energy[sideId] = energy - 1;
  state.log.push({
    round: state.round,
    side: sideId,
    action: "draw",
    cardId: drawn[0],
  });
  return { ok: true, state, drawn };
}

export function factionIsAiSeat(world, factionId) {
  const f = (world?.factions ?? []).find((x) => x.id === factionId);
  if (!f) return true;
  if (f.aiControlled === true) return true;
  // Empty / missing password → NPC seat
  return !(f.password && String(f.password).length > 0);
}

/**
 * Simple AI: deploy cheap cards, strike weak matchups / open base, then ready.
 * Writes intent before each action so the opponent sees telegraph.
 */
export function runAiPlan(state, sideId, content = getContent()) {
  if (!state || state.status !== "active" || state.phase !== "plan") {
    return { ok: false, error: "not plan" };
  }
  if (isReady(state, sideId)) return { ok: true, state };

  const opp = opponentId(state, sideId);
  const maxFront = state.maxFront ?? 5;
  let guard = 12;

  while (guard-- > 0 && !isReady(state, sideId)) {
    const hand = state.hands[sideId] || [];
    const front = state.frontLines[sideId] || [];
    const oppFront = opp ? state.frontLines[opp] || [] : [];
    const energy = state.energy[sideId] || 0;

    // Prefer deploy until a useful front line is filled
    const fillTarget = Math.min(maxFront, 3);
    if (front.length < maxFront) {
      const deployable = hand
        .filter((c) => (c.energyCost ?? cardEnergyCost(c)) <= energy)
        .sort(
          (a, b) =>
            (a.energyCost ?? cardEnergyCost(a)) -
            (b.energyCost ?? cardEnergyCost(b)),
        );
      if (deployable[0] && front.length < fillTarget) {
        setIntent(state, sideId, {
          kind: "deploy",
          cardId: deployable[0].cardId,
          label: "выставит карту",
        });
        const r = playCardRound(state, sideId, deployable[0].cardId, content, {
          mode: "deploy",
        });
        if (r.ok) continue;
      }
    }

    // Strike: pick best matchup vs opp front or base
    if (opp) {
      let best = null;
      for (const c of hand) {
        const cost = c.energyCost ?? cardEnergyCost(c);
        if (cost > energy) continue;
        if (oppFront.length === 0) {
          const score = cardPower(c, content, null);
          if (!best || score > best.score) {
            best = { cardId: c.cardId, targetId: "base", score, from: "hand" };
          }
        } else {
          for (const t of oppFront) {
            if ((t.count || 0) <= 0) continue;
            const score =
              cardPower(c, content, t) *
              roleMatchupMult(c.role, t.role, content);
            if (!best || score > best.score) {
              best = {
                cardId: c.cardId,
                targetId: t.cardId,
                score,
                from: "hand",
              };
            }
          }
        }
      }
      for (const c of front) {
        if ((c.count || 0) <= 0) continue;
        const fCost = frontStrikeEnergyCost(state, sideId, c.cardId);
        if (energy < fCost) continue;
        if (oppFront.length === 0) {
          const score = cardPower(c, content, null) * 0.9;
          if (!best || score > best.score) {
            best = { cardId: c.cardId, targetId: "base", score, from: "front" };
          }
        } else {
          for (const t of oppFront) {
            if ((t.count || 0) <= 0) continue;
            const score =
              cardPower(c, content, t) *
              roleMatchupMult(c.role, t.role, content);
            if (!best || score > best.score) {
              best = {
                cardId: c.cardId,
                targetId: t.cardId,
                score,
                from: "front",
              };
            }
          }
        }
      }
      if (best) {
        setIntent(state, sideId, {
          kind: "strike",
          cardId: best.cardId,
          targetId: best.targetId,
          label:
            best.targetId === "base" ? "удар по базе" : "удар по фронту",
        });
        const r =
          best.from === "front"
            ? strikeWithFrontCard(
                state,
                sideId,
                best.cardId,
                best.targetId,
                content,
              )
            : playCardRound(state, sideId, best.cardId, content, {
                mode: "strike",
                targetId: best.targetId,
              });
        if (r.ok) continue;
      }
    }

    break;
  }

  setIntent(state, sideId, { kind: "pass", label: "готов к стычке" });
  return readyRound(state, sideId, content);
}

/**
 * After a human action, auto-resolve AI seats that are not ready.
 */
export function maybeRunAiSeats(state, world, content = getContent()) {
  if (!state || state.status !== "active" || state.phase !== "plan") {
    return state;
  }
  let guard = 4;
  while (guard-- > 0 && state.status === "active" && state.phase === "plan") {
    const ids = Object.keys(state.hands);
    let acted = false;
    for (const id of ids) {
      if (isReady(state, id)) continue;
      if (!factionIsAiSeat(world, id)) continue;
      runAiPlan(state, id, content);
      acted = true;
      break;
    }
    if (!acted) break;
    if (state.status !== "active") break;
  }
  return state;
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
 * Tactical cards never touch composition.
 */
export function finalizeCardBattle(state, world) {
  if (!state) return { ok: false, error: "no state" };

  const survivors = new Map();
  const participated = new Map();
  const initialByKey = state.initialCounts || {};
  const lossesByFaction = {};

  const noteParticipated = (card) => {
    if (!card || card.tactical) return;
    if (!card?.parentId || !card.defId) return;
    const key = stackKey(card);
    participated.set(key, {
      parentKind: card.parentKind || "fleet",
      parentId: card.parentId,
      defId: card.defId,
      groupId: card.groupId || null,
      factionId: card._factionId,
    });
  };

  const collect = (card, factionId) => {
    if (!card || card.tactical) return;
    if (card) card._factionId = factionId;
    noteParticipated(card);
    if (!card || (card.count || 0) <= 0) return;
    const key = stackKey(card);
    const cur = survivors.get(key) || {
      parentKind: card.parentKind || "fleet",
      parentId: card.parentId,
      defId: card.defId,
      groupId: card.groupId || null,
      factionId,
      count: 0,
      hp: card.hp,
    };
    cur.count += card.count;
    cur.hp = Math.min(cur.hp || card.maxHp, card.hp);
    survivors.set(key, cur);
  };

  // Snapshot initial if missing (best-effort from living + discard counts)
  if (!state.initialCounts) {
    const snap = {};
    for (const id of Object.keys(state.hands || {})) {
      for (const c of [
        ...(state.hands[id] || []),
        ...(state.decks[id] || []),
        ...(state.frontLines[id] || []),
        ...(state.discard?.[id] || []),
      ]) {
        if (!c || c.tactical || !c.parentId) continue;
        const key = stackKey(c);
        snap[key] = (snap[key] || 0) + (c.count || 0);
        // For discarded dead, count was zeroed — use maxHp proxy via log? skip
      }
    }
    state.initialCounts = snap;
  }

  for (const id of Object.keys(state.hands || {})) {
    for (const c of state.hands[id] || []) collect(c, id);
    for (const c of state.decks[id] || []) collect(c, id);
    for (const c of state.frontLines[id] || []) collect(c, id);
    for (const c of state.discard?.[id] || []) {
      if (c && !c.tactical) {
        c._factionId = id;
        noteParticipated(c);
      }
    }
  }

  for (const p of participated.values()) {
    if (p.parentKind === "fleet") {
      const fleet = (world.fleets ?? []).find((f) => f.id === p.parentId);
      const g = findCompositionGroup(fleet?.composition, p);
      if (g) {
        const before = g.count || 0;
        g.count = 0;
        g.hp = 0;
        const key = stackKey({
          parentKind: p.parentKind,
          parentId: p.parentId,
          groupId: p.groupId,
          defId: p.defId,
        });
        const alive = survivors.get(key)?.count || 0;
        const lost = Math.max(0, before - alive);
        if (lost > 0 && fleet?.factionId) {
          const fid = fleet.factionId;
          if (!lossesByFaction[fid]) lossesByFaction[fid] = [];
          lossesByFaction[fid].push({ defId: p.defId, lost });
        }
      }
    } else if (p.parentKind === "legion") {
      const legion = (world.legions ?? []).find((l) => l.id === p.parentId);
      const g = findCompositionGroup(legion?.composition, p);
      if (g) {
        const before = g.count || 0;
        g.count = 0;
        g.hp = 0;
        const key = stackKey({
          parentKind: p.parentKind,
          parentId: p.parentId,
          groupId: p.groupId,
          defId: p.defId,
        });
        const alive = survivors.get(key)?.count || 0;
        const lost = Math.max(0, before - alive);
        if (lost > 0 && legion?.factionId) {
          const fid = legion.factionId;
          if (!lossesByFaction[fid]) lossesByFaction[fid] = [];
          lossesByFaction[fid].push({ defId: p.defId, lost });
        }
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

  // Retreat: keep more ships (reduce effective losses).
  if (state.retreatedFactionId) {
    const rules = cardBattleRules(getContent());
    const mult = rules.retreatLossMult ?? 0.45;
    const fid = state.retreatedFactionId;
    for (const p of participated.values()) {
      if (p.factionId !== fid) continue;
      const key = stackKey({
        parentKind: p.parentKind,
        parentId: p.parentId,
        groupId: p.groupId,
        defId: p.defId,
      });
      const initial = state.initialCounts?.[key] || 0;
      if (initial <= 0) continue;
      const alive = survivors.get(key)?.count || 0;
      const lost = Math.max(0, initial - alive);
      const keepLost = Math.floor(lost * mult);
      const finalCount = Math.max(alive, initial - keepLost);
      const parent =
        p.parentKind === "fleet"
          ? (world.fleets ?? []).find((f) => f.id === p.parentId)
          : (world.legions ?? []).find((l) => l.id === p.parentId);
      const g = findCompositionGroup(parent?.composition, p);
      if (g) {
        g.count = finalCount;
        if (finalCount > 0 && !(g.hp > 0)) g.hp = g.maxHp || g.hp || 1;
      }
      // Rewrite losses list
      if (lossesByFaction[fid]) {
        lossesByFaction[fid] = lossesByFaction[fid]
          .map((row) =>
            row.defId === p.defId
              ? { ...row, lost: keepLost }
              : row,
          )
          .filter((row) => row.lost > 0);
      }
    }
  }

  // Veterancy XP for winner's surviving stacks (not on pure retreat concede).
  if (state.winnerFactionId && !state.retreatedFactionId) {
    const cfg = veterancyConfig(getContent());
    const xpAdd =
      cfg.xpPerBattle ?? cardBattleRules(getContent()).xpPerCardBattle ?? 50;
    for (const v of survivors.values()) {
      if (v.factionId !== state.winnerFactionId || !v.parentId) continue;
      const parent =
        v.parentKind === "fleet"
          ? (world.fleets ?? []).find((f) => f.id === v.parentId)
          : (world.legions ?? []).find((l) => l.id === v.parentId);
      const g = findCompositionGroup(parent?.composition, v);
      if (!g || (g.count || 0) <= 0) continue;
      const ref = g.ref && typeof g.ref === "object" ? g.ref : g;
      ref.xp = (ref.xp || 0) + xpAdd;
      ref.level = levelFromXp(ref.xp, cfg.thresholds);
      g.xp = ref.xp;
      g.level = ref.level;
    }
  }

  cleanupEmptyComposition(world);
  state.status = "resolved";
  state.phase = "resolved";
  return {
    ok: true,
    winnerFactionId: state.winnerFactionId ?? null,
    retreatedFactionId: state.retreatedFactionId || null,
    lossesByFaction,
  };
}

/**
 * Scrap / intel / loyalty after card battle victory.
 */
export function applyCardBattleTrophies(world, eng, fin, content = getContent()) {
  const rules = cardBattleRules(content);
  const t = rules.trophies || {};
  const winner = fin.winnerFactionId;
  if (!winner) {
    return { trophies: null };
  }
  const loser = (eng.sides || [])
    .map((s) => s.factionId)
    .find((id) => id !== winner);
  const loserLosses = (fin.lossesByFaction?.[loser] || []).reduce(
    (s, x) => s + (x.lost || 0),
    0,
  );
  const metalPer = Number(t.metalPerLostUnit ?? 1);
  const metalFloor = Number(t.metalFloor ?? 2);
  const metal = Math.max(
    metalFloor,
    Math.round(Math.max(0, loserLosses) * metalPer),
  );
  const cognitioBase = t.cognitioOnWin ?? 6;
  const styleMoments = (eng.cardBattle?.styleMoments || []).filter(
    (m) => m.sideId === winner,
  );
  const styleCognitio = Math.min(
    t.styleMaxCognitio ?? 3,
    styleMoments.length * (t.styleCognitioPerBanner ?? 1),
  );
  const cognitio = cognitioBase + styleCognitio;
  const intelBump = t.intelBump ?? 6;
  const loyaltyHit = t.loyaltyHit ?? 5;

  const ledger = readLedger();
  const turn = world.meta?.turn ?? null;
  adjustStock(ledger, winner, "currency.metal", metal, {
    turn,
    reason: "card_battle_scrap",
  });
  adjustStock(ledger, winner, "currency.cognitio", cognitio, {
    turn,
    reason: "card_battle_intel",
  });
  writeLedger(ledger);

  if (eng.systemId) {
    bumpSystemIntel(world, winner, eng.systemId, intelBump, {
      source: "card_battle",
      turn,
    });
    const sys = (world.systems ?? []).find((s) => s.id === eng.systemId);
    if (sys) {
      const objs = new Set(sys.spaceObjects || []);
      objs.add("debris");
      sys.spaceObjects = [...objs];
      if (!sys.poiType || sys.poiType === "none") sys.poiType = "debris";
      if (loser && sys.ownerFactionId === loser) {
        for (const p of sys.planets || []) {
          if (p.population > 0 || p.colonyType !== "none") {
            p.loyalty = Math.max(0, (p.loyalty ?? 50) - loyaltyHit);
          }
        }
      }
    }
  }

  const trophies = {
    winnerFactionId: winner,
    metal,
    cognitio,
    cognitioBase,
    styleCognitio,
    styleBanners: styleMoments.map((m) => m.label),
    intelBump,
    loyaltyHit: loser ? loyaltyHit : 0,
    loserFactionId: loser || null,
    scrapUnits: loserLosses,
  };
  if (!eng.result) eng.result = {};
  eng.result.trophies = trophies;
  eng.result.lossesByFaction = fin.lossesByFaction || {};
  return { trophies };
}

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
        (g.damage || 0) *
          (0.5 + (g.accuracy || 0) / 200) *
          (g.count || 0) *
          ((g.hp || 0) / Math.max(1, g.maxHp || 1)),
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
