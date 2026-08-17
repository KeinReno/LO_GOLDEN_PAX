/**
 * NPC court tasks / postings / council seating (A10).
 * Extracted from ../narrative.mjs — see that file's re-export barrel.
 */
import { getContent } from "../contentLoader.mjs";
import { rollNpcTaskProgress } from "../dice.mjs";
import {
  syncNpcPassiveEffects as syncNpcPassiveEffectsGov,
  isSeatUnlocked,
  ensureFactionCouncil,
  getPortfolioDef,
  npcTaskSpeedMult,
} from "../courtGovernance.mjs";

export { syncNpcPassiveEffectsGov as syncNpcPassiveEffects };

/** Default lifetime for NPC/quest lasting effects pushed onto faction.activeEffects. */
export const ACTIVE_EFFECT_DEFAULT_TURNS = 10;

const COURT_EVENTS_MAX = 80;

/** Append a court timeline event onto the world (ring buffer). */
export function pushCourtEvent(world, entry) {
  if (!Array.isArray(world.courtEvents)) world.courtEvents = [];
  const ev = {
    id:
      entry.id ||
      `ce_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    turn: entry.turn ?? world.meta?.turn ?? 0,
    at: entry.at || new Date().toISOString(),
    type: "court",
    text: entry.text || "",
    factionId: entry.factionId || null,
    npcId: entry.npcId || null,
    npcName: entry.npcName || null,
  };
  world.courtEvents.push(ev);
  if (world.courtEvents.length > COURT_EVENTS_MAX) {
    world.courtEvents = world.courtEvents.slice(-COURT_EVENTS_MAX);
  }
  return ev;
}

function resolveCourtTaskDef(content, taskId) {
  if (!taskId) return null;
  return (
    content.court_tasks?.tasks?.[taskId] ||
    content.npc_tasks?.[taskId] ||
    content.tasks?.[taskId] ||
    null
  );
}

function postingKindLabel(kind) {
  if (kind === "governor") return "губернатором";
  if (kind === "commander") return "командующим";
  if (kind === "admiral") return "флотоводцем";
  return "при дворе";
}

function cloneEffects(list) {
  if (!Array.isArray(list)) return [];
  return list.map((e) =>
    e && typeof e === "object"
      ? { ...e, args: e.args ? { ...e.args } : e.args }
      : e,
  );
}

/**
 * Assign a court task to an NPC (intent.give_npc_task).
 * Rejects if NPC missing, posted away from court, or already busy.
 */
export function applyGiveNpcTask(world, intent, journal) {
  const npcId = intent.payload?.npcId;
  const linkedQuestId = intent.payload?.linkedQuestId || null;
  // Never accept client-supplied effects — only content task defs.
  const taskId = intent.payload?.taskId || null;
  const content = getContent();
  const taskDef = resolveCourtTaskDef(content, taskId);
  const effects = cloneEffects(taskDef?.effects);
  const turn = world.meta?.turn ?? 0;

  let taskLabel = String(intent.payload?.taskLabel || "").trim();
  if (!taskLabel && taskDef?.label) taskLabel = String(taskDef.label);

  let etaTurn = Math.floor(Number(intent.payload?.etaTurn));
  if (
    (!Number.isFinite(etaTurn) || etaTurn <= turn) &&
    taskDef?.etaTurns != null
  ) {
    etaTurn = turn + Math.max(1, Math.floor(Number(taskDef.etaTurns)));
  }

  if (!npcId || !taskLabel) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "npc_task_params",
    });
    return false;
  }
  if (!Number.isFinite(etaTurn) || etaTurn <= turn) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "npc_task_eta",
    });
    return false;
  }

  const fac = (world.factions ?? []).find((f) => f.id === intent.factionId);
  if (!fac) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "faction_missing",
    });
    return false;
  }
  if (!Array.isArray(fac.npcs)) fac.npcs = [];
  const npc = fac.npcs.find((n) => n.id === npcId);
  if (!npc) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "npc_missing",
    });
    return false;
  }
  if (npc.currentTask) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "npc_busy",
      npcId,
    });
    return false;
  }
  if (npc.status === "dead" || npc.status === "hidden") {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "npc_unavailable",
      npcId,
    });
    return false;
  }
  const postingKind = npc.posting?.kind || "court";
  if (postingKind !== "court") {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "npc_posted",
      npcId,
      postingKind,
    });
    return false;
  }

  npc.currentTask = {
    id: `ntask_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    label: taskLabel,
    startedTurn: turn,
    etaTurn,
    progress: 0,
    effects,
    linkedQuestId: linkedQuestId || undefined,
    taskId: taskId || undefined,
  };
  npc.status = "busy";

  const text = `${npc.name}: поручение «${taskLabel}»`;
  pushCourtEvent(world, {
    turn,
    text,
    factionId: fac.id,
    npcId: npc.id,
    npcName: npc.name,
  });
  journal.push({
    type: "court",
    subtype: "npc_task_given",
    intentId: intent.id,
    factionId: fac.id,
    npcId: npc.id,
    npcName: npc.name,
    taskLabel,
    etaTurn,
    taskId: taskId || null,
  });
  return true;
}

