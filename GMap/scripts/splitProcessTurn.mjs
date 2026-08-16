/**
 * Slice processTurn.mjs into server/turn/* domain modules.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const srcPath = path.join(root, "server/processTurn.mjs");
const turnDir = path.join(root, "server/turn");
fs.mkdirSync(turnDir, { recursive: true });

const lines = fs.readFileSync(srcPath, "utf8").replace(/\r\n/g, "\n").split("\n");
// 1-based inclusive ranges from earlier map
const slice = (a, b) => lines.slice(a - 1, b).join("\n").trimEnd();

const journalSrc = `/** Shared tick journal helper. */
export function journalPush(journal, entry) {
  journal.push({ at: new Date().toISOString(), ...entry });
}
`;

// Extract body of functions from full file using markers
const full = lines.join("\n");

function between(startRe, endRe) {
  const s = full.search(startRe);
  const e = full.slice(s + 1).search(endRe);
  if (s < 0 || e < 0) throw new Error(`slice fail ${startRe} ${endRe}`);
  return full.slice(s, s + 1 + e).trimEnd();
}

// Manual ranges (1-based line numbers from grep)
const movementBody = slice(111, 611); // clearBlockade..applyFortify (includes moves + military ops through fortify)
// Wait - claim/attack/combat are in 327-519, blockade/fortify 520-611
// Split properly:

const travelHelpers = slice(111, 238);
const moveApplies = slice(239, 326);
const combatApplies = slice(327, 519);
const blockadeFortify = slice(520, 611);
const planetIntent = slice(612, 651);
const diploOffer = slice(652, 690);
const intelApplies = slice(691, 941);
const economyApplies = slice(942, 1355);
const refugee = slice(1356, 1359);
const researchApplies = slice(1360, 1507);
const buildApplies = slice(1508, 1624);
const hybridPower = slice(1625, 1697);
const appliersMap = slice(1699, 1746);
const caravans = slice(1748, 1776);

function rewriteLocal(body) {
  return body
    .replace(/^function journalPush[\s\S]*?\n\}\n*/m, "")
    .replace(/\bjournalPush\(/g, "journalPush(")
    .replace(/^function /gm, "export function ")
    .replace(/^async function /gm, "export async function ");
}

fs.writeFileSync(path.join(turnDir, "journal.mjs"), journalSrc);

fs.writeFileSync(
  path.join(turnDir, "movement.mjs"),
  `import { journalPush } from "./journal.mjs";
import { hopPath, linkAllowsTravel } from "../pathfinding.mjs";
import {
  completeForceTravel,
  refreshSystemBlockade,
} from "../forceMovement.mjs";
import { getContent } from "../contentLoader.mjs";

${rewriteLocal(travelHelpers + "\n\n" + moveApplies + "\n\n" + blockadeFortify)}
`,
);

fs.writeFileSync(
  path.join(turnDir, "combatIntents.mjs"),
  `import { journalPush } from "./journal.mjs";
import {
  setEngagementStance,
  requestCardBattle,
  playEngagementCard,
} from "../engagements.mjs";
import { getContent } from "../contentLoader.mjs";

${rewriteLocal(combatApplies)}
`,
);

fs.writeFileSync(
  path.join(turnDir, "intelIntents.mjs"),
  `import { journalPush } from "./journal.mjs";
import { addPermanentReveal } from "../fogStore.mjs";
import { resolveVisibleWithFog, readFog } from "../fogStore.mjs";
import {
  bumpSystemIntel,
  canEspionage,
  getIntelRules,
  getLevel,
  markEspionageUsed,
  setKnowledgeLevel,
} from "../intel.mjs";
import { getContent } from "../contentLoader.mjs";

${rewriteLocal(intelApplies)}
`,
);

fs.writeFileSync(
  path.join(turnDir, "economyIntents.mjs"),
  `import { journalPush } from "./journal.mjs";
import {
  queueTaxChange,
  transferResources,
  marketConvert,
} from "../economyTick.mjs";
import { ECONOMIC_POLICY_PRESETS } from "../economyPending.mjs";
import {
  placeMarketOffer,
  cancelMarketOffer,
} from "../marketOrders.mjs";
import { breakTreaty, bumpOpinion } from "../opinionTick.mjs";
import { createDiploOffer } from "../diploOffers.mjs";
import {
  readLedger,
  writeLedger,
  ensureFactionEco,
  ensureAllFactions,
  adjustStock,
} from "../ledger.mjs";
import {
  getKnownFactionIds,
  getTradePartnerIds,
} from "../factionIntel.mjs";
import { resolveVisibleWithFog, readFog } from "../fogStore.mjs";
import { getContent } from "../contentLoader.mjs";
import { hopPath } from "../pathfinding.mjs";

