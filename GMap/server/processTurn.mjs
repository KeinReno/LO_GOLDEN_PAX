/**
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
  const meta = getTableMeta();
  if (meta.tickFrozen && !opts.force) {
    return { ok: false, error: "Тик заморожен (tickFrozen)" };
  }
  // Auto/cron ticks: at most one per Moscow calendar day.
  // (Scheduler bug used to re-fire every 1s during 00:01 — this is the hard stop.)
  if (
    !opts.force &&
    meta.lastTickAt &&
    sameMoscowDay(meta.lastTickAt, new Date().toISOString())
  ) {
    return {
      ok: false,
      error: "Суточный тик уже выполнен сегодня (МСК)",
      lastTickAt: meta.lastTickAt,
    };
  }

  const world = readLiveBoard();
  if (!world) return { ok: false, error: "Нет published board" };

  const turn = world.meta?.turn ?? 0;
  const backupDir = backupTurnSnapshot(turn, "pre_tick");

  // Mid-tick lock reuses tickFrozen; finally always releases it so a throw
  // cannot leave the table permanently frozen (GM freeze is set outside ticks).
  // Turn++ stays at the end on purpose: live turn = playable turn for intents/UI.
  // On failure after economy writes ledger, restore pre_tick (incl. ledger) so a
  // retry cannot double-credit (option b — see C1 T1.4).
  let midTickLock = true;
  setTableMeta({ tickFrozen: true });
  try {
  // Tax/law pending from previous day
  activatePendingPolicies(world);

  const journal = [];
  processSystemTimers(world, turn, journal);
  processNpcTasks(world, turn, journal);
  syncNpcPassiveEffects(world);

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

  resolveDueOrders(world, turn, journal);

  applyAllResearchQueues(world, turn, journal);
  applyAllBuildQueues(world, turn, journal);

  const loyalty = runLoyaltyPhase(world, getContent());
  for (const e of loyalty.journal) journalPush(journal, e);

  const revolt = applyStabilityRevolt(world, getContent());
  for (const e of revolt.journal) journalPush(journal, e);

  const civic = runCivicTick(world, turn);
  for (const e of civic.journal) journalPush(journal, e);

  world.meta.turn = turn + 1;
  world.meta.updatedAt = new Date().toISOString();

  // Fuel MP pool: refill to max every turn, any location (forceMp layer).
  refillAllForces(world, getContent());

  // New turn → fresh alchemy attempts
  resetAlchemyAttemptsForAll(world);

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
  });
  writeTickJournal(briefing);
  midTickLock = false;

  return {
    ok: true,
    ...written,
    journal: briefing,
  };
  } catch (err) {
    try {
      restoreTurnSnapshot(backupDir);
      console.error(
        `[processTurn] tick failed at turn ${turn}; restored pre_tick snapshot from ${backupDir}`,
      );
    } catch (restoreErr) {
      console.error(
        "[processTurn] pre_tick restore failed after tick error:",
        restoreErr,
      );
    }
    throw err;
  } finally {
    if (midTickLock) {
      setTableMeta({ tickFrozen: false });
    }
  }
}

export { getLastJournal } from "./tableStore.mjs";
