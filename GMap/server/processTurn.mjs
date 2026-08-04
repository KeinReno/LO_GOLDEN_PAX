/**
 * processTurn — P2.2/P2.4 minimal apply (moves + claim + turn++).
 */
import {
  backupTurnSnapshot,
  readLiveBoard,
  writeLiveBoard,
  setTableMeta,
  getTableMeta,
} from "./tableStore.mjs";
import { readIntents, writeIntents } from "./intents.mjs";
import { addPermanentReveal } from "./fogStore.mjs";
import {
  runEconomyTick,
  activatePendingPolicies,
  queueTaxChange,
  transferResources,
  marketConvert,
} from "./economyTick.mjs";
import {
  placeMarketOffer,
  cancelMarketOffer,
  matchMarketOffers,
} from "./marketOrders.mjs";
import {
  collectContactsAndAttacks,
  resolveOpenEngagements,
  setEngagementStance,
  requestCardBattle,
  playEngagementCard,
} from "./engagements.mjs";
import { runOpinionTick, breakTreaty, bumpOpinion } from "./opinionTick.mjs";
import { getContent } from "./contentLoader.mjs";
import { runLoyaltyPhase } from "./loyalty.mjs";
import { expireRaceStateModifiers } from "./raceStates.mjs";
import {
  processSystemTimers,
  applyRefugeeConvoy,
  applyGiveNpcTask,
  processNpcTasks,
} from "./narrative.mjs";
import { researchUpgrade, researchTech, setResearchQueue } from "./techActions.mjs";
import { foundHybridLineage } from "./hybridActions.mjs";
import { transferTech } from "./techPool.mjs";
import {
  applyPlanetAction,
  setBuildQueue,
  pushSystemHistory,
  BUILD_QUEUE_MAX,
} from "./planetActions.mjs";
import {
  readLedger,
  writeLedger,
  ensureFactionEco,
  ensureAllFactions,
  adjustStock,
} from "./ledger.mjs";
import { hopPath, linkAllowsTravel } from "./pathfinding.mjs";
import {
  getKnownFactionIds,
  getTradePartnerIds,
  refreshAllFactionContacts,
} from "./factionIntel.mjs";
import {
  bumpSystemIntel,
  canEspionage,
  getIntelRules,
  getLevel,
  markEspionageUsed,
  processIntelTick,
  setKnowledgeLevel,
  updateIntelFromDiplomacy,
} from "./intel.mjs";
import { resolveVisibleWithFog, readFog } from "./fogStore.mjs";
import { computeAllFactionLogistics } from "./logistics.mjs";
import { expireQuests } from "./questEngine.mjs";
import {
  applyThrowQuestDice,
  applyResolveQuestChoice,
  applyResolveQuestDice,
} from "./questActions.mjs";
import { createDiploOffer } from "./diploOffers.mjs";

function journalPush(journal, entry) {
  journal.push({ at: new Date().toISOString(), ...entry });
}

/** Recompute whether a system is blockaded (any idle blockading fleet present). */
function refreshSystemBlockade(world, systemId) {
  if (!systemId) return;
  const sys = (world.systems ?? []).find((s) => s.id === systemId);
  if (!sys) return;
  const still = (world.fleets ?? []).some(
    (f) =>
      f.systemId === systemId &&
      f.stance === "blockade" &&
      !(f.route && f.route.length),
  );
  sys.blockaded = still;
}

/** @deprecated alias — prefer refreshSystemBlockade */
function clearBlockadeIfEmpty(world, systemId) {
  refreshSystemBlockade(world, systemId);
}

/**
 * Start or complete travel along hyperlanes.
 * One hop this tick; remaining systems stay in fleet.route (incl. destination).
 * @param {"move"|"blockade"|"fortify"} arriveStance stance when route empties
 */
function beginFleetTravel(world, fleet, toId, arriveStance, journal, meta) {
  const fromId = fleet.systemId;
  const leftBlockade =
    fleet.stance === "blockade" && (fromId !== toId || arriveStance !== "blockade");
  if (fromId === toId) {
    fleet.route = [];
    fleet.stance = arriveStance;
    if (leftBlockade || arriveStance !== "blockade") {
      refreshSystemBlockade(world, fromId);
    }
    if (arriveStance === "blockade") {
      const sys = (world.systems ?? []).find((s) => s.id === toId);
      if (sys) sys.blockaded = true;
    }
    return { ok: true, fromId, toId, arrived: true, hopsLeft: 0 };
  }
  const path = hopPath(world, fromId, toId, "fleet");
  if (path.length < 2) {
    journalPush(journal, {
      type: "reject",
      intentId: meta.intentId,
      reason: "no_path",
      fleetId: fleet.id,
      fromId,
      toId,
    });
    return { ok: false };
  }
  // path[0]=from, path[1]=next, … path[n]=dest
  const nextId = path[1];
  const remaining = path.slice(2); // may be empty if 1-hop
  fleet.lastSystemId = fromId;
  fleet.systemId = nextId;
  fleet.route = remaining.length ? [...remaining] : [];
  if (fleet.route.length === 0) {
    fleet.stance = arriveStance;
    delete fleet.pendingArrival;
  } else {
    fleet.stance = "move";
    fleet.pendingArrival = {
      stance: arriveStance,
      systemId: toId,
      fromSystemId: fromId,
    };
  }
  if (leftBlockade || fromId !== nextId) {
    refreshSystemBlockade(world, fromId);
  }
  if (fleet.route.length === 0 && arriveStance === "blockade") {
    const sys = (world.systems ?? []).find((s) => s.id === toId);
    if (sys) sys.blockaded = true;
  }
  journalPush(journal, {
    type: meta.type,
    intentId: meta.intentId,
    fleetId: fleet.id,
    fromId,
    stepTo: nextId,
    toId,
    hopsLeft: fleet.route.length,
    arrived: fleet.route.length === 0,
    factionId: meta.factionId,
  });
  return {
    ok: true,
    fromId,
    toId,
    arrived: fleet.route.length === 0,
    hopsLeft: fleet.route.length,
  };
}

/**
 * Advance fleets/legions with pending routes by one hop each tick.
 * @param {Set<string>} [skipFleetIds] fleets with a new move/blockade/fortify intent this tick
 */
