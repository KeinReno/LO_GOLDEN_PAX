/**
 * Court roster + posting — unique live path (v0.5 onto GMap).
 *
 * Seats, blocs, and passive effects stay in courtGovernance.mjs (extended,
 * not replaced). courtProposals.mjs stays the deferred inbox.
 *
 * Unique vs GMap-before: every NPC has raceId; GM upsert/remove/setRuler
 * and seat lock/unlock/portfolio apply immediately; player posting/recall
 * and seat/unseat apply immediately (forceId accepted alongside
 * legionId/fleetId). Does not consume loyalty/revolt.
 */
import {
  ensurePlayerRulers,
  npcAvailable,
  syncNpcPassiveEffects,
  unlockCouncilSeat,
  lockCouncilSeat,
} from "./courtGovernance.mjs";
import {
  applySeatNpcCouncil,
  applyUnseatNpcCouncil,
  applySetCouncilPortfolio,
} from "./narrative.mjs";

export const NPC_STATUSES = ["active", "away", "busy", "dead", "hidden"];
export const POSTING_KINDS = ["governor", "commander", "admiral"];

export { npcAvailable };

export function isRulerNpc(fac, npcId) {
  if (!npcId) return false;
  if (fac?.rulerNpcId === npcId) return true;
  const npc = (fac?.npcs ?? []).find((n) => n.id === npcId);
  return !!npc?.isPlayerRuler;
}

export function defaultNpc(fields = {}) {
  const posting =
    fields.posting && typeof fields.posting === "object"
      ? { ...fields.posting }
      : { kind: "court", sinceTurn: fields.posting?.sinceTurn ?? 0 };
  return {
    ...fields,
    id: fields.id,
    name: fields.name,
    status: NPC_STATUSES.includes(fields.status) ? fields.status : "active",
    raceId: fields.raceId ?? null,
    traitIds: Array.isArray(fields.traitIds) ? [...fields.traitIds] : [],
    posting,
    councilSeat: fields.councilSeat ?? null,
    blocId: fields.blocId ?? null,
    isBlocLeader: !!fields.isBlocLeader,
    isPlayerRuler: !!fields.isPlayerRuler,
    raceLeadership: fields.raceLeadership?.raceId
      ? { ...fields.raceLeadership, raceId: fields.raceLeadership.raceId }
      : fields.raceLeadership ?? undefined,
    currentTask: fields.currentTask ?? null,
  };
}