/**
 * Assign NPC to a durable posting (governor / commander / admiral).
 */
export function applyAssignNpcPosting(world, intent, journal) {
  const npcId = intent.payload?.npcId;
  const kind = String(intent.payload?.kind || "").trim();
  const systemId = intent.payload?.systemId || null;
  const forceId = intent.payload?.forceId || null;
  let legionId = intent.payload?.legionId || null;
  let fleetId = intent.payload?.fleetId || null;
  if (forceId && !legionId && !fleetId) {
    if (kind === "commander") legionId = forceId;
    else if (kind === "admiral") fleetId = forceId;
  }
  const turn = world.meta?.turn ?? 0;

  if (!npcId || !["governor", "commander", "admiral"].includes(kind)) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "npc_posting_params",
    });
    return false;
  }

  const fac = (world.factions ?? []).find((f) => f.id === intent.factionId);
  if (!fac) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "faction_missing",
    });
    return false;
  }
  const npc = (fac.npcs ?? []).find((n) => n.id === npcId);
  if (!npc) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "npc_missing",
    });
    return false;
  }
  if (npc.status === "dead" || npc.status === "hidden") {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "npc_unavailable",
      npcId,
    });
    return false;
  }
  if (npc.isPlayerRuler || fac.rulerNpcId === npc.id) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "npc_is_player_ruler",
      npcId,
    });
    return false;
  }
  if (npc.currentTask) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "npc_busy",
      npcId,
    });
    return false;
  }

  /** Clear any other NPC already holding this post target. */
  const clearSameTarget = (pred) => {
    for (const other of fac.npcs ?? []) {
      if (other.id === npc.id) continue;
      if (other.posting && pred(other.posting)) {
        other.posting = { kind: "court", sinceTurn: turn };
        if (other.status === "away") other.status = "active";
      }
    }
  };

  let posting = { kind, sinceTurn: turn };
  let targetLabel = "";

  if (kind === "governor") {
    if (!systemId) {
      journal.push({
        type: "reject",
        intentId: intent.id,
        reason: "npc_posting_target",
      });
      return false;
    }
    const sys = (world.systems ?? []).find((s) => s.id === systemId);
    if (!sys || sys.ownerFactionId !== fac.id) {
      journal.push({
        type: "reject",
        intentId: intent.id,
        reason: "npc_posting_foreign",
        systemId,
      });
      return false;
    }
    clearSameTarget((p) => p.kind === "governor" && p.systemId === systemId);
    posting = { kind, systemId, sinceTurn: turn };
    targetLabel = sys.name || systemId;
    npc.locationSystemId = systemId;
    npc.locationSystemName = sys.name;
  } else if (kind === "commander") {
    if (!legionId) {
      journal.push({
        type: "reject",
        intentId: intent.id,
        reason: "npc_posting_target",
      });
      return false;
    }
    const legion = (world.legions ?? []).find((l) => l.id === legionId);
    if (!legion || legion.factionId !== fac.id) {
      journal.push({
        type: "reject",
        intentId: intent.id,
        reason: "npc_posting_foreign",
        legionId,
      });
      return false;
    }
    clearSameTarget(
      (p) =>
        p.kind === "commander" &&
        (p.legionId === legionId || p.forceId === legionId),
    );
    posting = { kind, legionId, forceId: legionId, sinceTurn: turn };
    targetLabel = legion.name || legionId;
    if (legion.systemId) {
      npc.locationSystemId = legion.systemId;
      const sys = (world.systems ?? []).find((s) => s.id === legion.systemId);
      if (sys) npc.locationSystemName = sys.name;
    }
  } else if (kind === "admiral") {
    if (!fleetId) {
      journal.push({
        type: "reject",
        intentId: intent.id,
        reason: "npc_posting_target",
      });
      return false;
    }
    const fleet = (world.fleets ?? []).find((f) => f.id === fleetId);
    if (!fleet || fleet.factionId !== fac.id) {
      journal.push({
        type: "reject",
        intentId: intent.id,
        reason: "npc_posting_foreign",
        fleetId,
      });
      return false;
    }
    clearSameTarget(
      (p) =>
        p.kind === "admiral" &&
        (p.fleetId === fleetId || p.forceId === fleetId),
    );
    posting = { kind, fleetId, forceId: fleetId, sinceTurn: turn };
    targetLabel = fleet.name || fleetId;
    if (fleet.systemId) {
      npc.locationSystemId = fleet.systemId;
      const sys = (world.systems ?? []).find((s) => s.id === fleet.systemId);
      if (sys) npc.locationSystemName = sys.name;
    }
  }

  npc.posting = posting;
  npc.status = "away";
  // Posted away from the capital table — leave the seat.
  npc.councilSeat = null;

  const text = `${npc.name} назначен ${postingKindLabel(kind)}${
    targetLabel ? ` · ${targetLabel}` : ""
  }`;
  pushCourtEvent(world, {
    turn,
    text,
    factionId: fac.id,
    npcId: npc.id,
    npcName: npc.name,
  });
  journal.push({
    type: "court",
    subtype: "npc_posting_assigned",
    intentId: intent.id,
    factionId: fac.id,
    npcId: npc.id,
    npcName: npc.name,
    kind,
    systemId: posting.systemId || null,
    legionId: posting.legionId || null,
    fleetId: posting.fleetId || null,
    forceId: posting.forceId || posting.legionId || posting.fleetId || null,
  });
  syncNpcPassiveEffectsGov(world);
  return true;
}

