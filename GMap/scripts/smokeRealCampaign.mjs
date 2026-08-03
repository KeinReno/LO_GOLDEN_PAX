/**
 * Real-campaign integration probe: loads the published campaign JSON and
 * runs each new phase (logistics, loyalty, opinion, quests) directly to
 * verify the new systems actually produce events on real data — not just
 * that they don't crash.
 *
 * Run: node scripts/smokeRealCampaign.mjs
 */
import fs from "node:fs";
import { loadContent, getContent } from "../server/contentLoader.mjs";
import { normalizeWorld } from "../server/normalizeWorld.mjs";
import { computeAllFactionLogistics } from "../server/logistics.mjs";
import { runLoyaltyPhase } from "../server/loyalty.mjs";
import { runOpinionTick } from "../server/opinionTick.mjs";
import { expireQuests, rollYearlyQuests } from "../server/questEngine.mjs";

const CAMPAIGN = "public/campaigns/lo_golden_pax.json";
const raw = JSON.parse(fs.readFileSync(CAMPAIGN, "utf8"));
loadContent(["core"]);
const content = getContent();
const world = normalizeWorld(raw);

console.log("smokeRealCampaign →", CAMPAIGN);
console.log("--------------------------------------------------------");
console.log("factions:", world.factions.length);
console.log("systems:", world.systems.length);
console.log("links:", world.links.length);
console.log("quests (legacy):", world.quests.length);
console.log("diplomacy edges:", world.diplomacy.length);
console.log("factions with traits:", world.factions.filter((f) => (f.traits || []).length > 0).length);
console.log("factions with npcs:", world.factions.filter((f) => (f.npcs || []).length > 0).length);
console.log("npcs total:", world.factions.reduce((s, f) => s + (f.npcs || []).length, 0));
console.log("npcs with currentTask:", world.factions.reduce((s, f) => s + (f.npcs || []).filter((n) => n.currentTask).length, 0));
console.log("planets with population:", world.systems.reduce((s, sys) => s + (sys.planets || []).filter((p) => (p.population || 0) > 0).length, 0));
console.log("");

// --- Logistics ---
computeAllFactionLogistics(world, content);
let connected = 0, disconnected = 0;
for (const sys of world.systems) {
  if (!sys.logistics) continue;
  if (sys.logistics.connectedToCapital) connected++;
  else disconnected++;
}
console.log(`logistics: ${connected} connected, ${disconnected} disconnected`);

// --- Loyalty ---
const loyalty = runLoyaltyPhase(world, content);
console.log(`loyalty: ${loyalty.journal.length} change events`);

// --- Opinion ---
const opinion = runOpinionTick(world, world.meta.turn, content);
console.log(`opinion: ${opinion.journal.length} events, ${world.factions.filter((f) => Object.keys(f.diplomacy?.opinions || {}).length > 0).length} factions with opinions`);

// --- Quests: expire ---
const expJournal = [];
expireQuests(world, world.meta.turn, expJournal);
console.log(`quests expired: ${expJournal.length}`);

// --- Quests: roll yearly for first faction with traits or first faction ---
const target = world.factions[0];
const roll = rollYearlyQuests(target.id, world, content);
console.log(`yearly quests for ${target.id}: ok=${roll.ok} roll=${roll.roll} created=${roll.count}`);

console.log("");
console.log("DONE — systems fire on real campaign data");
