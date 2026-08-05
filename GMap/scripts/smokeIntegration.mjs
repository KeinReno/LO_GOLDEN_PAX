/**
 * Integration smoke for post-agent systems (A1-A10).
 * Exercises each new phase in isolation on a realistic world and verifies
 * that functions actually produce expected output (not just "don't crash").
 *
 * Run: node scripts/smokeIntegration.mjs
 */
import { loadContent, getContent } from "../server/contentLoader.mjs";
import { normalizeWorld } from "../server/normalizeWorld.mjs";
import { computeAllFactionLogistics, computeLogisticsNetwork, computeSupplyLevel, logisticsProductionMult } from "../server/logistics.mjs";
import { runLoyaltyPhase, loyaltyTick, computePlanetLoyalty, loyaltyTierFor } from "../server/loyalty.mjs";
import { runOpinionTick, getRelation, computeTargetOpinion } from "../server/opinionTick.mjs";
import { rollYearlyQuests, resolveQuestChoice, expireQuests } from "../server/questEngine.mjs";
import { rollDice, rollSuccess } from "../server/dice.mjs";
import { shouldOfferCardBattle } from "../server/cardBattle.mjs";
import {
  applyRaceStateModifier,
  writeRaceStates,
  readRaceStates,
  expireRaceStateModifiers,
} from "../server/raceStates.mjs";
import { collectRaceEffects } from "../server/modifierStack.mjs";
import {
  transferTech,
  factionCanAccessTech,
  listTechMarket,
  markTechsHistorical,
} from "../server/techPool.mjs";
import { ensureFactionEco } from "../server/ledger.mjs";

