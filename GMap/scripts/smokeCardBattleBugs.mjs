/**
 * Regression probes for card-battle dynamism bugs.
 * Run: node scripts/smokeCardBattleBugs.mjs
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

const {
  prepareCardBattle,
  playCardRound,
  readyRound,
  keywordForRole,
  cardBattleRules,
} = await import("../server/cardBattle.mjs");
const { getContent } = await import("../server/contentLoader.mjs");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const content = getContent();
const rules = cardBattleRules(content);
const world = JSON.parse(readFileSync(join(root, "data/published.json"), "utf8"));
const factions = (world.factions || []).slice(0, 2);
const a = factions[0].id;
const b = factions[1].id;

function freshEng(id) {
  const eng = {
    id,
    theater: "space",
    systemId: world.systems?.[0]?.id || "sys",
    mode: "card",
    status: "active",
    sides: [
      { factionId: a, fleetIds: [], legionIds: [], stance: "hold" },
      { factionId: b, fleetIds: [], legionIds: [], stance: "assault" },
    ],
  };
  for (const side of eng.sides) {
    const fleets = (world.fleets || [])
      .filter((f) => f.factionId === side.factionId)
      .slice(0, 2);
    side.fleetIds = fleets.map((f) => f.id);
  }
  return eng;
}

// --- Bug A: clashEvents wiped on non-final round (cinema never sees mid-battle) ---
{
  const eng = freshEng(`bug_cinema_${Date.now()}`);
  const prep = prepareCardBattle(eng, world, content);
  assert(prep.ok, prep.error);
  const st = eng.cardBattle;
  // Force not ending: keep both sides with cards/base
  st.baseHp[a] = 500;
  st.baseHp[b] = 500;
  // Deploy something so clash has events
  if ((st.hands[a] || []).length) {
    playCardRound(st, a, st.hands[a][0].cardId, content, { mode: "deploy" });
  }
  if ((st.hands[b] || []).length) {
    playCardRound(st, b, st.hands[b][0].cardId, content, { mode: "deploy" });
  }
  readyRound(st, a, content);
  const after = readyRound(st, b, content);
  assert(after.ok && after.clashed, "expected clash");
  assert(st.status === "active", "battle should continue");
  assert(
    Array.isArray(st.clashEvents) && st.clashEvents.length > 0,
    `BUG: clashEvents cleared after mid-battle clash (len=${st.clashEvents?.length ?? "nil"}) — cinema cannot play`,
  );
  console.log("A cinema mid-clash events:", st.clashEvents.length);
}

// --- Bug B: escort death Vulnerable must survive into next plan ---
{
  const eng = freshEng(`bug_vuln_${Date.now()}`);
  prepareCardBattle(eng, world, content);
  const st = eng.cardBattle;
  st.baseHp[a] = 999;
  st.baseHp[b] = 999;
  st.frontLines[a] = [];
  st.frontLines[b] = [
    {
      cardId: `${b}_escort`,
      defId: "ship.screen",
      role: "screen",
      count: 1,
      hp: 5,
      maxHp: 5,
      damage: 2,
      defense: 0,
      shields: 0,
      accuracy: 50,
      energyCost: 1,
    },
    {
      cardId: `${b}_line`,
      defId: "ship.line",
      role: "line",
      count: 1,
      hp: 40,
      maxHp: 40,
      damage: 8,
      defense: 0,
      shields: 0,
      accuracy: 50,
      energyCost: 1,
    },
  ];
  st.frontLines[a] = [
    {
      cardId: `${a}_cap`,
      defId: "ship.capital",
      role: "capital",
      count: 1,
      hp: 80,
      maxHp: 80,
      damage: 40,
      defense: 0,
      shields: 0,
      accuracy: 70,
      energyCost: 2,
    },
  ];
  assert(keywordForRole("screen") === "escort", "screen→escort");
  readyRound(st, a, content);
  readyRound(st, b, content);
  // After clash+next round, line neighbor should still be Vulnerable if escort died
  const escortDead = !(st.frontLines[b] || []).some((c) => c.cardId === `${b}_escort`);
  const lineAlive = (st.frontLines[b] || []).find((c) => c.cardId === `${b}_line`);
  console.log("B escortDead", escortDead, "lineAlive", !!lineAlive, "statuses", st.statuses);
  if (escortDead && lineAlive && st.status === "active") {
    assert(
      st.statuses?.[`${b}_line`]?.vulnerable,
      "BUG: escort-death Vulnerable wiped before next plan phase",
    );
  } else {
    console.log("B skipped assert (escort may have survived or battle ended)");
  }
}

// --- Bug C: base_breach spam should not explode styleMoments unboundedly per open lane ---
{
  const eng = freshEng(`bug_spam_${Date.now()}`);
  prepareCardBattle(eng, world, content);
  const st = eng.cardBattle;
  st.baseHp[a] = 999;
  st.baseHp[b] = 40;
  st.frontLines[b] = []; // open
  st.frontLines[a] = [1, 2, 3, 4, 5].map((i) => ({
    cardId: `${a}_lane${i}`,
    defId: "ship.line",
    role: "line",
    count: 1,
    hp: 30,
    maxHp: 30,
    damage: 12,
    defense: 0,
    shields: 0,
    accuracy: 60,
    energyCost: 1,
  }));
  const before = (st.styleMoments || []).length;
  readyRound(st, a, content);
  readyRound(st, b, content);
  const breaches = (st.styleMoments || []).filter((m) => m.kind === "base_breach");
  console.log("C base_breach count", breaches.length, "total styles", (st.styleMoments || []).length - before);
  assert(
    breaches.length <= 1,
    `BUG: base_breach spam (${breaches.length} in one clash) — should dedupe per side/round`,
  );
}

// --- Bug D: clashSeq increments so cinema keys cannot collide across rounds ---
{
  const eng = freshEng(`bug_seq_${Date.now()}`);
  prepareCardBattle(eng, world, content);
  const st = eng.cardBattle;
  st.baseHp[a] = 800;
  st.baseHp[b] = 800;
  assert((st.clashSeq || 0) === 0, "clashSeq starts 0");
  if ((st.hands[a] || []).length) {
    playCardRound(st, a, st.hands[a][0].cardId, content, { mode: "deploy" });
  }
  if ((st.hands[b] || []).length) {
    playCardRound(st, b, st.hands[b][0].cardId, content, { mode: "deploy" });
  }
  readyRound(st, a, content);
  readyRound(st, b, content);
  const seq1 = st.clashSeq || 0;
  assert(seq1 >= 1, `clashSeq after first clash, got ${seq1}`);
  if (st.status === "active") {
    readyRound(st, a, content);
    readyRound(st, b, content);
    assert((st.clashSeq || 0) > seq1, "clashSeq must increase each clash");
  }
  console.log("D clashSeq", st.clashSeq);
}

// --- Soft E: hand cap ---
{
  assert((rules.maxHandSize ?? 0) >= 7, "maxHandSize expected >= 7");
  const eng = freshEng(`soft_hand_${Date.now()}`);
  prepareCardBattle(eng, world, content);
  const st = eng.cardBattle;
  const maxH = rules.maxHandSize ?? 7;
  st.hands[a] = Array.from({ length: maxH }, (_, i) => ({
    cardId: `${a}_full_${i}`,
    defId: "ship.line",
    role: "line",
    count: 1,
    hp: 20,
    maxHp: 20,
    damage: 5,
    defense: 0,
    shields: 0,
    accuracy: 50,
    energyCost: 1,
  }));
  st.decks[a] = [
    {
      cardId: `${a}_overflow_draw`,
      defId: "ship.line",
      role: "line",
      count: 1,
      hp: 20,
      maxHp: 20,
      damage: 5,
      defense: 0,
      shields: 0,
      accuracy: 50,
      energyCost: 1,
    },
  ];
  const {
    playCardRound: play,
  } = await import("../server/cardBattle.mjs");
  // Support deploy should not grow hand past cap
  st.energy[a] = 5;
  st.frontLines[a] = [];
  const support = {
    cardId: `${a}_sup`,
    defId: "ship.carrier",
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
  st.hands[a].push(support);
  // hand is maxH+1 temporarily (support to deploy)
  const beforeLen = st.hands[a].length;
  const r = play(st, a, support.cardId, content, { mode: "deploy" });
  assert(r.ok, `support deploy: ${r.error}`);
  assert(
    (st.hands[a] || []).length <= maxH,
    `hand exceeded cap: ${(st.hands[a] || []).length} > ${maxH} (was ${beforeLen})`,
  );
  console.log("E hand cap", (st.hands[a] || []).length, "/", maxH);
}

// --- Soft F: same-lane simultaneous — both fire if alive at open ---
{
  const eng = freshEng(`soft_simul_${Date.now()}`);
  prepareCardBattle(eng, world, content);
  const st = eng.cardBattle;
  st.baseHp[a] = 999;
  st.baseHp[b] = 999;
  st.frontLines[a] = [
    {
      cardId: `${a}_glass`,
      defId: "ship.line",
      role: "line",
      count: 1,
      hp: 8,
      maxHp: 8,
      damage: 50,
      defense: 0,
      shields: 0,
      accuracy: 90,
      energyCost: 1,
    },
  ];
  st.frontLines[b] = [
    {
      cardId: `${b}_glass`,
      defId: "ship.line",
      role: "line",
      count: 1,
      hp: 8,
      maxHp: 8,
      damage: 50,
      defense: 0,
      shields: 0,
      accuracy: 90,
      energyCost: 1,
    },
  ];
  readyRound(st, a, content);
  readyRound(st, b, content);
  const sides = new Set((st.clashEvents || []).map((e) => e.side));
  assert(
    sides.has(a) && sides.has(b),
    `BUG: simultaneous failed — events sides=[...${[...sides]}]`,
  );
  console.log("F simul events", (st.clashEvents || []).length, "sides", [...sides]);
}

// --- Soft G: overwhelm splash suppresses overflow ---
{
  const eng = freshEng(`soft_ov_${Date.now()}`);
  prepareCardBattle(eng, world, content);
  const st = eng.cardBattle;
  st.baseHp[a] = 999;
  st.baseHp[b] = 200;
  const baseBefore = st.baseHp[b];
  st.frontLines[a] = [
    {
      cardId: `${a}_cap`,
      defId: "ship.capital",
      role: "capital",
      count: 1,
      hp: 80,
      maxHp: 80,
      damage: 80,
      defense: 0,
      shields: 0,
      accuracy: 90,
      energyCost: 2,
    },
  ];
  st.frontLines[b] = [
    {
      cardId: `${b}_esc`,
      defId: "ship.screen",
      role: "screen",
      count: 1,
      hp: 5,
      maxHp: 5,
      damage: 2,
      defense: 0,
      shields: 0,
      accuracy: 50,
      energyCost: 1,
    },
    {
      cardId: `${b}_nbr`,
      defId: "ship.line",
      role: "line",
      count: 1,
      hp: 40,
      maxHp: 40,
      damage: 8,
      defense: 0,
      shields: 0,
      accuracy: 50,
      energyCost: 1,
    },
  ];
  st.energy[a] = 5;
  const { strikeWithFrontCard } = await import("../server/cardBattle.mjs");
  const hit = strikeWithFrontCard(st, a, `${a}_cap`, `${b}_esc`, content);
  assert(hit.ok, hit.error);
  const spilled = baseBefore - (st.baseHp[b] || 0);
  const hasSplash = (st.styleMoments || []).some((m) => m.kind === "overwhelm_splash");
  if (hasSplash) {
    assert(
      spilled === 0,
      `BUG: splash+overflow double-dip (base lost ${spilled})`,
    );
  }
  console.log("G overwhelm splash", hasSplash, "baseLost", spilled);
}

console.log("OK smokeCardBattleBugs", {
  energy: rules.energyPerRound,
  front: rules.maxFront,
  maxHand: rules.maxHandSize,
});