${rewriteLocal(economyApplies + "\n\n" + diploOffer + "\n\n" + caravans)}
`,
);

fs.writeFileSync(
  path.join(turnDir, "researchBuild.mjs"),
  `import { journalPush } from "./journal.mjs";
import { researchUpgrade, researchTech, setResearchQueue } from "../techActions.mjs";
import { transferTech } from "../techPool.mjs";
import {
  applyPlanetAction,
  setBuildQueue,
  pushSystemHistory,
  BUILD_QUEUE_MAX,
} from "../planetActions.mjs";
import { foundHybridLineage } from "../hybridActions.mjs";
import { grantPowerTouch } from "../powerPaths.mjs";
import { getContent } from "../contentLoader.mjs";
import {
  readLedger,
  writeLedger,
  ensureFactionEco,
} from "../ledger.mjs";

${rewriteLocal(planetIntent + "\n\n" + researchApplies + "\n\n" + buildApplies + "\n\n" + hybridPower)}
`,
);

fs.writeFileSync(
  path.join(turnDir, "npcIntents.mjs"),
  `import { journalPush } from "./journal.mjs";
import {
  applyRefugeeConvoy,
  applyGiveNpcTask,
  applyAssignNpcPosting,
  applyRecallNpcPosting,
  applySeatNpcCouncil,
  applyUnseatNpcCouncil,
  applySetCouncilPortfolio,
  applyAssignBlocLeader,
  applyAssignRaceLeader,
} from "../narrative.mjs";

${rewriteLocal(refugee)}

// Thin re-exports used by APPLIERS (narrative owns the logic).
export {
  applyGiveNpcTask,
  applyAssignNpcPosting,
  applyRecallNpcPosting,
  applySeatNpcCouncil,
  applyUnseatNpcCouncil,
  applySetCouncilPortfolio,
  applyAssignBlocLeader,
  applyAssignRaceLeader,
};
`,
);

// Fix APPLIERS to import - write appliers.mjs manually from map
fs.writeFileSync(
  path.join(turnDir, "appliers.mjs"),
  `import { applyMoveFleet, applyMoveLegion, applyBlockade, applyFortify } from "./movement.mjs";
import {
  applyClaim,
  applyAttackMarker,
  applyCombatStance,
  applyRequestCardBattle,
  applyPlayCard,
} from "./combatIntents.mjs";
import {
  applyScoutReveal,
  applyScoutWorld,
  applyEspionage,
} from "./intelIntents.mjs";
import {
  applySetTax,
  applySetFlowPriority,
  applyReserveStock,
  applySendCaravan,
  applySetEconomicPolicy,
  applyTransfer,
  applyBreakTreaty,
  applyMarketConvert,
  applyMarketOffer,
  applyMarketCancel,
  applyMakeDiploOffer,
} from "./economyIntents.mjs";
import {
  applyPlanetIntent,
  applyResearchUpgrade,
  applySetResearchQueue,
  applySetBuildQueue,
  applyFoundHybridLineage,
  applyTradeTech,
  applyGrantPowerTouch,
} from "./researchBuild.mjs";
import {
  applyRefugeeConvoyIntent,
  applyGiveNpcTask,
  applyAssignNpcPosting,
  applyRecallNpcPosting,
  applySeatNpcCouncil,
  applyUnseatNpcCouncil,
  applySetCouncilPortfolio,
  applyAssignBlocLeader,
  applyAssignRaceLeader,
} from "./npcIntents.mjs";
import {
  applyThrowQuestDice,
  applyResolveQuestChoice,
  applyResolveQuestDice,
} from "../questActions.mjs";