/** Recall NPC from posting back to court. */
export function applyRecallNpcPosting(world, intent, journal) {
  const npcId = intent.payload?.npcId;
  const turn = world.meta?.turn ?? 0;

  if (!npcId) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "npc_posting_params",
    });
    return false;
  }

  const fac = (world.factions ?? []).find((f) => f.id === intent.factionId);
  if (!fac) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "faction_missing",
    });
    return false;
  }
  const npc = (fac.npcs ?? []).find((n) => n.id === npcId);
  if (!npc) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "npc_missing",
    });
    return false;
  }
  const kind = npc.posting?.kind || "court";
  if (kind === "court") {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "npc_already_at_court",
      npcId,
    });
    return false;
  }

  npc.posting = { kind: "court", sinceTurn: turn };
  if (npc.status === "away") npc.status = "active";

  pushCourtEvent(world, {
    turn,
    text: `${npc.name} отозван ко двору`,
    factionId: fac.id,
    npcId: npc.id,
    npcName: npc.name,
  });
  journal.push({
    type: "court",
    subtype: "npc_posting_recalled",
    intentId: intent.id,
    factionId: fac.id,
    npcId: npc.id,
    npcName: npc.name,
    fromKind: kind,
  });
  syncNpcPassiveEffectsGov(world);
  return true;
}