function advanceUnitRoutes(world, journal, skipFleetIds) {
  for (const fleet of world.fleets ?? []) {
    // Migrate legacy underscore fields from earlier builds.
    if (fleet._arriveStance && !fleet.pendingArrival) {
      fleet.pendingArrival = {
        stance: fleet._arriveStance,
        systemId: fleet._arriveSystemId || fleet.systemId,
      };
    }
    delete fleet._arriveStance;
    delete fleet._arriveSystemId;

    if (skipFleetIds?.has(fleet.id)) continue;

    const route = fleet.route ?? [];
    if (!route.length) {
      delete fleet.pendingArrival;
      continue;
    }
    const fromId = fleet.systemId;
    const nextId = route[0];
    const rest = route.slice(1);
    if (!(world.systems ?? []).some((s) => s.id === nextId)) {
      fleet.route = [];
      delete fleet.pendingArrival;
      continue;
    }
    const hopLink = (world.links ?? []).find(
      (l) =>
        (l.fromId === fromId && l.toId === nextId) ||
        (l.fromId === nextId && l.toId === fromId),
    );
    if (hopLink && !linkAllowsTravel(hopLink.type, "fleet")) {
      fleet.route = [];
      delete fleet.pendingArrival;
      journalPush(journal, {
        type: "reject",
        reason: "fleet_blocked_link",
        fleetId: fleet.id,
        fromId,
        toId: nextId,
        linkType: hopLink.type,
        factionId: fleet.factionId,
      });
      continue;
    }
    fleet.lastSystemId = fromId;
    fleet.systemId = nextId;
    fleet.route = rest;
    const arrived = rest.length === 0;
    if (arrived) {
      const stance = fleet.pendingArrival?.stance || "idle";
      fleet.stance = stance;
      if (stance === "blockade") {
        const sys = (world.systems ?? []).find((s) => s.id === nextId);
        if (sys) sys.blockaded = true;
      }
      delete fleet.pendingArrival;
    } else {
      fleet.stance = "move";
      if (fleet.pendingArrival) {
        fleet.pendingArrival.fromSystemId = fromId;
      }
    }
    clearBlockadeIfEmpty(world, fromId);
    journalPush(journal, {
      type: "route_step",
      fleetId: fleet.id,
      fromId,
      toId: nextId,
      hopsLeft: rest.length,
      arrived,
      factionId: fleet.factionId,
    });
  }
  for (const legion of world.legions ?? []) {
    const route = legion.route ?? [];
    if (!route.length) continue;
    const fromId = legion.systemId;
    const nextId = route[0];
    const rest = route.slice(1);
    if (!(world.systems ?? []).some((s) => s.id === nextId)) {
      legion.route = [];
      continue;
    }
    legion.lastSystemId = fromId;
    legion.systemId = nextId;
    legion.route = rest;
    legion.status = rest.length ? "move" : "idle";
    journalPush(journal, {
      type: "route_step_legion",
      legionId: legion.id,
      fromId,
      toId: nextId,
      hopsLeft: rest.length,
      arrived: rest.length === 0,
      factionId: legion.factionId,
    });
  }
}

function applyMoveFleet(world, intent, journal) {
  const fleetId = intent.payload?.fleetId;
  const toId = intent.payload?.toSystemId;
  const fleet = (world.fleets ?? []).find((f) => f.id === fleetId);
  if (!fleet) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "fleet_missing",
    });
    return false;
  }
  if (fleet.factionId !== intent.factionId) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "fleet_not_owned",
    });
    return false;
  }
  const sys = (world.systems ?? []).find((s) => s.id === toId);
  if (!sys) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "system_missing",
    });
    return false;
  }
  const travel = beginFleetTravel(world, fleet, toId, "idle", journal, {
    type: "move_fleet",
    intentId: intent.id,
    factionId: intent.factionId,
  });
  if (travel.ok) clearBlockadeIfEmpty(world, travel.fromId);
  return travel.ok;
}

function applyMoveLegion(world, intent, journal) {
  const legionId = intent.payload?.legionId;
  const toId = intent.payload?.toSystemId;
  const legion = (world.legions ?? []).find((l) => l.id === legionId);
  if (!legion || legion.factionId !== intent.factionId) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "legion_invalid",
    });
    return false;
  }
  if (!(world.systems ?? []).some((s) => s.id === toId)) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "system_missing",
    });
    return false;
  }
  const fromId = legion.systemId;
  if (fromId === toId) {
    legion.route = [];
    legion.status = "idle";
    journalPush(journal, {
      type: "move_legion",
      intentId: intent.id,
      legionId,
      fromId,
      toId,
      arrived: true,
      factionId: intent.factionId,
    });
    return true;
  }
  const path = hopPath(world, fromId, toId, "legion");
  if (path.length < 2) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "no_path",
    });
    return false;
  }
  const nextId = path[1];
  const remaining = path.slice(2);
  legion.lastSystemId = fromId;
  legion.systemId = nextId;
  legion.route = remaining;
  legion.status = remaining.length ? "move" : "idle";
  journalPush(journal, {
    type: "move_legion",
    intentId: intent.id,
    legionId,
    fromId,
    stepTo: nextId,
    toId,
    hopsLeft: remaining.length,
    arrived: remaining.length === 0,
    factionId: intent.factionId,
  });
  return true;
}

function applyClaim(world, intent, journal) {
  const toId = intent.payload?.toSystemId;
  const sys = (world.systems ?? []).find((s) => s.id === toId);
  if (!sys) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "system_missing",
    });
    return false;
  }
  const hasPresence =
    (world.fleets ?? []).some(
      (f) => f.factionId === intent.factionId && f.systemId === toId,
    ) ||
    (world.legions ?? []).some(
      (l) => l.factionId === intent.factionId && l.systemId === toId,
    );
  if (!hasPresence) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "no_presence",
      systemId: toId,
    });
    return false;
  }
  const prev = sys.ownerFactionId;
  if (prev && prev !== intent.factionId) {
    sys.contested = true;
    sys.coOwnerFactionIds = Array.from(
      new Set([...(sys.coOwnerFactionIds ?? []), intent.factionId, prev]),
    );
    journalPush(journal, {
      type: "claim_contested",
      intentId: intent.id,
      systemId: toId,
      factionId: intent.factionId,
      previousOwner: prev,
    });
  } else {
    sys.ownerFactionId = intent.factionId;
    sys.contested = false;
    pushSystemHistory(sys, {
      turn: world.meta?.turn ?? 0,
      type: "capture",
      description: `Система захвачена`,
    });
    journalPush(journal, {
      type: "claim_system",
      intentId: intent.id,
      systemId: toId,
      factionId: intent.factionId,
    });
  }
  return true;
}