let failures = 0;
function check(label, cond, detail = "") {
  const ok = !!cond;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

function buildWorld() {
  const raw = {
    meta: { turn: 5, name: "Integration", schemaVersion: 9, createdAt: "", updatedAt: "", width: 100, height: 100, yearlyQuestRolls: {} },
    factions: [
      {
        id: "f1",
        name: "Alpha",
        color: "#ff0",
        password: "x",
        capitalSystemId: "s1",
        traits: ["trait_industrialists"],
        diplomacy: { opinions: {}, treaties: [], history: [] },
        npcs: [{ id: "npc1", name: "Daychin", role: "minister", currentTask: null }],
      },
      {
        id: "f2",
        name: "Beta",
        color: "#0ff",
        password: "y",
        capitalSystemId: "s2",
        traits: [],
        diplomacy: { opinions: {}, treaties: [], history: [] },
        npcs: [],
      },
    ],
    systems: [
      {
        id: "s1",
        ownerFactionId: "f1",
        isCapital: true,
        name: "Capital",
        x: 10, y: 10,
        planets: [{ id: "p1", name: "Home", population: 100, loyalty: 60, raceComposition: [{ raceId: "race_human", share: 1 }] }],
        resources: [],
        spaceObjects: [],
        visibleToFactionIds: ["f1", "f2"],
      },
      {
        id: "s2",
        ownerFactionId: "f2",
        isCapital: true,
        name: "BetaCap",
        x: 20, y: 10,
        planets: [{ id: "p2", name: "BetaHome", population: 80, loyalty: 50, raceComposition: [{ raceId: "race_human", share: 1 }] }],
        resources: [],
        spaceObjects: [],
        visibleToFactionIds: ["f1", "f2"],
      },
      {
        id: "s3",
        ownerFactionId: "f1",
        name: "Colony",
        x: 30, y: 10,
        planets: [{ id: "p3", name: "Outpost", population: 30, loyalty: 40, raceComposition: [{ raceId: "race_human", share: 1 }] }],
        resources: [],
        spaceObjects: [],
        visibleToFactionIds: ["f1"],
      },
    ],
    links: [
      { fromId: "s1", toId: "s2", type: "corridor" },
      { fromId: "s1", toId: "s3", type: "corridor" },
    ],
    diplomacy: [
      { aId: "f1", bId: "f2", relation: "war", turn: 4 },
    ],
    fleets: [],
    legions: [],
    races: [],
    sectors: [],
    orders: [],
    caravans: [],
    turnHistory: [],
    quests: [],
  };
  return normalizeWorld(raw);
}

console.log("smokeIntegration → post-agent systems");
console.log("--------------------------------------------------------");

// --- Content load ---
loadContent(["core"]);
const content = getContent();
check("content.effects.effects loaded", Object.keys(content.effects?.effects || {}).length >= 40, `${Object.keys(content.effects?.effects || {}).length} effects`);
check("content.faction_traits.traits loaded", Object.keys(content.faction_traits?.traits || {}).length >= 15, `${Object.keys(content.faction_traits?.traits || {}).length} traits`);
check("content.yearly_quests loaded", Object.keys(content.yearly_quests || {}).length >= 50, `${Object.keys(content.yearly_quests || {}).length} quests`);
check("content.loyalty_tiers.loyalty_tiers loaded", (content.loyalty_tiers?.loyalty_tiers || []).length > 0, `${(content.loyalty_tiers?.loyalty_tiers || []).length} tiers`);
check("content.diplomacy_stances loaded", Object.keys(content.diplomacy_stances || {}).length > 0, `${Object.keys(content.diplomacy_stances || {}).length} stances`);
check("content.races loaded", Object.keys(content.races || {}).length >= 7, `${Object.keys(content.races || {}).length} races`);
check("intent.throw_quest_dice defined", !!content.intents?.["intent.throw_quest_dice"]);
check("intent.give_npc_task defined", !!content.intents?.["intent.give_npc_task"]);
check("intent.assign_npc_posting defined", !!content.intents?.["intent.assign_npc_posting"]);
check("intent.recall_npc_posting defined", !!content.intents?.["intent.recall_npc_posting"]);
check("intent.seat_npc_council defined", !!content.intents?.["intent.seat_npc_council"]);
check("intent.unseat_npc_council defined", !!content.intents?.["intent.unseat_npc_council"]);
check(
  "content.council_seats.seats loaded",
  Object.keys(content.council_seats?.seats || {}).length >= 5,
  `${Object.keys(content.council_seats?.seats || {}).length} seats`,
);
check(
  "content.internal_blocs.blocs loaded",
  Object.keys(content.internal_blocs?.blocs || {}).length >= 3,
  `${Object.keys(content.internal_blocs?.blocs || {}).length} blocs`,
);
check(
  "governor has systemEffects",
  Array.isArray(content.npc_postings?.postings?.governor?.systemEffects) &&
    content.npc_postings.postings.governor.systemEffects.length > 0,
);
check(
  "content.npc_traits.traits loaded",
  Object.keys(content.npc_traits?.traits || {}).length >= 3,
  `${Object.keys(content.npc_traits?.traits || {}).length} npc traits`,
);
check(
  "content.npc_postings.postings loaded",
  Object.keys(content.npc_postings?.postings || {}).length >= 3,
  `${Object.keys(content.npc_postings?.postings || {}).length} postings`,
);
check(
  "content.court_tasks.tasks loaded",
  Object.keys(content.court_tasks?.tasks || {}).length >= 3,
  `${Object.keys(content.court_tasks?.tasks || {}).length} court tasks`,
);
check("intent.research_upgrade defined", !!content.intents?.["intent.research_upgrade"]);
check("intent.set_research_queue defined", !!content.intents?.["intent.set_research_queue"]);
check("tech_icons loaded", Object.keys(content.tech_icons || {}).length >= 5, `${Object.keys(content.tech_icons || {}).length} icons`);
check("intent.play_card defined", !!content.intents?.["intent.play_card"]);
check("intent.request_card_battle defined", !!content.intents?.["intent.request_card_battle"]);
check("intent.scout_world defined", !!content.intents?.["intent.scout_world"]);
check("intent.espionage defined", !!content.intents?.["intent.espionage"]);

// --- Dice (A9) ---
const d = rollDice({ count: 2, sides: 6 });
check("rollDice returns 2 values in [1,6]", Array.isArray(d) && d.length === 2 && d.every((v) => v >= 1 && v <= 6), JSON.stringify(d));
check("rollSuccess threshold 7 on 2d6", typeof rollSuccess({ threshold: 7 }, d) === "boolean");

// --- Logistics (A4) ---
const world = buildWorld();
const net = computeLogisticsNetwork(world, "f1", content, 5);
check("logistics network is a Map", net instanceof Map);
const s1L = net.get("s1");
check("logistics: capital s1 connected", s1L?.connectedToCapital === true && s1L?.hopsToCapital === 0, `hops=${s1L?.hopsToCapital}`);
const s3L = net.get("s3");
check("logistics: colony s3 reachable", !!s3L && typeof s3L.hopsToCapital === "number", `hops=${s3L?.hopsToCapital} connected=${s3L?.connectedToCapital}`);
const sl0 = computeSupplyLevel(0, content);
check("supplyLevel(0) is full-ish", typeof sl0 === "number" && sl0 >= 0.99, String(sl0));
const prodMult = logisticsProductionMult(world.systems[0], content);
check("logisticsProductionMult for capital is a number", typeof prodMult === "number" && prodMult > 0, String(prodMult));

computeAllFactionLogistics(world, content);
check("computeAllFactionLogistics stamps s1.logistics", !!world.systems[0].logistics, `s1.logistics=${!!world.systems[0].logistics}`);

// --- Loyalty (A3) ---
const planet = world.systems[0].planets[0];
const loyaltyVal = computePlanetLoyalty(world, world.systems[0], planet, content);
check("computePlanetLoyalty returns number in [0,100]", typeof loyaltyVal === "number" && loyaltyVal >= 0 && loyaltyVal <= 100, String(loyaltyVal));
const tier = loyaltyTierFor(loyaltyVal, content);
check("loyaltyTierFor returns a tier with effects", !!tier && Array.isArray(tier.effects), `min=${tier?.min} max=${tier?.max}`);

const loyaltyRes = loyaltyTick(world, "f1", content);
check("loyaltyTick returns journal array", Array.isArray(loyaltyRes.journal), `${loyaltyRes.journal.length} entries`);
check("planet loyalty still in [0,100] after tick", planet.loyalty >= 0 && planet.loyalty <= 100, String(planet.loyalty));

const loyaltyPhase = runLoyaltyPhase(world, content);
check("runLoyaltyPhase returns journal array", Array.isArray(loyaltyPhase.journal), `${loyaltyPhase.journal.length} entries`);

// --- Opinion / Diplomacy (A8) ---
const rel = getRelation(world, "f1", "f2");
check("getRelation returns war", rel === "war", String(rel));
const targetOp = computeTargetOpinion(world, world.factions[0], world.factions[1], content);
check("computeTargetOpinion returns number", typeof targetOp === "number" && Number.isFinite(targetOp), String(targetOp));
const opRes = runOpinionTick(world, 5, content);
check("runOpinionTick returns journal array", Array.isArray(opRes.journal), `${opRes.journal.length} entries`);
check("f1 diplomacy.opinions has f2", typeof world.factions[0].diplomacy?.opinions?.f2 === "number", String(world.factions[0].diplomacy?.opinions?.f2));

// --- Quests (A9) ---
const qRoll = rollYearlyQuests("f1", world, content);
check("rollYearlyQuests ok", !!qRoll.ok, `roll=${qRoll.roll} count=${qRoll.count}`);
check("rollYearlyQuests created quests array", Array.isArray(qRoll.quests) && qRoll.quests.length === qRoll.count, `${qRoll.quests?.length} quests`);
check("yearlyQuestRolls recorded in meta", !!world.meta.yearlyQuestRolls?.f1, JSON.stringify(world.meta.yearlyQuestRolls?.f1));

if (qRoll.quests?.[0]) {
  const q = qRoll.quests[0];
  const choice = q.choices?.find((c) => !c.diceRequired) || q.choices?.[0];
  if (choice && !choice.diceRequired) {
    // Affordability preflight spends real stocks — seed smoke ledger.
    const { readLedger, writeLedger, ensureFactionEco } = await import(
      "../server/ledger.mjs"
    );
    const ledger = readLedger();
    const eco = ensureFactionEco(ledger, "f1");
    for (const cur of [
      "currency.bios",
      "currency.materia",
      "currency.energia",
      "currency.industria",
      "currency.cognitio",
      "currency.metal",
      "currency.supply",
    ]) {
      eco.stocks[cur] = Math.max(Number(eco.stocks[cur] || 0), 50);
    }
    writeLedger(ledger);
    const res = resolveQuestChoice(q.id, choice.id, world, content, {
      factionId: "f1",
    });
    check("resolveQuestChoice ok", !!res.ok, res.error || `status=${res.quest?.status}`);
  } else {
    check("resolveQuestChoice (skipped — only dice choices)", true);
  }
}

const journalBuf = [];
expireQuests(world, 5, journalBuf);
check("expireQuests ran without throw and accepts journal buf", Array.isArray(journalBuf));

// --- Card battle (A7) ---
const fakeEngagement = {
  id: "eng1",
  theater: "space",
  attackerId: "f1",
  defenderId: "f2",
  systemId: "s2",
  stance: { attacker: "assault", defender: "hold" },
  composition: {
    attacker: { ships: [{ id: "ship_screen", count: 5, hp: 100 }], units: [] },
    defender: { ships: [{ id: "ship_screen", count: 3, hp: 100 }], units: [] },
  },
};
try {
  const offer = shouldOfferCardBattle(world, fakeEngagement, content);
  check("shouldOfferCardBattle returns boolean", typeof offer === "boolean", String(offer));
} catch (e) {
  check("shouldOfferCardBattle did not throw", false, e.message);
}

// --- Normalize legacy world (backward compat) ---
const legacyWorld = normalizeWorld({
  meta: { turn: 1, schemaVersion: 8 },
  factions: [{ id: "f1", name: "Old", color: "#fff", password: "x" }],
  systems: [{ id: "s1", ownerFactionId: "f1", planets: [{ id: "p1", population: 10 }] }],
  quests: [{ id: "q1", name: "OldQuest", summary: "s", systemId: null, status: "active" }],
  links: [],
  fleets: [],
  legions: [],
  diplomacy: [],
});
check("legacy world: faction.traits default []", Array.isArray(legacyWorld.factions[0].traits) && legacyWorld.factions[0].traits.length === 0);
check("legacy world: faction.diplomacy exists", !!legacyWorld.factions[0].diplomacy);
check("legacy world: faction.npcs default []", Array.isArray(legacyWorld.factions[0].npcs));
check("legacy world: planet.loyalty default 50", legacyWorld.systems[0].planets[0].loyalty === 50);
check("legacy world: quest.type assigned", typeof legacyWorld.quests[0].type === "string", legacyWorld.quests[0].type);
check("legacy world: quest.history is array", Array.isArray(legacyWorld.quests[0].history));

// --- Intel Fog ---
const {
  setKnowledgeLevel,
  getLevel,
  maskEntityByLevel,
  maskFactionForIntel,
  levelFromProgress,
  approximateStat,
  updateIntelFromDiplomacy,
  publicIntelPayload,
  ensureFactionIntel,
  readIntelStore,
  writeIntelStore,
} = await import("../server/intel.mjs");

// Isolate smoke from campaign intel file (deep clone — store rows are mutated in place)
const intelBackup = JSON.parse(JSON.stringify(readIntelStore()));
writeIntelStore({ factions: {} });

const smokeViewer = "smoke_intel_f1";
const smokeTarget = "smoke_intel_f2";
ensureFactionIntel(smokeViewer);
check("intel: own faction seeds to store", getLevel(smokeViewer, "faction", smokeViewer) === 4);
const bumped = setKnowledgeLevel(smokeViewer, "faction", smokeTarget, 2, {
  source: "fleet",
  turn: 5,
});
check(
  "intel: setKnowledgeLevel raises target to 2",
  bumped && getLevel(smokeViewer, "faction", smokeTarget) === 2,
  `bumped=${bumped} lv=${getLevel(smokeViewer, "faction", smokeTarget)}`,
);
const noDown = setKnowledgeLevel(smokeViewer, "faction", smokeTarget, 1, {
  source: "gm",
  turn: 5,
});
check(
  "intel: levels are monotonic (no decrease)",
  !noDown && getLevel(smokeViewer, "faction", smokeTarget) === 2,
);
check("intel: levelFromProgress thresholds", levelFromProgress(1) === 1 && levelFromProgress(6) === 3);
check("intel: approximateStat is honest band", typeof approximateStat(12) === "string");
const masked1 = maskEntityByLevel(
  { id: "x", name: "Probe", category: "ship", stats: { power: 12 }, cost: 5 },
  1,
);
check("intel: mask L1 strips stats", masked1 && masked1.stats == null && masked1.name === "Probe");
const masked2 = maskEntityByLevel(
  { id: "x", name: "Probe", category: "ship", stats: { power: 12 }, cost: 5 },
  2,
);
check("intel: mask L2 approximates stats", masked2 && masked2.stats && masked2.cost == null);
const maskedFac = maskFactionForIntel(
  { id: smokeTarget, name: "Beta", color: "#0ff", password: "secret", notes: "hidden" },
  1,
  smokeViewer,
);
check("intel: maskFaction L1 hides notes/password", maskedFac && maskedFac.notes == null && maskedFac.password === "••••");
updateIntelFromDiplomacy(world, smokeViewer, smokeTarget, "alliance", { turn: 5 });
check("intel: alliance bumps faction ≥3", getLevel(smokeViewer, "faction", smokeTarget) >= 3);
const pub = publicIntelPayload(smokeViewer);
check("intel: public payload has knownFactions", typeof pub.knownFactions === "object");

// --- Race states folded into economy/growth ---
const raceStateBackup = readRaceStates();
try {
  writeRaceStates({});
  applyRaceStateModifier(
    "race_human",
    {
      id: "mod.smoke.pop_growth_boost",
      source: "smoke",
      turn_applied: 5,
      permanent: true,
      effects: [{ effect: "pop_growth_mult", args: { mult: 1.5 } }],
    },
    { factionId: "f1" },
  );
  const withState = collectRaceEffects(
    getContent().races,
    [{ raceId: "race_human", percent: 100 }],
    { factionId: "f1", turn: 5 },
  );
  const withoutState = collectRaceEffects(
    getContent().races,
    [{ raceId: "race_human", percent: 100 }],
  );
  const stateHits = withState.filter(
    (e) => e.source?.kind === "race_state" && e.effect === "pop_growth_mult",
  );
  check(
    "race_states: collectRaceEffects folds state when opts set",
    stateHits.length === 1 && Number(stateHits[0].args?.mult) === 1.5,
  );
  check(
    "race_states: without opts state is ignored",
    !withoutState.some((e) => e.source?.kind === "race_state"),
  );
  applyRaceStateModifier(
    "race_human",
    {
      id: "mod.smoke.expired",
      source: "smoke",
      turn_applied: 1,
      expires: 3,
      effects: [{ effect: "production_mult", args: { mult: 2 } }],
    },
    { factionId: "f1" },
  );
  const expired = expireRaceStateModifiers(5);
  check(
    "race_states: expire drops past-expires mods",
    expired.expired.some((id) => id.includes("mod.smoke.expired")),
  );
} finally {
  writeRaceStates(raceStateBackup);
}

// --- Tech pool / trade / historical / market ---
{
  const fromLedger = { factions: {} };
  const toLedger = { factions: {} };
  const fromEco = ensureFactionEco(fromLedger, "f1");
  const toEco = ensureFactionEco(toLedger, "f2");
  fromEco.unlockedTechs = ["tech.geology"];
  const traded = transferTech(fromEco, toEco, "tech.geology", {
    turn: 5,
    fromFactionId: "f1",
    source: "trade",
  });
  check("techPool: transferTech grants unlocked + acquired", traded.ok && toEco.unlockedTechs.includes("tech.geology"));
  check(
    "techPool: acquired source=trade",
    toEco.acquiredTechs.some((a) => a.techId === "tech.geology" && a.source === "trade"),
  );
  markTechsHistorical(toEco, ["tech.geology"], 5, "heritage");
  const hist = toEco.acquiredTechs.find((a) => a.techId === "tech.geology");
  check("techPool: markTechsHistorical sets non-transferable", hist?.source === "historical" && hist?.transferable === false);
  const blocked = transferTech(toEco, fromEco, "tech.geology", { turn: 6 });
  check("techPool: historical cannot re-trade", !blocked.ok);
  const listings = listTechMarket(getContent());
  check("techPool: tech_market has listings", listings.length >= 1);
  const fac = { id: "f1", availableRaces: ["race_human"] };
  const worldMini = { factions: [fac] };
  const gate = factionCanAccessTech(
    { id: "tech.x", tags: ["race_swarm"] },
    "f1",
    { unlockedTechs: [], acquiredTechs: [] },
    getContent(),
    worldMini,
  );
  check("techPool: race tag outside pool blocked", !gate.ok);
  const viaAcquired = factionCanAccessTech(
    { id: "tech.x", tags: ["race_swarm"] },
    "f1",
    { unlockedTechs: [], acquiredTechs: [{ techId: "tech.x", source: "trade" }] },
    getContent(),
    worldMini,
  );
  check("techPool: acquired bypasses race pool", viaAcquired.ok && viaAcquired.via === "acquired");
}

// Restore prior campaign intel (strip smoke leftovers)
const restored = intelBackup?.factions ? intelBackup : { factions: {} };
delete restored.factions?.[smokeViewer];
delete restored.factions?.[smokeTarget];
writeIntelStore(restored);

console.log("--------------------------------------------------------");
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