/** Seat NPC at a council table slot (0 AP, instant). */
export function applySeatNpcCouncil(world, intent, journal) {
  const npcId = intent.payload?.npcId;
  const seatId = String(intent.payload?.seatId || "").trim();
  const content = getContent();
  const seatDef = content.council_seats?.seats?.[seatId];
  const fac = (world.factions ?? []).find((f) => f.id === intent.factionId);
  const extra = fac?.council?.extraSeats?.find((s) => s.id === seatId);

  if (!npcId || !seatId || (!seatDef && !extra)) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "council_seat_params",
    });
    return false;
  }

  if (!fac) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "faction_missing",
    });
    return false;
  }
  if (!isSeatUnlocked(fac, seatId, content)) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "council_seat_locked",
      seatId,
    });
    return false;
  }
  const npc = (fac.npcs ?? []).find((n) => n.id === npcId);
  if (!npc) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "npc_missing",
    });
    return false;
  }
  if (npc.status === "dead" || npc.status === "hidden") {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "npc_unavailable",
      npcId,
    });
    return false;
  }
  if (seatDef?.kind === "ruler" || seatId === "seat.ruler") {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "council_seat_ruler_locked",
      seatId,
    });
    return false;
  }
  if (npc.isPlayerRuler || fac.rulerNpcId === npc.id) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "npc_is_player_ruler",
      npcId,
    });
    return false;
  }
  // Prefer preferred roles when seat lists them (at_large accepts all).
  const preferred = Array.isArray(seatDef?.roles) ? seatDef.roles : [];
  if (preferred.length && npc.role && !preferred.includes(npc.role)) {
    // Soft allow: still seat, but journal notes mismatch — UX filters pool.
  }

  // Seat swap: if mover already sits elsewhere and target is occupied,
  // swap seats. If mover came from the pool, displace occupant to pool.
  const fromSeat =
    typeof npc.councilSeat === "string" && npc.councilSeat
      ? npc.councilSeat
      : null;
  let displacedNpcId = null;
  let swapped = false;

  for (const other of fac.npcs ?? []) {
    if (other.id === npc.id) continue;
    if (other.councilSeat !== seatId) continue;
    if (other.isPlayerRuler || fac.rulerNpcId === other.id) {
      journal.push({
        type: "reject",
        intentId: intent.id,
        reason: "council_seat_ruler_locked",
        seatId,
      });
      return false;
    }
    displacedNpcId = other.id;
    if (fromSeat && fromSeat !== seatId && fromSeat !== "seat.ruler") {
      other.councilSeat = fromSeat;
      swapped = true;
    } else {
      other.councilSeat = null;
    }
  }

  npc.councilSeat = seatId;
  journal.push({
    type: "court",
    subtype: "npc_council_seated",
    intentId: intent.id,
    factionId: fac.id,
    npcId: npc.id,
    npcName: npc.name,
    seatId,
    fromSeat,
    swapped,
    displacedNpcId,
  });
  syncNpcPassiveEffectsGov(world);
  return true;
}

/** Remove NPC from council table into the pool. */
export function applyUnseatNpcCouncil(world, intent, journal) {
  const npcId = intent.payload?.npcId;
  if (!npcId) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "council_seat_params",
    });
    return false;
  }
  const fac = (world.factions ?? []).find((f) => f.id === intent.factionId);
  if (!fac) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "faction_missing",
    });
    return false;
  }
  const npc = (fac.npcs ?? []).find((n) => n.id === npcId);
  if (!npc) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "npc_missing",
    });
    return false;
  }
  if (!npc.councilSeat) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "npc_not_seated",
      npcId,
    });
    return false;
  }
  if (
    npc.isPlayerRuler ||
    fac.rulerNpcId === npc.id ||
    npc.councilSeat === "seat.ruler"
  ) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "council_seat_ruler_locked",
      npcId,
    });
    return false;
  }
  const fromSeat = npc.councilSeat;
  npc.councilSeat = null;
  journal.push({
    type: "court",
    subtype: "npc_council_unseated",
    intentId: intent.id,
    factionId: fac.id,
    npcId: npc.id,
    npcName: npc.name,
    seatId: fromSeat,
  });
  syncNpcPassiveEffectsGov(world);
  return true;
}