function applyAttackMarker(world, intent, journal) {
  const toId = intent.payload?.toSystemId;
  const sys = (world.systems ?? []).find((s) => s.id === toId);
  if (!sys) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "system_missing",
    });
    return false;
  }
  // Move into theater; Engagement created after all intents, then resolved
  if (intent.payload?.fleetId) {
    if (!applyMoveFleet(world, intent, journal)) return false;
  }
  if (intent.payload?.legionId) {
    if (!applyMoveLegion(world, intent, journal)) return false;
  }
  sys.activity = "battle";
  journalPush(journal, {
    type: "attack_committed",
    intentId: intent.id,
    systemId: toId,
    factionId: intent.factionId,
    theater: intent.payload?.theater || "space",
    stance: intent.payload?.stance || "assault",
  });
  return true;
}

function applyCombatStance(world, intent, journal) {
  const engagementId = intent.payload?.engagementId;
  const stance = intent.payload?.stance;
  if (!engagementId || !stance) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "missing_engagement_or_stance",
    });
    return false;
  }
  const result = setEngagementStance(engagementId, intent.factionId, stance);
  if (!result.ok) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: result.error,
    });
    return false;
  }
  journalPush(journal, {
    type: "combat_stance",
    intentId: intent.id,
    engagementId,
    factionId: intent.factionId,
    stance,
  });
  return true;
}

function applyRequestCardBattle(world, intent, journal) {
  const engagementId = intent.payload?.engagementId;
  if (!engagementId) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "missing_engagement",
    });
    return false;
  }
  const result = requestCardBattle(engagementId, intent.factionId, world);
  if (!result.ok) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: result.error,
    });
    return false;
  }
  journalPush(journal, {
    type: "request_card_battle",
    intentId: intent.id,
    engagementId,
    factionId: intent.factionId,
    mutual: !!result.mutual,
    mode: result.engagement?.mode ?? result.mode,
  });
  return true;
}

function applyPlayCard(world, intent, journal) {
  const engagementId = intent.payload?.engagementId;
  const cardId = intent.payload?.cardId;
  if (!engagementId || !cardId) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "missing_engagement_or_card",
    });
    return false;
  }
  const result = playEngagementCard(
    engagementId,
    intent.factionId,
    cardId,
    world,
  );
  if (!result.ok) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: result.error,
    });
    return false;
  }
  for (const e of result.journal || []) journalPush(journal, e);
  journalPush(journal, {
    type: "play_card",
    intentId: intent.id,
    engagementId,
    factionId: intent.factionId,
    cardId,
    battleStatus: result.engagement?.cardBattle?.status,
  });
  return true;
}

function applyBlockade(world, intent, journal) {
  const fleetId = intent.payload?.fleetId;
  const toId = intent.payload?.toSystemId;
  const fleet = (world.fleets ?? []).find((f) => f.id === fleetId);
  if (!fleet) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "fleet_missing",
    });
    return false;
  }
  if (fleet.factionId !== intent.factionId) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "fleet_not_owned",
    });
    return false;
  }
  const sys = (world.systems ?? []).find((s) => s.id === toId);
  if (!sys) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "system_missing",
    });
    return false;
  }
  const travel = beginFleetTravel(world, fleet, toId, "blockade", journal, {
    type: "blockade",
    intentId: intent.id,
    factionId: intent.factionId,
  });
  if (!travel.ok) return false;
  clearBlockadeIfEmpty(world, travel.fromId);
  if (travel.arrived) {
    sys.blockaded = true;
    fleet.stance = "blockade";
  }
  return true;
}

function applyFortify(world, intent, journal) {
  const fleetId = intent.payload?.fleetId;
  const toId = intent.payload?.toSystemId;
  const fleet = (world.fleets ?? []).find((f) => f.id === fleetId);
  if (!fleet) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "fleet_missing",
    });
    return false;
  }
  if (fleet.factionId !== intent.factionId) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "fleet_not_owned",
    });
    return false;
  }
  if (toId && !(world.systems ?? []).some((s) => s.id === toId)) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "system_missing",
    });
    return false;
  }
  const holdSystemId = toId || fleet.systemId;
  const travel = beginFleetTravel(
    world,
    fleet,
    holdSystemId,
    "fortify",
    journal,
    {
      type: "fortify",
      intentId: intent.id,
      factionId: intent.factionId,
    },
  );
  if (travel.ok) clearBlockadeIfEmpty(world, travel.fromId);
  return travel.ok;
}

function applyPlanetIntent(action) {
  return (world, intent, journal) => {
    const result = applyPlanetAction({
      world,
      factionId: intent.factionId,
      action,
      systemId: intent.payload?.systemId,
      planetId: intent.payload?.planetId,
      buildingId: intent.payload?.buildingId,
      instanceId: intent.payload?.instanceId,
      colonyType: intent.payload?.colonyType,
      note: intent.note || intent.payload?.note,
      persist: false,
      skipApCheck: true,
      skipIntentRecord: true,
    });
    if (!result.ok) {
      journalPush(journal, {
        type: "reject",
        intentId: intent.id,
        reason: result.error || "planet_action_failed",
        action,
      });
      return false;
    }
    journalPush(journal, {
      type: action,
      intentId: intent.id,
      factionId: intent.factionId,
      systemId: intent.payload?.systemId,
      planetId: intent.payload?.planetId,
      buildingId: intent.payload?.buildingId || result.building?.buildingId,
      colonyType: intent.payload?.colonyType,
    });
    return true;
  };
}

function applyMakeDiploOffer(world, intent, journal) {
  const toFactionId = intent.payload?.toFactionId;
  if (!toFactionId) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "toFactionId_required",
    });
    return false;
  }
  const visible = resolveVisibleWithFog(world, intent.factionId, readFog());
  const known = getKnownFactionIds(world, intent.factionId, [...visible]);
  const result = createDiploOffer({
    fromFactionId: intent.factionId,
    toFactionId,
    give: intent.payload?.give,
    want: intent.payload?.want,
    note: intent.payload?.note || intent.note,
    turn: world.meta?.turn ?? 0,
    knownOk: known.has(toFactionId),
  });
  if (!result.ok) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: result.error || "diplo_offer_failed",
    });
    return false;
  }
  journalPush(journal, {
    type: "make_diplo_offer",
    intentId: intent.id,
    factionId: intent.factionId,
    toFactionId,
    offerId: result.offer?.id,
  });
  return true;
}

function applyScoutReveal(world, intent, journal) {
  const systemId = intent.payload?.systemId || intent.payload?.toSystemId;
  if (!systemId || !(world.systems ?? []).some((s) => s.id === systemId)) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "system_missing",
    });
    return false;
  }
  if (!factionHasScoutPresence(world, intent.factionId, systemId)) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "scout_presence_required",
    });
    return false;
  }
  addPermanentReveal(intent.factionId, systemId);
  journalPush(journal, {
    type: "scout_reveal",
    intentId: intent.id,
    systemId,
    factionId: intent.factionId,
  });
  return true;
}

