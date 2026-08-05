/**
 * Smoke: card battle deepen — Block, free front strike, keywords, clash.
 * Run: node scripts/smokeCardBattleDeepen.mjs
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Load content rules via contentLoader path after chdir
process.chdir(root);

const {
  prepareCardBattle,
  playCardRound,
  strikeWithFrontCard,
  readyRound,
  estimateStrikeDamage,
  keywordForRole,
  cardBattleRules,
} = await import("../server/cardBattle.mjs");
const { getContent } = await import("../server/contentLoader.mjs");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const content = getContent();
const rules = cardBattleRules(content);
assert(rules.energyPerRound === 5, `energyPerRound expected 5, got ${rules.energyPerRound}`);
assert(rules.maxFront === 5, `maxFront expected 5, got ${rules.maxFront}`);
assert(rules.drawPerRound === 2, `drawPerRound expected 2, got ${rules.drawPerRound}`);

const world = JSON.parse(readFileSync(join(root, "data/published.json"), "utf8"));
const factions = (world.factions || []).slice(0, 2);
assert(factions.length >= 2, "need 2 factions on board");

const a = factions[0].id;
const b = factions[1].id;

const eng = {
  id: `smoke_cbt_${Date.now()}`,
  theater: "space",
  systemId: world.systems?.[0]?.id || "sys",
  mode: "card",
  status: "active",
  sides: [
    { factionId: a, fleetIds: [], legionIds: [], stance: "hold" },
    { factionId: b, fleetIds: [], legionIds: [], stance: "assault" },
  ],
};

// Attach some fleets if available
for (const side of eng.sides) {
  const fleets = (world.fleets || []).filter((f) => f.factionId === side.factionId).slice(0, 2);
  side.fleetIds = fleets.map((f) => f.id);
}

const prep = prepareCardBattle(eng, world, content);
assert(prep.ok, `prepare failed: ${prep.error}`);
const st = eng.cardBattle;
assert(st.maxEnergy === 5, "maxEnergy 5");
assert(st.maxFront === 5, "maxFront 5");
assert(Array.isArray(st.styleMoments), "styleMoments present");
assert(typeof st.block?.[a] === "number", "block map present");
assert(st.block[a] >= 0, "hold opening block");
assert(st.intents, "intents present");
assert(Array.isArray(st.struckThisRound?.[a]), "struckThisRound");

// Deploy first hand card if any
const hand = st.hands[a] || [];
assert(hand.length > 0, "hand not empty after prepare");
const card = hand[0];
const kw = keywordForRole(card.role);
console.log("sample card", card.defId, "role", card.role, "keyword", kw);

const dep = playCardRound(st, a, card.cardId, content, { mode: "deploy" });
assert(dep.ok, `deploy failed: ${dep.error}`);
assert(st.frontLines[a].some((c) => c.cardId === card.cardId), "on front");
assert(st.intents[a]?.kind === "deploy", "intent deploy");

// Brace from another hand card if available
if ((st.hands[a] || []).length) {
  const braceId = st.hands[a][0].cardId;
  const beforeBlock = st.block[a] || 0;
  const br = playCardRound(st, a, braceId, content, { mode: "brace" });
  assert(br.ok, `brace failed: ${br.error}`);
  assert((st.block[a] || 0) > beforeBlock, "brace gained block");
}

// Reorder if 2+ on front
if ((st.frontLines[a] || []).length >= 1 && (st.hands[a] || []).length) {
  playCardRound(st, a, st.hands[a][0].cardId, content, { mode: "deploy" });
}
if ((st.frontLines[a] || []).length >= 2) {
  const {
    reorderFrontCard,
  } = await import("../server/cardBattle.mjs");
  const id0 = st.frontLines[a][0].cardId;
  const ro = reorderFrontCard(st, a, id0, 1, content);
  assert(ro.ok, `reorder failed: ${ro.error}`);
}

const frontCard = st.frontLines[a][0];
const oppFront = st.frontLines[b] || [];
// Ensure opp has something or strike base with flank — for hold can't base if front exists.
// Deploy opp cheap card if needed via play from their hand
if (oppFront.length === 0 && (st.hands[b] || []).length) {
  const oc = st.hands[b][0];
  playCardRound(st, b, oc.cardId, content, { mode: "deploy" });
}

const target =
  (st.frontLines[b] || [])[0]?.cardId ||
  ((st.buffs[a]?.flankBase || st.buffs[a]?.bombard) ? "base" : null);

if (target) {
  const beforeHp =
    target === "base"
      ? st.baseHp[b]
      : st.frontLines[b].find((c) => c.cardId === target)?.hp;
  const beforeBlock = st.block[b] || 0;

  const est = estimateStrikeDamage(
    frontCard,
    target === "base" ? null : st.frontLines[b].find((c) => c.cardId === target),
    content,
    { atkBuff: st.buffs[a] },
  );
  assert(est >= 1, "estimate >= 1");

  const energyBefore = st.energy[a];
  const strike = strikeWithFrontCard(st, a, frontCard.cardId, target, content);
  assert(strike.ok, `strike failed: ${strike.error}`);
  // First front strike free
  assert(
    st.energy[a] === energyBefore,
    `first front strike should be free (energy ${energyBefore}→${st.energy[a]})`,
  );
  assert(
    (st.struckThisRound[a] || []).includes(frontCard.cardId),
    "marked struck",
  );
  const dmg = strike.pairResult?.damageDealt ?? 0;
  console.log("strike dmg", dmg, "blocked", strike.pairResult?.blocked, "est", est);
  assert(dmg >= 1 || (strike.pairResult?.blocked ?? 0) > 0, "meaningful hit or block");
  void beforeHp;
  void beforeBlock;
}

const readyA = readyRound(st, a, content);
assert(readyA.ok, "ready A");
const readyB = readyRound(st, b, content);
assert(readyB.ok, "ready B");
assert(readyB.clashed || st.phase === "resolved" || st.round >= 2, "clash advanced");

// Support deploy should draw or grant energy (carrier role / support keyword)
{
  const supportCard = {
    cardId: `${a}_smoke_support`,
    defId: "ship.support_smoke",
    role: "carrier",
    count: 1,
    hp: 20,
    maxHp: 20,
    damage: 4,
    defense: 0,
    shields: 0,
    accuracy: 50,
    energyCost: 1,
  };
  // Ensure front room and energy
  st.energy[a] = Math.max(st.energy[a] || 0, 2);
  if ((st.frontLines[a] || []).length >= (st.maxFront || 5)) {
    st.frontLines[a].pop();
  }
  st.hands[a] = [...(st.hands[a] || []), supportCard];
  st.decks[a] = [
    {
      cardId: `${a}_smoke_draw`,
      defId: "ship.line_smoke",
      role: "line",
      count: 1,
      hp: 20,
      maxHp: 20,
      damage: 8,
      defense: 0,
      shields: 0,
      accuracy: 50,
      energyCost: 1,
    },
    ...(st.decks[a] || []),
  ];
  const handBefore = (st.hands[a] || []).length;
  const depSup = playCardRound(st, a, supportCard.cardId, content, {
    mode: "deploy",
  });
  assert(depSup.ok, `support deploy: ${depSup.error}`);
  assert(
    (st.hands[a] || []).length >= handBefore ||
      (st.styleMoments || []).some((m) => m.kind === "support_rally"),
    "support rally style or draw",
  );
}

console.log("OK smokeCardBattleDeepen", {
  round: st.round,
  phase: st.phase,
  block: st.block,
  energy: st.energy,
  styles: (st.styleMoments || []).map((m) => m.kind),
  maxFront: st.maxFront,
});