/** Set specialty (portfolio) under a council advisor seat. */
export function applySetCouncilPortfolio(world, intent, journal) {
  const seatId = String(intent.payload?.seatId || "").trim();
  const portfolioId = String(intent.payload?.portfolioId || "").trim();
  const content = getContent();

  if (!seatId || !portfolioId) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "council_portfolio_params",
    });
    return false;
  }

  const fac = (world.factions ?? []).find((f) => f.id === intent.factionId);
  if (!fac) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "faction_missing",
    });
    return false;
  }

  const seatDef = content.council_seats?.seats?.[seatId];
  const extra = (fac.council?.extraSeats ?? []).find((s) => s.id === seatId);
  if (!seatDef && !extra) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "council_seat_unknown",
      seatId,
    });
    return false;
  }
  if (seatDef?.kind === "ruler" || seatId === "seat.ruler") {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "council_portfolio_ruler",
      seatId,
    });
    return false;
  }
  if (!isSeatUnlocked(fac, seatId, content) && !extra) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "council_seat_locked",
      seatId,
    });
    return false;
  }
  if (!getPortfolioDef(portfolioId, content)) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "council_portfolio_unknown",
      portfolioId,
    });
    return false;
  }

  const council = ensureFactionCouncil(fac, content);
  council.seatPortfolios = {
    ...(council.seatPortfolios || {}),
    [seatId]: portfolioId,
  };

  // Soft-align occupant role to portfolio preferred roles (task filters).
  const preferred = getPortfolioDef(portfolioId, content)?.roles?.[0];
  if (preferred) {
    for (const npc of fac.npcs ?? []) {
      if (npc.councilSeat === seatId && npc.role !== "ruler") {
        npc.role = preferred;
      }
    }
  }

  journal.push({
    type: "court",
    subtype: "council_portfolio_set",
    intentId: intent.id,
    factionId: fac.id,
    seatId,
    portfolioId,
  });
  syncNpcPassiveEffectsGov(world);
  return true;
}

/** Appoint NPC as head of an internal house/order. */
export function applyAssignBlocLeader(world, intent, journal) {
  const npcId = intent.payload?.npcId;
  const blocId = String(intent.payload?.blocId || "").trim();
  if (!npcId || !blocId) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "bloc_leader_params",
    });
    return false;
  }
  const fac = (world.factions ?? []).find((f) => f.id === intent.factionId);
  if (!fac) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "faction_missing",
    });
    return false;
  }
  const bloc = (fac.internalBlocs ?? []).find((b) => b.id === blocId);
  if (!bloc) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "bloc_missing",
      blocId,
    });
    return false;
  }
  const npc = (fac.npcs ?? []).find((n) => n.id === npcId);
  if (!npc || npc.status === "dead" || npc.status === "hidden") {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "npc_unavailable",
      npcId,
    });
    return false;
  }
  if (npc.isPlayerRuler || fac.rulerNpcId === npc.id) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "npc_is_player_ruler",
      npcId,
    });
    return false;
  }
  for (const other of fac.npcs ?? []) {
    if (other.blocId === blocId && other.isBlocLeader) {
      other.isBlocLeader = false;
    }
  }
  npc.blocId = blocId;
  npc.isBlocLeader = true;
  bloc.leaderNpcId = npc.id;
  const turn = world.meta?.turn ?? 0;
  pushCourtEvent(world, {
    turn,
    text: `${npc.name} возглавляет ${bloc.name}`,
    factionId: fac.id,
    npcId: npc.id,
    npcName: npc.name,
  });
  journal.push({
    type: "court",
    subtype: "bloc_leader_assigned",
    intentId: intent.id,
    factionId: fac.id,
    npcId: npc.id,
    blocId,
  });
  syncNpcPassiveEffectsGov(world);
  return true;
}

/** Appoint NPC as leader of a people/race inside the polity. */
export function applyAssignRaceLeader(world, intent, journal) {
  const npcId = intent.payload?.npcId;
  const raceId = String(intent.payload?.raceId || "").trim();
  const title =
    typeof intent.payload?.title === "string" && intent.payload.title.trim()
      ? intent.payload.title.trim()
      : undefined;
  if (!npcId || !raceId) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "race_leader_params",
    });
    return false;
  }
  const fac = (world.factions ?? []).find((f) => f.id === intent.factionId);
  if (!fac) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "faction_missing",
    });
    return false;
  }
  const npc = (fac.npcs ?? []).find((n) => n.id === npcId);
  if (!npc || npc.status === "dead" || npc.status === "hidden") {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "npc_unavailable",
      npcId,
    });
    return false;
  }
  if (npc.isPlayerRuler || fac.rulerNpcId === npc.id) {
    journal.push({
      type: "reject",
      intentId: intent.id,
      reason: "npc_is_player_ruler",
      npcId,
    });
    return false;
  }
  for (const other of fac.npcs ?? []) {
    if (
      other.id !== npc.id &&
      other.raceLeadership?.raceId === raceId
    ) {
      other.raceLeadership = null;
    }
  }
  npc.raceLeadership = title ? { raceId, title } : { raceId };
  const turn = world.meta?.turn ?? 0;
  const raceName =
    (world.races ?? []).find((r) => r.id === raceId)?.name || raceId;
  pushCourtEvent(world, {
    turn,
    text: `${npc.name} — голос народа ${raceName}`,
    factionId: fac.id,
    npcId: npc.id,
    npcName: npc.name,
  });
  journal.push({
    type: "court",
    subtype: "race_leader_assigned",
    intentId: intent.id,
    factionId: fac.id,
    npcId: npc.id,
    raceId,
  });
  syncNpcPassiveEffectsGov(world);
  return true;
}