/** Owned fleet/legion in target system or adjacent via hyperlane. */
function factionHasScoutPresence(world, factionId, systemId) {
  const near = new Set([systemId]);
  for (const l of world.links ?? []) {
    if (l.fromId === systemId) near.add(l.toId);
    else if (l.toId === systemId) near.add(l.fromId);
  }
  for (const f of world.fleets ?? []) {
    if (f.factionId === factionId && near.has(f.systemId)) return true;
  }
  for (const l of world.legions ?? []) {
    if (l.factionId === factionId && near.has(l.systemId)) return true;
  }
  return false;
}

function applyScoutWorld(world, intent, journal) {
  const systemId =
    intent.payload?.targetSystemId ||
    intent.payload?.systemId ||
    intent.payload?.toSystemId;
  const fleetId = intent.payload?.fleetId;
  const legionId = intent.payload?.legionId;
  if (!systemId || !(world.systems ?? []).some((s) => s.id === systemId)) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "system_missing",
    });
    return false;
  }
  const unit =
    (fleetId && (world.fleets ?? []).find((f) => f.id === fleetId)) ||
    (legionId && (world.legions ?? []).find((l) => l.id === legionId));
  if (!unit || unit.factionId !== intent.factionId) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "unit_required",
    });
    return false;
  }
  if (unit.systemId !== systemId) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "unit_not_in_system",
    });
    return false;
  }
  const rules = getIntelRules();
  const turn = world.meta?.turn ?? 0;
  bumpSystemIntel(world, intent.factionId, systemId, rules.scoutWorldIntel, {
    source: "scout",
    turn,
  });
  journalPush(journal, {
    type: "scout_world",
    intentId: intent.id,
    systemId,
    factionId: intent.factionId,
    intel: rules.scoutWorldIntel,
  });
  return true;
}

const ESPIONAGE_CATEGORIES = new Set([
  "tech",
  "building",
  "unit",
  "faction",
  "race",
]);

function applyEspionage(world, intent, journal) {
  const targetFactionId = intent.payload?.targetFactionId;
  const category = String(intent.payload?.intelCategory || "faction");
  if (!targetFactionId || targetFactionId === intent.factionId) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "target_required",
    });
    return false;
  }
  if (!ESPIONAGE_CATEGORIES.has(category)) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "bad_category",
    });
    return false;
  }
  const turn = world.meta?.turn ?? 0;
  if (!canEspionage(intent.factionId, targetFactionId, turn)) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "espionage_cooldown",
    });
    return false;
  }
  const rules = getIntelRules();
  const ledger = ensureAllFactions(readLedger(), world);
  const eco = ensureFactionEco(ledger, intent.factionId);
  const cost = rules.espionageCognitioCost ?? 10;
  const have = eco.stocks?.["currency.cognitio"] ?? 0;
  if (have < cost) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "need_cognitio",
    });
    return false;
  }
  adjustStock(ledger, intent.factionId, "currency.cognitio", -cost, {
    turn,
    reason: "espionage",
    intentId: intent.id,
  });
  writeLedger(ledger);

  const detected = Math.random() < rules.espionageDetectionChance;
  markEspionageUsed(intent.factionId, targetFactionId, turn);

  // Raise knowledge for category entities related to target
  const curFactionLevel = getLevel(intent.factionId, "faction", targetFactionId);
  setKnowledgeLevel(
    intent.factionId,
    "faction",
    targetFactionId,
    Math.max(curFactionLevel, 1) + (category === "faction" ? 1 : 0),
    { source: "espionage", turn },
  );

  if (category === "tech") {
    const partnerEco = ensureFactionEco(readLedger(), targetFactionId);
    for (const tid of partnerEco.unlockedTechs ?? []) {
      const lv = getLevel(intent.factionId, "tech", tid);
      setKnowledgeLevel(intent.factionId, "tech", tid, lv + 1, {
        source: "espionage",
        turn,
      });
    }
  } else if (category === "race") {
    const partner = (world.factions ?? []).find((f) => f.id === targetFactionId);
    for (const r of partner?.races ?? []) {
      const rid = typeof r === "string" ? r : r?.id;
      if (!rid) continue;
      const lv = getLevel(intent.factionId, "race", rid);
      setKnowledgeLevel(intent.factionId, "race", rid, lv + 1, {
        source: "espionage",
        turn,
      });
    }
  } else if (category === "unit") {
    const seed = (uid) => {
      if (!uid || typeof uid !== "string") return;
      const lv = getLevel(intent.factionId, "unit", uid);
      setKnowledgeLevel(intent.factionId, "unit", uid, lv + 1, {
        source: "espionage",
        turn,
      });
    };
    for (const f of world.fleets ?? []) {
      if (f.factionId !== targetFactionId) continue;
      seed(f.unitDefId ?? f.templateId ?? f.classId);
      for (const g of f.composition ?? []) {
        seed(g?.defId || g?.type);
      }
    }
    for (const l of world.legions ?? []) {
      if (l.factionId !== targetFactionId) continue;
      seed(l.unitDefId ?? l.templateId ?? l.classId);
      for (const g of l.composition ?? []) {
        seed(g?.defId || g?.type);
      }
    }
  } else if (category === "building") {
    for (const sys of world.systems ?? []) {
      if (sys.ownerFactionId !== targetFactionId) continue;
      for (const p of sys.planets ?? []) {
        const lists = [
          ...(p.buildings ?? []),
          ...(p.surfaceBuildings ?? []),
          ...(p.orbitalBuildings ?? []),
        ];
        for (const b of lists) {
          const bid = typeof b === "string" ? b : b?.buildingId ?? b?.id;
          if (!bid) continue;
          const lv = getLevel(intent.factionId, "building", bid);
          setKnowledgeLevel(intent.factionId, "building", bid, lv + 1, {
            source: "espionage",
            turn,
          });
        }
      }
    }
  }

  if (detected) {
    const target = (world.factions ?? []).find((f) => f.id === targetFactionId);
    const spy = (world.factions ?? []).find((f) => f.id === intent.factionId);
    if (target) {
      bumpOpinion(target, intent.factionId, -12, turn, "Разоблачённый шпионаж");
    }
    if (spy) {
      bumpOpinion(spy, targetFactionId, -4, turn, "Провал шпионажа");
    }
  }

  journalPush(journal, {
    type: "espionage",
    intentId: intent.id,
    factionId: intent.factionId,
    targetFactionId,
    category,
    detected,
    cognitioSpent: cost,
  });
  return true;
}

