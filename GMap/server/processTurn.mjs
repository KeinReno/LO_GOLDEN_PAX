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
import {
  processSystemTimers,
  applyRefugeeConvoy,
  applyGiveNpcTask,
  processNpcTasks,
} from "./narrative.mjs";
import { researchUpgrade } from "./techActions.mjs";
import { hopPath, linkAllowsTravel } from "./pathfinding.mjs";
import {
  getKnownFactionIds,
  getTradePartnerIds,
  refreshAllFactionContacts,
} from "./factionIntel.mjs";
import { resolveVisibleWithFog, readFog } from "./fogStore.mjs";
import { computeAllFactionLogistics } from "./logistics.mjs";
import { expireQuests } from "./questEngine.mjs";
import {
  applyThrowQuestDice,
  applyResolveQuestChoice,
  applyResolveQuestDice,
} from "./questActions.mjs";

function journalPush(journal, entry) {
  journal.push({ at: new Date().toISOString(), ...entry });
}

/**
 * Start or complete travel along hyperlanes.
 * One hop this tick; remaining systems stay in fleet.route (incl. destination).
 * @param {"move"|"blockade"|"fortify"} arriveStance stance when route empties
 */
function beginFleetTravel(world, fleet, toId, arriveStance, journal, meta) {
  const fromId = fleet.systemId;
  if (fromId === toId) {
    fleet.route = [];
    fleet.stance = arriveStance;
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
  fleet.systemId = nextId;
  fleet.route = remaining.length ? [...remaining] : [];
  if (fleet.route.length === 0) {
    fleet.stance = arriveStance;
    delete fleet.pendingArrival;
  } else {
    fleet.stance = "move";
    fleet.pendingArrival = { stance: arriveStance, systemId: toId };
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

/** Advance fleets/legions with pending routes by one hop each tick. */
function advanceUnitRoutes(world, journal) {
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
    }
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
  return travel.ok;
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
  addPermanentReveal(intent.factionId, systemId);
  journalPush(journal, {
    type: "scout_reveal",
    intentId: intent.id,
    systemId,
    factionId: intent.factionId,
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
  "intent.set_tax": applySetTax,
  "intent.transfer": applyTransfer,
  "intent.break_treaty": applyBreakTreaty,
  "intent.market_convert": applyMarketConvert,
  "intent.market_offer": applyMarketOffer,
  "intent.market_cancel": applyMarketCancel,
  "intent.refugee_convoy": applyRefugeeConvoyIntent,
  "intent.give_npc_task": applyGiveNpcTask,
  "intent.research_upgrade": applyResearchUpgrade,
  "intent.throw_quest_dice": applyThrowQuestDice,
  "intent.resolve_quest_choice": applyResolveQuestChoice,
  "intent.resolve_quest_dice": applyResolveQuestDice,
};

function advanceCaravans(world) {
  for (const c of world.caravans ?? []) {
    c.progress = Math.min(1, (c.progress ?? 0) + 0.15);
    if (c.progress >= 1) {
      const tmp = c.fromSystemId;
      c.fromSystemId = c.toSystemId;
      c.toSystemId = tmp;
      c.progress = 0;
    }
  }
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

  // Continue multi-hop routes from previous ticks (one hop each).
  advanceUnitRoutes(world, journal);

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

  setTableMeta({ tickFrozen: true });

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

  const econ = runEconomyTick(world, turn);
  for (const e of econ.journal) journalPush(journal, e);

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

  return {
    ok: true,
    ...written,
    journal: briefing,
  };
}

export function getLastJournal() {
  return getTableMeta().lastJournal ?? null;
}
