/**
 * Governor / commander / admiral postings.
 *
 * Validation + `clearSameTarget` are verbatim ports of GMap/server/narrative.mjs
 * `applyAssignNpcPosting` / `applyRecallNpcPosting` (not the ruler, not busy,
 * not dead/hidden, posted-away leaves the seat, recall returns to court).
 *
 * Target adaptation (documented, not a silent fork): GMap used
 * `legionId`/`fleetId` separately; Golden_PAX's `forces` table already has
 * `kind: 'fleet'|'legion'`, so both commander and admiral take `forceId`.
 * Governor still targets `systemId`.
 *
 * `postingEffects` / `postingTarget` port GMap/server/courtGovernance.mjs's
 * content-driven posting resolution (`npc_postings.json` systemEffects /
 * legionEffects / fleetEffects + weaker factionEffects echo).
 *
 * loyalty_add (including `ungovernedLoyaltyPenalty`) is produced by
 * courtActiveEffects.mjs and is NOT consumed anywhere yet — schema.sql has
 * zero loyalty columns. Same honest-scope cut as tech's currency.metal gap.
 */
import { npcAvailable } from "./npcRoster.mjs";

const POSTING_KINDS = ["governor", "commander", "admiral"];

export function postingTarget(npc) {
  const p = npc?.posting;
  if (!p || p.kind === "court") return null;
  if (p.kind === "governor" && (p.systemId || p.targetId)) {
    return { scope: "system", targetId: p.systemId || p.targetId };
  }
  if (p.kind === "commander" && (p.forceId || p.targetId)) {
    return { scope: "legion", targetId: p.forceId || p.targetId };
  }
  if (p.kind === "admiral" && (p.forceId || p.targetId)) {
    return { scope: "fleet", targetId: p.forceId || p.targetId };
  }
  return null;
}

export function postingEffects(npc, content) {
  const posting = npc?.posting;
  if (!posting || posting.kind === "court") return [];
  const postDef = content?.npc_postings?.postings?.[posting.kind];
  if (!postDef) return [];
  const target = postingTarget(npc);
  const source = {
    kind: "npc_posting",
    id: `${npc.id}:${posting.kind}`,
    label: `${npc.name}: ${postDef.name || posting.kind}`,
  };
  const out = [];
  const localKey =
    posting.kind === "governor"
      ? "systemEffects"
      : posting.kind === "commander"
        ? "legionEffects"
        : posting.kind === "admiral"
          ? "fleetEffects"
          : null;
  const localList = localKey ? postDef[localKey] : null;
  if (Array.isArray(localList) && localList.length && target) {
    for (const e of cloneEffects(localList)) {
      out.push({ ...e, source, scope: target.scope, targetId: target.targetId });
    }
  }
  const factionList = Array.isArray(postDef.factionEffects)
    ? postDef.factionEffects
    : Array.isArray(postDef.effects)
      ? postDef.effects
      : [];
  for (const e of cloneEffects(factionList)) {
    out.push({ ...e, source, scope: "faction" });
  }
  if ((!localList || !localList.length) && Array.isArray(postDef.effects) && postDef.effects.length && target) {
    for (const e of cloneEffects(postDef.effects)) {
      out.push({ ...e, source, scope: target.scope, targetId: target.targetId });
    }
  }
  return out;
}

function cloneEffects(list) {
  if (!Array.isArray(list)) return [];
  return list.map((e) => ({
    effect: e.effect,
    args: e.args ? { ...e.args } : undefined,
  }));
}

function courtPosting(turn) {
  return { kind: "court", sinceTurn: turn };
}

/**
 * @param {{ npc: object, npcs: object[], kind: string, targetId: string, faction: { id: string, rulerNpcId?: string }, turn: number, target: { ownerFactionId?: string, factionId?: string, kind?: string } }} args
 */
export function assignPosting({ npc, npcs, kind, targetId, faction, turn, target }) {
  if (!npc || !POSTING_KINDS.includes(kind) || !targetId) {
    return { ok: false, error: "npc_posting_params" };
  }
  if (npc.status === "dead" || npc.status === "hidden") return { ok: false, error: "npc_unavailable" };
  if (npc.isPlayerRuler || faction.rulerNpcId === npc.id) return { ok: false, error: "npc_is_player_ruler" };
  if (npc.currentTask) return { ok: false, error: "npc_busy" };

  if (kind === "governor") {
    if (!target || target.ownerFactionId !== faction.id) return { ok: false, error: "npc_posting_foreign" };
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
      : { kind, forceId: targetId, sinceTurn: turn };

  const next = (npcs ?? []).map((other) => {
    if (other.id === npc.id) {
      return { ...other, posting, status: "away", councilSeat: null };
    }
    const p = other.posting;
    if (!p) return other;
    const same =
      (kind === "governor" && p.kind === "governor" && p.systemId === targetId) ||
      (kind === "commander" && p.kind === "commander" && p.forceId === targetId) ||
      (kind === "admiral" && p.kind === "admiral" && p.forceId === targetId);
    if (!same) return other;
    return {
      ...other,
      posting: courtPosting(turn),
      status: other.status === "away" ? "active" : other.status,
    };
  });
  return { ok: true, npcs: next };
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

export function systemHasGovernor(npcs, systemId) {
  return (npcs ?? []).some(
    (n) => npcAvailable(n) && n.posting?.kind === "governor" && n.posting?.systemId === systemId,
  );
}

export { npcAvailable };