function applySetTax(world, intent, journal) {
  const slot = intent.payload?.taxSlot;
  const tierId = intent.payload?.tierId;
  const result = queueTaxChange(intent.factionId, slot, tierId);
  if (!result.ok) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: result.error,
    });
    return false;
  }
  journalPush(journal, {
    type: "set_tax_queued",
    intentId: intent.id,
    factionId: intent.factionId,
    taxSlot: slot,
    tierId,
    note: "применится со следующего тика",
  });
  return true;
}

const FLOW_CATS = new Set(["A", "B", "C", "D", "E", "F"]);

function applySetFlowPriority(world, intent, journal) {
  const from = String(intent.payload?.from || "").toUpperCase();
  const to = String(intent.payload?.to || "").toUpperCase();
  const systemId = intent.payload?.systemId
    ? String(intent.payload.systemId)
    : "_faction";
  if (!FLOW_CATS.has(from) || !FLOW_CATS.has(to) || from === to) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "нужны разные категории A–F (from→to)",
    });
    return false;
  }
  if (systemId !== "_faction") {
    const sys = (world.systems ?? []).find((s) => s.id === systemId);
    if (!sys || sys.ownerFactionId !== intent.factionId) {
      journalPush(journal, {
        type: "reject",
        intentId: intent.id,
        reason: "система не принадлежит фракции",
      });
      return false;
    }
  }
  const ledger = ensureAllFactions(readLedger(), world);
  const eco = ensureFactionEco(ledger, intent.factionId);
  if (!eco.flowPriorities) eco.flowPriorities = {};
  eco.flowPriorities[systemId] = { from, to, edge: `${from}->${to}` };
  writeLedger(ledger);
  journalPush(journal, {
    type: "set_flow_priority",
    intentId: intent.id,
    factionId: intent.factionId,
    systemId,
    from,
    to,
  });
  return true;
}

const ECONOMIC_POLICY_PRESETS = {
  military: {
    label: "Военная экономика",
    taxes: { "tax.industry": "high", "tax.supply": "low" },
  },
  trade: {
    label: "Торговая экспансия",
    taxes: { "tax.industry": "low", "tax.supply": "none" },
  },
  growth: {
    label: "Мирный рост",
    taxes: { "tax.industry": "none", "tax.supply": "none" },
  },
};

function applyReserveStock(world, intent, journal) {
  const currencyId = String(intent.payload?.currencyId || "");
  const amount = Math.floor(Number(intent.payload?.amount) || 0);
  const label = String(intent.payload?.label || "резерв").slice(0, 48);
  if (!currencyId || amount < 0) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "нужны currencyId и amount ≥ 0",
    });
    return false;
  }
  const ledger = ensureAllFactions(readLedger(), world);
  const eco = ensureFactionEco(ledger, intent.factionId);
  const stock = Number(eco.stocks?.[currencyId] ?? 0);
  if (!eco.stockReserves) eco.stockReserves = {};
  if (amount === 0) {
    delete eco.stockReserves[currencyId];
  } else {
    if (amount > stock) {
      journalPush(journal, {
        type: "reject",
        intentId: intent.id,
        reason: `недостаточно запаса (есть ${stock})`,
      });
      return false;
    }
    eco.stockReserves[currencyId] = { amount, label };
  }
  writeLedger(ledger);
  journalPush(journal, {
    type: "reserve_stock",
    intentId: intent.id,
    factionId: intent.factionId,
    currencyId,
    amount,
    label,
  });
  return true;
}

function applySetEconomicPolicy(world, intent, journal) {
  const policyId = String(intent.payload?.policyId || "");
  const preset = ECONOMIC_POLICY_PRESETS[policyId];
  if (!preset) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "неизвестная доктрина (military|trade|growth)",
    });
    return false;
  }
  for (const [slot, tierId] of Object.entries(preset.taxes)) {
    const result = queueTaxChange(intent.factionId, slot, tierId);
    if (!result.ok) {
      journalPush(journal, {
        type: "reject",
        intentId: intent.id,
        reason: result.error || `налог ${slot}`,
      });
      return false;
    }
  }
  const ledger = ensureAllFactions(readLedger(), world);
  const eco = ensureFactionEco(ledger, intent.factionId);
  eco.economicPolicy = policyId;
  writeLedger(ledger);
  journalPush(journal, {
    type: "set_economic_policy",
    intentId: intent.id,
    factionId: intent.factionId,
    policyId,
    label: preset.label,
    taxes: preset.taxes,
    note: "налоги в очереди на следующий тик",
  });
  return true;
}

function applyTransfer(world, intent, journal) {
  const toId = intent.payload?.toFactionId;
  const visible = resolveVisibleWithFog(world, intent.factionId, readFog());
  const known = getKnownFactionIds(world, intent.factionId, [...visible]);
  if (!toId || !known.has(toId)) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "получатель неизвестен (нет контакта)",
    });
    return false;
  }
  const result = transferResources(
    intent.factionId,
    toId,
    intent.payload?.currencyId || "currency.metal",
    intent.payload?.amount,
    world.meta?.turn,
    intent.id,
  );
  if (!result.ok) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: result.error,
    });
    return false;
  }
  journalPush(journal, {
    type: "transfer",
    intentId: intent.id,
    factionId: intent.factionId,
    toFactionId: intent.payload?.toFactionId,
    currencyId: intent.payload?.currencyId,
    amount: intent.payload?.amount,
  });
  const fromFac = (world.factions ?? []).find((f) => f.id === intent.factionId);
  const toFac = (world.factions ?? []).find((f) => f.id === toId);
  const turn = world.meta?.turn ?? 0;
  if (fromFac && toFac) {
    bumpOpinion(toFac, intent.factionId, 2, turn, "Получен перевод");
    bumpOpinion(fromFac, toId, 1, turn, "Отправлен перевод");
  }
  return true;
}

function applyBreakTreaty(world, intent, journal) {
  const withId = intent.payload?.withFactionId;
  if (!withId) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "withFactionId_missing",
    });
    return false;
  }
  const turn = world.meta?.turn ?? 0;
  breakTreaty(world, intent.factionId, withId, turn, getContent()?.diplomacy_stances);
  // Reset edge to neutral
  const [x, y] =
    intent.factionId < withId
      ? [intent.factionId, withId]
      : [withId, intent.factionId];
  const list = world.diplomacy ?? [];
  const idx = list.findIndex((d) => d.aId === x && d.bId === y);
  if (idx >= 0) {
    list[idx] = { ...list[idx], relation: "neutral" };
  }
  world.diplomacy = list;
  journalPush(journal, {
    type: "break_treaty",
    intentId: intent.id,
    factionId: intent.factionId,
    withFactionId: withId,
    treatyType: intent.payload?.treatyType ?? null,
  });
  return true;
}

