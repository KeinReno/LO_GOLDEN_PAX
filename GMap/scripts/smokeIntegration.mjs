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
check("intent.research_upgrade defined", !!content.intents?.["intent.research_upgrade"]);
check("intent.play_card defined", !!content.intents?.["intent.play_card"]);
check("intent.request_card_battle defined", !!content.intents?.["intent.request_card_battle"]);

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
    const res = resolveQuestChoice(q.id, choice.id, world, content, { factionId: "f1" });
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

console.log("--------------------------------------------------------");
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
