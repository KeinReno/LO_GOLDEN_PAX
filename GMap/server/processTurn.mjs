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
} from "./economyTick.mjs";

function journalPush(journal, entry) {
  journal.push({ at: new Date().toISOString(), ...entry });
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
  const fromId = fleet.systemId;
  fleet.systemId = toId;
  fleet.route = [];
  fleet.stance = "move";
  journalPush(journal, {
    type: "move_fleet",
    intentId: intent.id,
    fleetId,
    fromId,
    toId,
    factionId: intent.factionId,
  });
  return true;
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
  legion.systemId = toId;
  legion.route = [];
  legion.status = "move";
  journalPush(journal, {
    type: "move_legion",
    intentId: intent.id,
    legionId,
    fromId,
    toId,
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
  // P5 will create Engagement; for now mark battle + move fleet if given
  sys.activity = "battle";
  if (intent.payload?.fleetId) {
    applyMoveFleet(world, intent, journal);
  }
  journalPush(journal, {
    type: "attack_marked",
    intentId: intent.id,
    systemId: toId,
    factionId: intent.factionId,
    note: "Engagement full resolve — P5",
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
  const result = transferResources(
    intent.factionId,
    intent.payload?.toFactionId,
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
  return true;
}

const APPLIERS = {
  "intent.move_fleet": applyMoveFleet,
  "intent.move_legion": applyMoveLegion,
  "intent.claim_system": applyClaim,
  "intent.attack_system": applyAttackMarker,
  "intent.scout_reveal": applyScoutReveal,
  "intent.set_tax": applySetTax,
  "intent.transfer": applyTransfer,
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
  const intents = readIntents()
    .filter((i) => i.status === "pending" && i.turn === turn)
    .sort((a, b) => {
      // transfers first, then rest by time
      const rank = (d) =>
        d === "intent.transfer" ? 0 : d === "intent.set_tax" ? 1 : 2;
      const r = rank(a.defId) - rank(b.defId);
      if (r !== 0) return r;
      return String(a.submittedAt).localeCompare(String(b.submittedAt));
    });

  setTableMeta({ tickFrozen: true });

  const nextIntents = readIntents();
  for (const intent of intents) {
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
  writeIntents(nextIntents);

  advanceCaravans(world);

  const econ = runEconomyTick(world, turn);
  for (const e of econ.journal) journalPush(journal, e);

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