function applyMarketOffer(world, intent, journal) {
  const venue =
    intent.payload?.venue === "common" ? "common" : "contacts";
  if (venue === "contacts") {
    const visible = resolveVisibleWithFog(world, intent.factionId, readFog());
    const known = getKnownFactionIds(world, intent.factionId, [...visible]);
    const partners = getTradePartnerIds(world, intent.factionId, known);
    if (partners.length === 0) {
      journalPush(journal, {
        type: "reject",
        intentId: intent.id,
        reason: "нет торговых партнёров (нужен договор trade/alliance)",
      });
      return false;
    }
  }
  const result = placeMarketOffer(
    intent.factionId,
    intent.payload?.side,
    intent.payload?.giveCurrency,
    intent.payload?.giveAmount,
    intent.payload?.wantCurrency,
    intent.payload?.wantAmount,
    world.meta?.turn,
    intent.id,
    venue,
  );
  if (!result.ok) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: result.error,
    });
    return false;
  }
  journalPush(journal, {
    type: "market_offer",
    intentId: intent.id,
    factionId: intent.factionId,
    offerId: result.offer.id,
    side: result.offer.side,
    giveCurrency: result.offer.giveCurrency,
    giveAmount: result.offer.giveAmount,
    wantCurrency: result.offer.wantCurrency,
    wantAmount: result.offer.wantAmount,
  });
  return true;
}

function applyMarketCancel(world, intent, journal) {
  const result = cancelMarketOffer(
    intent.payload?.offerId,
    intent.factionId,
    world.meta?.turn,
    intent.id,
  );
  if (!result.ok) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: result.error,
    });
    return false;
  }
  journalPush(journal, {
    type: "market_cancel",
    intentId: intent.id,
    factionId: intent.factionId,
    offerId: result.offer.id,
  });
  return true;
}

function applyMarketConvert(world, intent, journal) {
  const result = marketConvert(
    intent.factionId,
    intent.payload?.fromCurrency,
    intent.payload?.toCurrency,
    intent.payload?.amountFrom,
    intent.payload?.amountTo,
    world.meta?.turn,
    intent.id,
  );
  if (!result.ok) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: result.error,
    });
    return false;
  }
  journalPush(journal, {
    type: "market_convert",
    intentId: intent.id,
    factionId: intent.factionId,
    fromCurrency: intent.payload?.fromCurrency,
    toCurrency: intent.payload?.toCurrency,
    amountFrom: result.amountFrom,
    amountTo: result.amountTo,
  });
  return true;
}

function applyRefugeeConvoyIntent(world, intent, journal) {
  return applyRefugeeConvoy(world, intent, journal);
}

function applyResearchUpgrade(world, intent, journal) {
  const techId = intent.payload?.techId;
  const upgradeId = intent.payload?.upgradeId;
  if (!techId || !upgradeId) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "techId_upgradeId_required",
    });
    return false;
  }
  const result = researchUpgrade(intent.factionId, techId, upgradeId, {
    turn: world.meta?.turn ?? null,
    world,
    intentId: intent.id,
  });
  if (!result.ok) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: result.error,
    });
    return false;
  }
  journalPush(journal, {
    type: "research_upgrade",
    intentId: intent.id,
    factionId: intent.factionId,
    techId,
    upgradeId,
  });
  return true;
}

function applySetResearchQueue(world, intent, journal) {
  const queue = intent.payload?.queue;
  if (!Array.isArray(queue)) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "queue_required",
    });
    return false;
  }
  const result = setResearchQueue(intent.factionId, queue);
  if (!result.ok) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: result.error,
    });
    return false;
  }
  journalPush(journal, {
    type: "set_research_queue",
    intentId: intent.id,
    factionId: intent.factionId,
    queue: result.eco?.researchQueue ?? [],
  });
  return true;
}

function applyTradeTech(world, intent, journal) {
  const techId = intent.payload?.techId;
  const targetFactionId = intent.payload?.targetFactionId;
  const price = intent.payload?.price || {};
  if (!techId || !targetFactionId) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "techId_and_target_required",
    });
    return false;
  }
  const turn = world.meta?.turn ?? 0;
  const ledger = ensureAllFactions(readLedger(), world);
  const fromEco = ensureFactionEco(ledger, intent.factionId);
  const toEco = ensureFactionEco(ledger, targetFactionId);

  // Buyer (target) pays price to seller (intent faction) if price set
  for (const [cur, amt] of Object.entries(price)) {
    const n = Number(amt || 0);
    if (!n) continue;
    const buyerStock = toEco.stocks?.[cur] ?? 0;
    if (buyerStock < n) {
      journalPush(journal, {
        type: "reject",
        intentId: intent.id,
        reason: `buyer_cannot_afford_${cur}`,
      });
      return false;
    }
  }

  const result = transferTech(fromEco, toEco, techId, {
    turn,
    fromFactionId: intent.factionId,
    source: "trade",
  });
  if (!result.ok) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: result.error,
    });
    return false;
  }

  for (const [cur, amt] of Object.entries(price)) {
    const n = Number(amt || 0);
    if (!n) continue;
    adjustStock(ledger, targetFactionId, cur, -n, {
      turn,
      reason: "tech_trade_pay",
      intentId: intent.id,
    });
    adjustStock(ledger, intent.factionId, cur, n, {
      turn,
      reason: "tech_trade_recv",
      intentId: intent.id,
    });
  }
  writeLedger(ledger);
  journalPush(journal, {
    type: "trade_tech",
    intentId: intent.id,
    factionId: intent.factionId,
    targetFactionId,
    techId,
  });
  // Buyer learns tech fully; seller already owns it
  setKnowledgeLevel(targetFactionId, "tech", techId, 4, {
    source: "trade",
    turn,
  });
  setKnowledgeLevel(intent.factionId, "tech", techId, 4, {
    source: "own",
    turn,
  });
  updateIntelFromDiplomacy(world, intent.factionId, targetFactionId, "trade", {
    turn,
  });
  updateIntelFromDiplomacy(world, targetFactionId, intent.factionId, "trade", {
    turn,
  });
  return true;
}