function newNpcId() {
  return `npc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function courtPosting(turn) {
  return { kind: "court", sinceTurn: turn };
}

/**
 * @param {{ rulerNpcId?: string|null, npcs?: object[] }} faction
 * @param {object} patch
 */
export function upsertNpc(faction, patch) {
  if (!patch?.name) return { ok: false, error: "npc_params" };
  const id = patch.id || newNpcId();
  const npcs = Array.isArray(faction?.npcs) ? [...faction.npcs] : [];
  const idx = npcs.findIndex((n) => n.id === id);
  if (idx < 0 && patch.raceId == null) {
    return { ok: false, error: "npc_race_required" };
  }
  if (idx >= 0) npcs[idx] = defaultNpc({ ...npcs[idx], ...patch, id });
  else npcs.push(defaultNpc({ ...patch, id }));
  const next = { ...faction, npcs };
  const world = { factions: [next] };
  ensurePlayerRulers(world);
  return { ok: true, rulerNpcId: next.rulerNpcId ?? null, npcs: next.npcs, npc: next.npcs.find((n) => n.id === id) };
}

export function removeNpc(faction, npcId, { confirmSetRuler } = {}) {
  if (!confirmSetRuler && isRulerNpc(faction, npcId)) {
    return { ok: false, error: "ruler_locked" };
  }
  const npcs = Array.isArray(faction?.npcs) ? [...faction.npcs] : [];
  const nextNpcs = npcs.filter((n) => n.id !== npcId);
  if (nextNpcs.length === npcs.length) return { ok: false, error: "npc_missing" };
  let rulerNpcId = faction.rulerNpcId ?? null;
  if (rulerNpcId === npcId && confirmSetRuler) rulerNpcId = null;
  const next = { ...faction, npcs: nextNpcs, rulerNpcId };
  const world = { factions: [next] };
  ensurePlayerRulers(world);
  return { ok: true, rulerNpcId: next.rulerNpcId ?? null, npcs: next.npcs };
}

export function setRuler(faction, npcId, { confirmSetRuler } = {}) {
  if (!confirmSetRuler) return { ok: false, error: "confirm_required" };
  const npc = (faction.npcs ?? []).find((n) => n.id === npcId);
  if (!npc) return { ok: false, error: "npc_missing" };
  if (!npcAvailable(npc)) return { ok: false, error: "npc_unavailable" };
  const next = { ...faction, rulerNpcId: npcId, npcs: faction.npcs };
  const world = { factions: [next] };
  ensurePlayerRulers(world);
  return { ok: true, rulerNpcId: next.rulerNpcId ?? null, npcs: next.npcs };
}

/**
 * Pure posting assign. Target is already resolved (owner + kind).
 * Stores forceId plus GMap legionId/fleetId so courtGovernance postingTarget
 * and the v0.5 forceId shape both resolve.
 */
export function assignPosting({ npc, npcs, kind, targetId, faction, turn, target }) {
  if (!npc || !POSTING_KINDS.includes(kind) || !targetId) {
    return { ok: false, error: "npc_posting_params" };
  }
  if (npc.status === "dead" || npc.status === "hidden") {
    return { ok: false, error: "npc_unavailable" };
  }
  if (npc.isPlayerRuler || faction?.rulerNpcId === npc.id) {
    return { ok: false, error: "npc_is_player_ruler" };
  }
  if (npc.currentTask) return { ok: false, error: "npc_busy" };

  if (kind === "governor") {
    if (!target || target.ownerFactionId !== faction.id) {
      return { ok: false, error: "npc_posting_foreign" };
    }
  } else if (kind === "commander") {
    if (!target || target.factionId !== faction.id || target.kind !== "legion") {
      return { ok: false, error: "npc_posting_foreign" };
    }
  } else if (kind === "admiral") {
    if (!target || target.factionId !== faction.id || target.kind !== "fleet") {
      return { ok: false, error: "npc_posting_foreign" };
    }
  }

  const posting =
    kind === "governor"
      ? { kind, systemId: targetId, sinceTurn: turn }
      : kind === "commander"
        ? { kind, legionId: targetId, forceId: targetId, sinceTurn: turn }
        : { kind, fleetId: targetId, forceId: targetId, sinceTurn: turn };

  const next = (npcs ?? []).map((other) => {
    if (other.id === npc.id) {
      return { ...other, posting, status: "away", councilSeat: null };
    }
    const p = other.posting;
    if (!p) return other;
    const same =
      (kind === "governor" && p.kind === "governor" && p.systemId === targetId) ||
      (kind === "commander" &&
        p.kind === "commander" &&
        (p.legionId === targetId || p.forceId === targetId)) ||
      (kind === "admiral" &&
        p.kind === "admiral" &&
        (p.fleetId === targetId || p.forceId === targetId));
    if (!same) return other;
    return {
      ...other,
      posting: courtPosting(turn),
      status: other.status === "away" ? "active" : other.status,
    };
  });
  return { ok: true, npcs: next, posting };
}

export function recallPosting({ npc, npcs, turn }) {
  if (!npc) return { ok: false, error: "npc_missing" };
  const kind = npc.posting?.kind || "court";
  if (kind === "court") return { ok: false, error: "npc_already_at_court" };
  const next = (npcs ?? []).map((n) => {
    if (n.id !== npc.id) return n;
    return {
      ...n,
      posting: courtPosting(turn),
      status: n.status === "away" ? "active" : n.status,
    };
  });
  return { ok: true, npcs: next, fromKind: kind };
}

function findFaction(world, factionId) {
  return (world?.factions ?? []).find((f) => f.id === factionId) || null;
}

function writeFactionNpcs(fac, result) {
  fac.npcs = result.npcs;
  if ("rulerNpcId" in result) fac.rulerNpcId = result.rulerNpcId;
}

/** GM live upsert. Unique marker: court_roster_v05. */
export function applyUpsertNpc(world, { factionId, npc }) {
  const fac = findFaction(world, factionId);
  if (!fac) return { ok: false, error: "faction_missing" };
  const result = upsertNpc(fac, { ...npc });
  if (!result.ok) return result;
  writeFactionNpcs(fac, result);
  ensurePlayerRulers(world);
  syncNpcPassiveEffects(world);
  return { ok: true, npc: result.npc, rulerNpcId: fac.rulerNpcId ?? null, npcs: fac.npcs };
}

export function applyRemoveNpc(world, { factionId, npcId, confirmSetRuler }) {
  const fac = findFaction(world, factionId);
  if (!fac) return { ok: false, error: "faction_missing" };
  const result = removeNpc(fac, npcId, { confirmSetRuler });
  if (!result.ok) return result;
  writeFactionNpcs(fac, result);
  ensurePlayerRulers(world);
  syncNpcPassiveEffects(world);
  return { ok: true, rulerNpcId: fac.rulerNpcId ?? null, npcs: fac.npcs };
}

export function applySetRuler(world, { factionId, npcId, confirmSetRuler }) {
  const fac = findFaction(world, factionId);
  if (!fac) return { ok: false, error: "faction_missing" };
  const result = setRuler(fac, npcId, { confirmSetRuler });
  if (!result.ok) return result;
  writeFactionNpcs(fac, result);
  ensurePlayerRulers(world);
  syncNpcPassiveEffects(world);
  return { ok: true, rulerNpcId: fac.rulerNpcId ?? null, npcs: fac.npcs };
}

function resolvePostingLookup(world, kind, body) {
  const targetId =
    body.targetId || body.forceId || body.systemId || body.legionId || body.fleetId;
  if (kind === "governor") {
    const systemId = body.systemId || targetId;
    const sys = (world.systems ?? []).find((s) => s.id === systemId);
    return {
      targetId: systemId,
      target: sys ? { ownerFactionId: sys.ownerFactionId } : null,
      sys,
    };
  }
  if (kind === "commander") {
    const legionId = body.legionId || body.forceId || targetId;
    const legion = (world.legions ?? []).find((l) => l.id === legionId);
    return {
      targetId: legionId,
      target: legion
        ? { factionId: legion.factionId, kind: legion.kind || "legion" }
        : null,
      unit: legion,
    };
  }
  if (kind === "admiral") {
    const fleetId = body.fleetId || body.forceId || targetId;
    const fleet = (world.fleets ?? []).find((f) => f.id === fleetId);
    return {
      targetId: fleetId,
      target: fleet
        ? { factionId: fleet.factionId, kind: fleet.kind || "fleet" }
        : null,
      unit: fleet,
    };
  }
  return { targetId: null, target: null };
}

export function applyAssignNpcPosting(world, { factionId, npcId, kind, ...ids }) {
  const fac = findFaction(world, factionId);
  if (!fac) return { ok: false, error: "faction_missing" };
  const npc = (fac.npcs ?? []).find((n) => n.id === npcId);
  if (!npc) return { ok: false, error: "npc_missing" };
  const turn = world.meta?.turn ?? 0;
  const lookup = resolvePostingLookup(world, kind, ids);
  const result = assignPosting({
    npc,
    npcs: fac.npcs,
    kind,
    targetId: lookup.targetId,
    faction: { id: fac.id, rulerNpcId: fac.rulerNpcId },
    turn,
    target: lookup.target,
  });
  if (!result.ok) return result;
  fac.npcs = result.npcs;
  const posted = fac.npcs.find((n) => n.id === npcId);
  if (posted && lookup.sys) {
    posted.locationSystemId = lookup.sys.id;
    posted.locationSystemName = lookup.sys.name;
  } else if (posted && lookup.unit?.systemId) {
    posted.locationSystemId = lookup.unit.systemId;
    const sys = (world.systems ?? []).find((s) => s.id === lookup.unit.systemId);
    if (sys) posted.locationSystemName = sys.name;
  }
  syncNpcPassiveEffects(world);
  return { ok: true, npc: posted, npcs: fac.npcs, posting: posted?.posting };
}

export function applyRecallNpcPosting(world, { factionId, npcId }) {
  const fac = findFaction(world, factionId);
  if (!fac) return { ok: false, error: "faction_missing" };
  const npc = (fac.npcs ?? []).find((n) => n.id === npcId);
  if (!npc) return { ok: false, error: "npc_missing" };
  const result = recallPosting({ npc, npcs: fac.npcs, turn: world.meta?.turn ?? 0 });
  if (!result.ok) return result;
  fac.npcs = result.npcs;
  syncNpcPassiveEffects(world);
  return { ok: true, npc: fac.npcs.find((n) => n.id === npcId), npcs: fac.npcs, fromKind: result.fromKind };
}

function fromIntent(world, factionId, fn, payload) {
  const journal = [];
  const ok = fn(
    world,
    { id: "court_roster", factionId, payload },
    journal,
  );
  if (!ok) {
    const rej = journal.find((j) => j.type === "reject");
    return { ok: false, error: rej?.reason || "court_failed" };
  }
  const fac = findFaction(world, factionId);
  return {
    ok: true,
    npcs: fac?.npcs ?? [],
    council: fac?.council ?? null,
    npc: payload.npcId
      ? (fac?.npcs ?? []).find((n) => n.id === payload.npcId)
      : undefined,
  };
}

/** GM live unlock. Unique vs patch_council proposal inbox. */
export function applyUnlockSeat(world, { factionId, seatId }) {
  const fac = findFaction(world, factionId);
  if (!fac) return { ok: false, error: "faction_missing" };
  if (!seatId) return { ok: false, error: "council_seat_params" };
  unlockCouncilSeat(fac, seatId);
  syncNpcPassiveEffects(world);
  return { ok: true, council: fac.council, npcs: fac.npcs };
}

/** GM live lock — vacates the seat. */
export function applyLockSeat(world, { factionId, seatId }) {
  const fac = findFaction(world, factionId);
  if (!fac) return { ok: false, error: "faction_missing" };
  if (!seatId) return { ok: false, error: "council_seat_params" };
  lockCouncilSeat(fac, seatId);
  syncNpcPassiveEffects(world);
  return { ok: true, council: fac.council, npcs: fac.npcs };
}

export function applySetSeatPortfolio(world, { factionId, seatId, portfolioId }) {
  return fromIntent(world, factionId, applySetCouncilPortfolio, {
    seatId,
    portfolioId,
  });
}

export function applySeatNpc(world, { factionId, npcId, seatId }) {
  return fromIntent(world, factionId, applySeatNpcCouncil, { npcId, seatId });
}

export function applyUnseatNpc(world, { factionId, npcId }) {
  return fromIntent(world, factionId, applyUnseatNpcCouncil, { npcId });
}
