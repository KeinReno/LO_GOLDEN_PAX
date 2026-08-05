/**
 * Court edit proposals — drafts stay off the live board until master accepts.
 */
import path from "node:path";
import {
  DATA_DIR,
  readJson,
  writeJson,
  bumpTableRevision,
  readLiveBoard,
  writeLiveBoard,
} from "./tableStore.mjs";
import {
  ensurePlayerRulers,
  syncNpcPassiveEffects,
  ensureFactionCouncil,
  ensureInternalBlocs,
} from "./courtGovernance.mjs";
import { getContent } from "./contentLoader.mjs";

export const COURT_PROPOSALS_PATH = path.join(DATA_DIR, "pending-court.json");

const VALID_OPS = new Set([
  "upsert_npc",
  "remove_npc",
  "upsert_bloc",
  "remove_bloc",
  "patch_council",
  "set_ruler",
]);

function emptyStore() {
  return { version: 1, proposals: [] };
}

export function readCourtProposals() {
  const raw = readJson(COURT_PROPOSALS_PATH, null);
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.proposals)) {
    return emptyStore();
  }
  return { version: raw.version ?? 1, proposals: raw.proposals };
}

export function writeCourtProposals(store) {
  writeJson(COURT_PROPOSALS_PATH, {
    version: store.version ?? 1,
    proposals: store.proposals ?? [],
  });
}