function advanceLinkedQuest(world, linkedQuestId, journal, ctx) {
  if (!linkedQuestId) return;
  const quest = (world.quests ?? []).find((q) => q.id === linkedQuestId);
  if (!quest) return;
  if (!quest.arc || !Array.isArray(quest.arc.stages)) {
    journal.push({
      type: "court",
      subtype: "quest_task_done",
      questId: linkedQuestId,
      npcId: ctx.npcId,
    });
    return;
  }
  const cur = quest.arc.currentStage ?? 0;
  const next = cur + 1;
  if (next >= quest.arc.stages.length) {
    quest.arc.currentStage = quest.arc.stages.length - 1;
    if (quest.status === "active") quest.status = "done";
    journal.push({
      type: "court",
      subtype: "quest_arc_complete",
      questId: quest.id,
      npcId: ctx.npcId,
    });
  } else {
    quest.arc.currentStage = next;
    journal.push({
      type: "court",
      subtype: "quest_arc_advance",
      questId: quest.id,
      stage: next,
      npcId: ctx.npcId,
    });
  }
}

/**
 * Tick progress for all NPCs with currentTask.
 * Quest-linked tasks use server dice for progress variance (A10 T10.8).
 */
export function processNpcTasks(world, turn, journal) {
  let n = 0;
  for (const fac of world.factions ?? []) {
    if (!Array.isArray(fac.npcs)) continue;
    for (const npc of fac.npcs) {
      const task = npc.currentTask;
      if (!task) continue;

      const duration = Math.max(
        1,
        (task.etaTurn ?? turn + 1) - (task.startedTurn ?? turn),
      );
      let step = (1 / duration) * npcTaskSpeedMult(fac);
      let diceRoll = null;
      if (task.linkedQuestId) {
        const r = rollNpcTaskProgress(world, npc);
        step *= r.mult;
        diceRoll = r.roll;
      }

      task.progress = Math.min(1, (task.progress ?? 0) + step);
      n++;

      const done =
        (task.progress ?? 0) >= 1 || turn >= (task.etaTurn ?? Infinity);
      if (!done) continue;

      const effects = Array.isArray(task.effects) ? task.effects : [];
      if (effects.length) {
        if (!Array.isArray(fac.activeEffects)) fac.activeEffects = [];
        for (const e of effects) {
          fac.activeEffects.push({
            ...e,
            expiresTurn:
              e.expiresTurn != null
                ? Number(e.expiresTurn)
                : turn + ACTIVE_EFFECT_DEFAULT_TURNS,
            source: e.source || {
              kind: "npc_task",
              id: task.id,
              label: `${npc.name}: ${task.label}`,
            },
          });
        }
      }

      pushCourtEvent(world, {
        turn,
        text: `${npc.name} завершил задачу «${task.label}»`,
        factionId: fac.id,
        npcId: npc.id,
        npcName: npc.name,
      });
      journal.push({
        type: "court",
        subtype: "npc_task_complete",
        factionId: fac.id,
        npcId: npc.id,
        npcName: npc.name,
        taskLabel: task.label,
        taskId: task.id,
        diceRoll,
        effectsApplied: effects.length,
      });

      advanceLinkedQuest(world, task.linkedQuestId, journal, {
        npcId: npc.id,
      });

      delete npc.currentTask;
      if (npc.status === "busy") npc.status = "active";
    }
  }
  return n;
}