function applySetBuildQueue(world, intent, journal) {
  const queue = intent.payload?.queue;
  if (!Array.isArray(queue)) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "queue_required",
    });
    return false;
  }
  if (queue.length > BUILD_QUEUE_MAX) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "queue_too_long",
    });
    return false;
  }
  const result = setBuildQueue(intent.factionId, queue);
  if (!result.ok) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: result.error,
    });
    return false;
  }
  journalPush(journal, {
    type: "set_build_queue",
    intentId: intent.id,
    factionId: intent.factionId,
    queue: result.eco?.buildQueue ?? [],
  });
  return true;
}

/**
 * After economy tick: try to build the first queued building per faction.
 * Leaves queue unchanged if unaffordable / blocked.
 */
function applyAllBuildQueues(world, turn, journal) {
  const content = getContent();
  const apMax = content.rules?.apPerTurn ?? 3;

  for (const fac of world.factions ?? []) {
    const ledger = ensureAllFactions(readLedger(), world);
    const eco = ensureFactionEco(ledger, fac.id);
    const queue = eco.buildQueue || [];
    if (queue.length === 0) continue;
    const first = queue[0];
    if (!first?.systemId || !first?.planetId || !first?.buildingId) {
      eco.buildQueue = queue.slice(1);
      writeLedger(ledger);
      continue;
    }
    const result = applyPlanetAction({
      world,
      factionId: fac.id,
      action: "build",
      systemId: first.systemId,
      planetId: first.planetId,
      buildingId: first.buildingId,
      note: `queue:${fac.id}`,
      apMax,
    });
    if (!result.ok) continue;
    const led = readLedger();
    const ecoAfter = ensureFactionEco(led, fac.id);
    const q = ecoAfter.buildQueue || [];
    if (
      q[0]?.systemId === first.systemId &&
      q[0]?.planetId === first.planetId &&
      q[0]?.buildingId === first.buildingId
    ) {
      ecoAfter.buildQueue = q.slice(1);
    } else {
      ecoAfter.buildQueue = q.slice(1);
    }
    writeLedger(led);
    journalPush(journal, {
      type: "build_queue",
      factionId: fac.id,
      systemId: first.systemId,
      planetId: first.planetId,
      buildingId: first.buildingId,
      buildingName: result.building?.name ?? first.buildingId,
    });
  }
}

/**
 * After economy tick: try to research the first queued tech per faction.
 * Leaves queue unchanged if unaffordable / blocked.
 */
function applyAllResearchQueues(world, turn, journal) {
  const ledger = ensureAllFactions(readLedger(), world);
  for (const fac of world.factions ?? []) {
    const eco = ensureFactionEco(ledger, fac.id);
    const queue = eco.researchQueue || [];
    if (queue.length === 0) continue;
    const firstTechId = queue[0];
    const result = researchTech(fac.id, firstTechId, {
      turn,
      world,
      intentId: firstTechId,
    });
    if (result.ok) {
      journalPush(journal, {
        type: "research_queue",
        factionId: fac.id,
        techId: firstTechId,
        techName: result.tech?.name ?? firstTechId,
      });
    }
  }
}

function applyFoundHybridLineage(world, intent, journal) {
  const systemId = intent.payload?.systemId;
  const planetId = intent.payload?.planetId;
  const raceA = intent.payload?.raceA;
  const raceB = intent.payload?.raceB;
  if (!systemId || !planetId || !raceA || !raceB) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: "system_planet_races_required",
    });
    return false;
  }
  const result = foundHybridLineage(
    intent.factionId,
    systemId,
    planetId,
    raceA,
    raceB,
    {
      turn: world.meta?.turn ?? null,
      world,
      intentId: intent.id,
    },
  );
  if (!result.ok) {
    journalPush(journal, {
      type: "reject",
      intentId: intent.id,
      reason: result.error,
    });
    return false;
  }
  journalPush(journal, {
    type: "found_hybrid_lineage",
    intentId: intent.id,
    factionId: intent.factionId,
    systemId,
    planetId,
    lineageId: result.lineageId,
  });
  return true;
}

const APPLIERS = {
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
  "intent.set_economic_policy": applySetEconomicPolicy,
  "intent.transfer": applyTransfer,
  "intent.break_treaty": applyBreakTreaty,
  "intent.market_convert": applyMarketConvert,
  "intent.market_offer": applyMarketOffer,
  "intent.market_cancel": applyMarketCancel,
  "intent.refugee_convoy": applyRefugeeConvoyIntent,
  "intent.give_npc_task": applyGiveNpcTask,
  "intent.research_upgrade": applyResearchUpgrade,
  "intent.set_research_queue": applySetResearchQueue,
  "intent.set_build_queue": applySetBuildQueue,
  "intent.found_hybrid_lineage": applyFoundHybridLineage,
  "intent.trade_tech": applyTradeTech,
  "intent.throw_quest_dice": applyThrowQuestDice,
  "intent.resolve_quest_choice": applyResolveQuestChoice,
  "intent.resolve_quest_dice": applyResolveQuestDice,
  "intent.build": applyPlanetIntent("build"),
  "intent.demolish": applyPlanetIntent("demolish"),
  "intent.colonize": applyPlanetIntent("colonize"),
  "intent.set_colony_type": applyPlanetIntent("set_colony_type"),
  "intent.make_diplo_offer": applyMakeDiploOffer,
};

function advanceCaravans(world) {
  const ledger = ensureAllFactions(readLedger(), world);
  const turn = world.meta?.turn ?? 0;
  let ledgerDirty = false;
  const remaining = [];
  for (const c of world.caravans ?? []) {
    c.progress = Math.min(1, (c.progress ?? 0) + 0.15);
    if (c.progress < 1) {
      remaining.push(c);
      continue;
    }
    // Arrived at destination — deliver cargo once, then despawn (no ping-pong).
    const cargo = c.cargo && typeof c.cargo === "object" ? c.cargo : null;
    if (cargo && c.factionId) {
      for (const [cur, amt] of Object.entries(cargo)) {
        const n = Number(amt) || 0;
        if (!n) continue;
        adjustStock(ledger, c.factionId, cur, n, {
          turn,
          reason: "caravan_delivery",
          intentId: c.id,
        });
        ledgerDirty = true;
      }
    }
  }
  world.caravans = remaining;
  if (ledgerDirty) writeLedger(ledger);
}

/**
 * @param {{ force?: boolean, master?: boolean }} opts
 */