function newId() {
  return `courtprop_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function isRulerNpc(fac, npcId) {
  if (!npcId) return false;
  if (fac.rulerNpcId === npcId) return true;
  const npc = (fac.npcs ?? []).find((n) => n.id === npcId);
  return !!npc?.isPlayerRuler;
}

function validateOp(op, fac, confirmSetRuler) {
  if (!op || typeof op !== "object" || !VALID_OPS.has(op.op)) {
    return { ok: false, error: `неизвестная операция: ${op?.op ?? "?"}` };
  }

  switch (op.op) {
    case "upsert_npc": {
      const npc = op.npc;
      if (!npc || typeof npc !== "object" || !npc.id || !npc.name) {
        return { ok: false, error: "upsert_npc: нужны npc.id и npc.name" };
      }
      return { ok: true };
    }
    case "remove_npc": {
      const npcId = String(op.npcId || "");
      if (!npcId) return { ok: false, error: "remove_npc: нужен npcId" };
      if (!confirmSetRuler && isRulerNpc(fac, npcId)) {
        return {
          ok: false,
          error:
            "remove_npc: нельзя удалить правителя без confirmSetRuler",
        };
      }
      return { ok: true };
    }
    case "upsert_bloc": {
      const bloc = op.bloc;
      if (!bloc || typeof bloc !== "object" || !bloc.id || !bloc.name) {
        return { ok: false, error: "upsert_bloc: нужны bloc.id и bloc.name" };
      }
      return { ok: true };
    }
    case "remove_bloc": {
      if (!op.blocId) return { ok: false, error: "remove_bloc: нужен blocId" };
      return { ok: true };
    }
    case "patch_council": {
      if (!op.council || typeof op.council !== "object") {
        return { ok: false, error: "patch_council: нужен объект council" };
      }
      return { ok: true };
    }
    case "set_ruler": {
      if (!op.npcId) return { ok: false, error: "set_ruler: нужен npcId" };
      if (!confirmSetRuler) {
        return {
          ok: false,
          error: "set_ruler: нужен confirmSetRuler на предложении",
        };
      }
      return { ok: true };
    }
    default:
      return { ok: false, error: `неизвестная операция: ${op.op}` };
  }
}

function validateOps(ops, fac, confirmSetRuler) {
  if (!Array.isArray(ops) || ops.length === 0) {
    return { ok: false, error: "ops: нужен непустой массив" };
  }
  const hasSetRuler = ops.some((o) => o?.op === "set_ruler");
  if (hasSetRuler && !confirmSetRuler) {
    return {
      ok: false,
      error: "ops с set_ruler требуют confirmSetRuler: true",
    };
  }
  for (const op of ops) {
    const check = validateOp(op, fac, confirmSetRuler);
    if (!check.ok) return check;
  }
  return { ok: true };
}

function applyUpsertNpc(fac, npcPatch) {
  if (!Array.isArray(fac.npcs)) fac.npcs = [];
  const idx = fac.npcs.findIndex((n) => n.id === npcPatch.id);
  if (idx >= 0) {
    fac.npcs[idx] = { ...fac.npcs[idx], ...npcPatch };
  } else {
    fac.npcs.push({ ...npcPatch });
  }
}

function applyRemoveNpc(fac, npcId, confirmSetRuler) {
  if (!confirmSetRuler && isRulerNpc(fac, npcId)) {
    return { ok: false, error: "remove_npc: нельзя удалить правителя" };
  }
  if (!Array.isArray(fac.npcs)) fac.npcs = [];
  const before = fac.npcs.length;
  fac.npcs = fac.npcs.filter((n) => n.id !== npcId);
  if (fac.rulerNpcId === npcId && confirmSetRuler) {
    fac.rulerNpcId = null;
  }
  if (fac.npcs.length === before) {
    return { ok: false, error: `NPC не найден: ${npcId}` };
  }
  return { ok: true };
}

function applyUpsertBloc(fac, blocPatch, content) {
  ensureInternalBlocs(fac, content);
  const idx = fac.internalBlocs.findIndex((b) => b.id === blocPatch.id);
  if (idx >= 0) {
    fac.internalBlocs[idx] = { ...fac.internalBlocs[idx], ...blocPatch };
  } else {
    fac.internalBlocs.push({ ...blocPatch });
  }
}

function applyRemoveBloc(fac, blocId, content) {
  ensureInternalBlocs(fac, content);
  const before = fac.internalBlocs.length;
  fac.internalBlocs = fac.internalBlocs.filter((b) => b.id !== blocId);
  if (fac.internalBlocs.length === before) {
    return { ok: false, error: `блок не найден: ${blocId}` };
  }
  for (const npc of fac.npcs ?? []) {
    if (npc.blocId === blocId) npc.blocId = null;
  }
  return { ok: true };
}

function applyPatchCouncil(fac, councilPatch, content) {
  const council = ensureFactionCouncil(fac, content);
  if (Array.isArray(councilPatch.unlockedSeatIds)) {
    council.unlockedSeatIds = [...councilPatch.unlockedSeatIds];
  }
  if (Array.isArray(councilPatch.lockedSeatIds)) {
    council.lockedSeatIds = [...councilPatch.lockedSeatIds];
  }
  if (
    councilPatch.seatPortfolios &&
    typeof councilPatch.seatPortfolios === "object"
  ) {
    council.seatPortfolios = {
      ...council.seatPortfolios,
      ...councilPatch.seatPortfolios,
    };
  }
  if (councilPatch.seatLabels && typeof councilPatch.seatLabels === "object") {
    council.seatLabels = { ...council.seatLabels, ...councilPatch.seatLabels };
  }
  if (Array.isArray(councilPatch.extraSeats)) {
    council.extraSeats = councilPatch.extraSeats.map((s) => ({ ...s }));
  }
}

function applySetRuler(fac, npcId, confirmSetRuler) {
  if (!confirmSetRuler) {
    return { ok: false, error: "set_ruler: confirmSetRuler не установлен" };
  }
  const npc = (fac.npcs ?? []).find((n) => n.id === npcId);
  if (!npc) {
    return { ok: false, error: `NPC для правителя не найден: ${npcId}` };
  }
  fac.rulerNpcId = npcId;
  for (const n of fac.npcs ?? []) {
    if (n.id === npcId) {
      n.isPlayerRuler = true;
      n.councilSeat = "seat.ruler";
    } else if (n.isPlayerRuler) {
      n.isPlayerRuler = false;
      if (n.councilSeat === "seat.ruler") n.councilSeat = null;
    }
  }
  return { ok: true };
}

function applyOp(fac, op, confirmSetRuler, content) {
  switch (op.op) {
    case "upsert_npc":
      applyUpsertNpc(fac, op.npc);
      return { ok: true };
    case "remove_npc":
      return applyRemoveNpc(fac, op.npcId, confirmSetRuler);
    case "upsert_bloc":
      applyUpsertBloc(fac, op.bloc, content);
      return { ok: true };
    case "remove_bloc":
      return applyRemoveBloc(fac, op.blocId, content);
    case "patch_council":
      applyPatchCouncil(fac, op.council, content);
      return { ok: true };
    case "set_ruler":
      return applySetRuler(fac, op.npcId, confirmSetRuler);
    default:
      return { ok: false, error: `неизвестная операция: ${op.op}` };
  }
}

/** List proposals, optionally filtered by status. */
export function listCourtProposals({ status } = {}) {
  const { proposals } = readCourtProposals();
  if (!status) return proposals;
  return proposals.filter((p) => p.status === status);
}

/**
 * Validate and queue a court edit — never mutates the live board.
 * @returns {{ ok: true, proposal } | { ok: false, error: string }}
 */
export function proposeCourtEdit(body) {
  const factionId = String(body?.factionId || "");
  const summary = String(body?.summary || "").trim();
  const author = String(body?.author || "gm");
  const rationale =
    typeof body?.rationale === "string" ? body.rationale : undefined;
  const confirmSetRuler = body?.confirmSetRuler === true;
  const ops = body?.ops;

  if (!factionId) return { ok: false, error: "factionId обязателен" };
  if (!summary) return { ok: false, error: "summary обязателен" };

  const world = readLiveBoard();
  if (!world) return { ok: false, error: "карта не опубликована" };

  const fac = (world.factions ?? []).find((f) => f.id === factionId);
  if (!fac) return { ok: false, error: `фракция не найдена: ${factionId}` };

  const opCheck = validateOps(ops, fac, confirmSetRuler);
  if (!opCheck.ok) return opCheck;

  const proposal = {
    id: newId(),
    status: "pending",
    createdAt: new Date().toISOString(),
    author,
    factionId,
    summary,
    ...(rationale !== undefined ? { rationale } : {}),
    ...(confirmSetRuler ? { confirmSetRuler: true } : {}),
    ops,
  };

  const store = readCourtProposals();
  store.proposals.push(proposal);
  writeCourtProposals(store);
  bumpTableRevision();
  return { ok: true, proposal };
}

/**
 * Apply a pending proposal to the live board.
 * @returns {{ ok: true, proposal, world } | { ok: false, error: string }}
 */
export function acceptCourtProposal(id) {
  const store = readCourtProposals();
  const idx = store.proposals.findIndex((p) => p.id === id);
  if (idx < 0) return { ok: false, error: "предложение не найдено" };

  const proposal = store.proposals[idx];
  if (proposal.status !== "pending") {
    return { ok: false, error: "предложение уже закрыто" };
  }

  const world = readLiveBoard();
  if (!world) return { ok: false, error: "карта не опубликована" };

  const fac = (world.factions ?? []).find((f) => f.id === proposal.factionId);
  if (!fac) {
    return {
      ok: false,
      error: `фракция не найдена: ${proposal.factionId}`,
    };
  }

  const confirmSetRuler = proposal.confirmSetRuler === true;
  const content = getContent();

  for (const op of proposal.ops ?? []) {
    const result = applyOp(fac, op, confirmSetRuler, content);
    if (!result.ok) return result;
  }

  ensurePlayerRulers(world);
  syncNpcPassiveEffects(world);

  writeLiveBoard(world, { backup: false, reason: "court_proposal_accept" });
  bumpTableRevision();

  store.proposals[idx] = {
    ...proposal,
    status: "accepted",
    resolvedAt: new Date().toISOString(),
  };
  writeCourtProposals(store);
  bumpTableRevision();

  return { ok: true, proposal: store.proposals[idx], world };
}

/**
 * Reject a pending proposal without touching the live board.
 * @returns {{ ok: true, proposal } | { ok: false, error: string }}
 */
export function rejectCourtProposal(id) {
  const store = readCourtProposals();
  const idx = store.proposals.findIndex((p) => p.id === id);
  if (idx < 0) return { ok: false, error: "предложение не найдено" };

  const proposal = store.proposals[idx];
  if (proposal.status !== "pending") {
    return { ok: false, error: "предложение уже закрыто" };
  }

  store.proposals[idx] = {
    ...proposal,
    status: "rejected",
    resolvedAt: new Date().toISOString(),
  };
  writeCourtProposals(store);
  bumpTableRevision();
  return { ok: true, proposal: store.proposals[idx] };
}