export const APPLIERS = {
  "intent.move_fleet": applyMoveFleet,
  "intent.move_legion": applyMoveLegion,
  "intent.claim_system": applyClaim,
  "intent.attack_system": applyAttackMarker,
  "intent.blockade": applyBlockade,
  "intent.fortify": applyFortify,
  "intent.combat_stance": applyCombatStance,
  "intent.request_card_battle": applyRequestCardBattle,
  "intent.play_card": applyPlayCard,
  "intent.scout_reveal": applyScoutReveal,
  "intent.scout_world": applyScoutWorld,
  "intent.espionage": applyEspionage,
  "intent.set_tax": applySetTax,
  "intent.set_flow_priority": applySetFlowPriority,
  "intent.reserve_stock": applyReserveStock,
  "intent.send_caravan": applySendCaravan,
  "intent.set_economic_policy": applySetEconomicPolicy,
  "intent.transfer": applyTransfer,
  "intent.break_treaty": applyBreakTreaty,
  "intent.market_convert": applyMarketConvert,
  "intent.market_offer": applyMarketOffer,
  "intent.market_cancel": applyMarketCancel,
  "intent.refugee_convoy": applyRefugeeConvoyIntent,
  "intent.give_npc_task": applyGiveNpcTask,
  "intent.assign_npc_posting": applyAssignNpcPosting,
  "intent.recall_npc_posting": applyRecallNpcPosting,
  "intent.seat_npc_council": applySeatNpcCouncil,
  "intent.unseat_npc_council": applyUnseatNpcCouncil,
  "intent.set_council_portfolio": applySetCouncilPortfolio,
  "intent.assign_bloc_leader": applyAssignBlocLeader,
  "intent.assign_race_leader": applyAssignRaceLeader,
  "intent.research_upgrade": applyResearchUpgrade,
  "intent.set_research_queue": applySetResearchQueue,
  "intent.set_build_queue": applySetBuildQueue,
  "intent.found_hybrid_lineage": applyFoundHybridLineage,
  "intent.trade_tech": applyTradeTech,
  "intent.throw_quest_dice": applyThrowQuestDice,
  "intent.resolve_quest_choice": applyResolveQuestChoice,
  "intent.resolve_quest_dice": applyResolveQuestDice,
  "intent.gm.grant_power_touch": applyGrantPowerTouch,
  "intent.build": applyPlanetIntent("build"),
  "intent.demolish": applyPlanetIntent("demolish"),
  "intent.colonize": applyPlanetIntent("colonize"),
  "intent.set_colony_type": applyPlanetIntent("set_colony_type"),
  "intent.upgrade_grade": applyPlanetIntent("upgrade_grade"),
  "intent.make_diplo_offer": applyMakeDiploOffer,
};
`,
);

// Thin processTurn.mjs
const orchestrator = `/**
 * processTurn — tick orchestrator (intent apply + economy/combat/loyalty phases).
 * Intent applicators live in ./turn/*.
 */
import {
  backupTurnSnapshot,
  restoreTurnSnapshot,
  readLiveBoard,
  writeLiveBoard,
  setTableMeta,
  getTableMeta,
  writeTickJournal,
} from "./tableStore.mjs";
import { readIntents, writeIntents } from "./intents.mjs";
import {
  runEconomyTick,
  activatePendingPolicies,
} from "./economyTick.mjs";
import { matchMarketOffers } from "./marketOrders.mjs";
import {
  collectContactsAndAttacks,
  resolveOpenEngagements,
} from "./engagements.mjs";
import { runOpinionTick } from "./opinionTick.mjs";
import { getContent } from "./contentLoader.mjs";
import { runLoyaltyPhase } from "./loyalty.mjs";
import { applyStabilityRevolt } from "./stabilityRevolt.mjs";
import { sameMoscowDay } from "./tickScheduler.mjs";
import { runCivicTick } from "./civicTick.mjs";
import { expireRaceStateModifiers } from "./raceStates.mjs";
import {
  processSystemTimers,
  processNpcTasks,
  syncNpcPassiveEffects,
} from "./narrative.mjs";
import { resetAlchemyAttemptsForAll } from "./alchemyActions.mjs";
import { refreshAllFactionContacts } from "./factionIntel.mjs";
import { processIntelTick } from "./intel.mjs";
import { resolveVisibleWithFog, readFog } from "./fogStore.mjs";
import { computeAllFactionLogistics } from "./logistics.mjs";
import { expireQuests } from "./questEngine.mjs";
import { resolveDueOrders } from "./orderEngine.mjs";
import { refillAllForces } from "./forceMp.mjs";
import { journalPush } from "./turn/journal.mjs";
import { APPLIERS } from "./turn/appliers.mjs";
import { advanceUnitRoutes } from "./turn/movement.mjs";
import {
  applyCombatStance,
  applyRequestCardBattle,
  applyPlayCard,
} from "./turn/combatIntents.mjs";
import { advanceCaravans } from "./turn/economyIntents.mjs";
import {
  applyAllResearchQueues,
  applyAllBuildQueues,
} from "./turn/researchBuild.mjs";

/**
 * @param {{ force?: boolean, master?: boolean }} opts
 */
export function processTurn(opts = {}) {
${slice(1782, 2051)}
}

export { getLastJournal } from "./tableStore.mjs";
`;

fs.writeFileSync(srcPath, orchestrator);
console.log("wrote turn modules; processTurn lines", orchestrator.split("\n").length);
for (const f of fs.readdirSync(turnDir)) {
  console.log(
    " ",
    f,
    fs.readFileSync(path.join(turnDir, f), "utf8").split("\n").length,
  );
}