export function processTurn(opts = {}) {
  const meta = getTableMeta();
  if (meta.tickFrozen && !opts.force) {
    return { ok: false, error: "Тик заморожен (tickFrozen)" };
  }

  const world = readLiveBoard();
  if (!world) return { ok: false, error: "Нет published board" };

  const turn = world.meta?.turn ?? 0;
  backupTurnSnapshot(turn, "pre_tick");

  // Tax/law pending from previous day
  activatePendingPolicies(world);

  const journal = [];
  processSystemTimers(world, turn, journal);
  processNpcTasks(world, turn, journal);

  const intents = readIntents()
    .filter((i) => i.status === "pending" && i.turn === turn)
    .sort((a, b) => {
      // transfers first, then rest by time
      const rank = (d) =>
        d === "intent.transfer" ||
        d === "intent.market_convert" ||
        d === "intent.market_offer" ||
        d === "intent.market_cancel"
          ? 0
          : d === "intent.set_tax"
            ? 1
            : 2;
      const r = rank(a.defId) - rank(b.defId);
      if (r !== 0) return r;
      return String(a.submittedAt).localeCompare(String(b.submittedAt));
    });

  // Skip route advance for fleets that also have a move/blockade/fortify intent
  // this tick — beginFleetTravel will hop once (avoids same-tick double hop).
  const pendingTravelFleetIds = new Set(
    intents
      .filter(
        (i) =>
          i.defId === "intent.move_fleet" ||
          i.defId === "intent.blockade" ||
          i.defId === "intent.fortify",
      )
      .map((i) => i.payload?.fleetId)
      .filter(Boolean),
  );
  advanceUnitRoutes(world, journal, pendingTravelFleetIds);

  // Mid-tick lock reuses tickFrozen; finally always releases it so a throw
  // cannot leave the table permanently frozen (GM freeze is set outside ticks).
  let midTickLock = true;
  setTableMeta({ tickFrozen: true });
  try {
  const nextIntents = readIntents();
  const deferredStance = [];
  const deferredCard = [];
  for (const intent of intents) {
    if (intent.defId === "intent.combat_stance") {
      deferredStance.push(intent);
      continue;
    }
    if (
      intent.defId === "intent.request_card_battle" ||
      intent.defId === "intent.play_card"
    ) {
      deferredCard.push(intent);
      continue;
    }
    const apply = APPLIERS[intent.defId];
    let ok = false;
    if (apply) {
      ok = apply(world, intent, journal);
    } else {
      journalPush(journal, {
        type: "skip",
        intentId: intent.id,
        defId: intent.defId,
        reason: "no_applier_yet",
      });
    }
    const idx = nextIntents.findIndex((i) => i.id === intent.id);
    if (idx >= 0) {
      nextIntents[idx] = {
        ...nextIntents[idx],
        status: ok ? "applied" : "rejected",
        resolvedAt: new Date().toISOString(),
      };
    }
  }

  const matchResult = matchMarketOffers(turn, world);
  for (const e of matchResult.journal) journalPush(journal, e);

  refreshAllFactionContacts(world, (w, fid) =>
    resolveVisibleWithFog(w, fid, readFog()),
  );
  processIntelTick(world, (w, fid) =>
    resolveVisibleWithFog(w, fid, readFog()),
  );

  // S4 logistics before combat + economy so combatDefMult / production use this tick's graph.
  computeAllFactionLogistics(world, getContent());

  // P5: engagements from attacks + auto war contacts
  const attackApplied = nextIntents.filter(
    (i) =>
      i.defId === "intent.attack_system" &&
      i.status === "applied" &&
      i.turn === turn,
  );
  const combatJournal = [];
  collectContactsAndAttacks(world, turn, attackApplied, combatJournal);

  // Card-battle requests after contact (mutual → mode=card)
  for (const intent of deferredCard.filter(
    (i) => i.defId === "intent.request_card_battle",
  )) {
    const ok = applyRequestCardBattle(world, intent, journal);
    const idx = nextIntents.findIndex((i) => i.id === intent.id);
    if (idx >= 0) {
      nextIntents[idx] = {
        ...nextIntents[idx],
        status: ok ? "applied" : "rejected",
        resolvedAt: new Date().toISOString(),
      };
    }
  }

  // Stance after contact (same-tick or leftover open engagements)
  for (const intent of deferredStance) {
    const ok = applyCombatStance(world, intent, journal);
    const idx = nextIntents.findIndex((i) => i.id === intent.id);
    if (idx >= 0) {
      nextIntents[idx] = {
        ...nextIntents[idx],
        status: ok ? "applied" : "rejected",
        resolvedAt: new Date().toISOString(),
      };
    }
  }

  // Starts card battles (prepare) or auto-resolves
  resolveOpenEngagements(world, combatJournal);

  // Play cards after battles are prepared
  for (const intent of deferredCard.filter(
    (i) => i.defId === "intent.play_card",
  )) {
    const ok = applyPlayCard(world, intent, journal);
    const idx = nextIntents.findIndex((i) => i.id === intent.id);
    if (idx >= 0) {
      nextIntents[idx] = {
        ...nextIntents[idx],
        status: ok ? "applied" : "rejected",
        resolvedAt: new Date().toISOString(),
      };
    }
  }

  for (const e of combatJournal) journalPush(journal, e);

  writeIntents(nextIntents);

  advanceCaravans(world);

  // A9: expire unresolved yearly quests before economy.
  expireQuests(world, turn, journal);

  const opinion = runOpinionTick(world, turn, getContent());
  for (const e of opinion.journal) journalPush(journal, e);

  const raceStateExpiry = expireRaceStateModifiers(turn);
  for (const id of raceStateExpiry.expired) {
    journalPush(journal, {
      type: "race_state_expired",
      turn,
      modifierId: id,
      description: `Истёк расовый модификатор ${id}`,
    });
  }

  const econ = runEconomyTick(world, turn);
  for (const e of econ.journal) journalPush(journal, e);

  applyAllResearchQueues(world, turn, journal);
  applyAllBuildQueues(world, turn, journal);

  const loyalty = runLoyaltyPhase(world, getContent());
  for (const e of loyalty.journal) journalPush(journal, e);

  world.meta.turn = turn + 1;
  world.meta.updatedAt = new Date().toISOString();

  const written = writeLiveBoard(world, {
    backup: false,
    reason: "tick",
  });

  const briefing = {
    turnFrom: turn,
    turnTo: turn + 1,
    economy: econ.breakdowns,
    events: journal,
  };

  setTableMeta({
    tickFrozen: false,
    lastTickAt: new Date().toISOString(),
    lastJournal: briefing,
  });
  midTickLock = false;

  return {
    ok: true,
    ...written,
    journal: briefing,
  };
  } finally {
    if (midTickLock) {
      setTableMeta({ tickFrozen: false });
    }
  }
}

export function getLastJournal() {
  return getTableMeta().lastJournal ?? null;
}
