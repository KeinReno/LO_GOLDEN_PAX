/**
 * NPC roster — existence, ruler lock, remove/set-ruler rules.
 *
 * `ensurePlayerRulers` is a verbatim port of GMap/server/courtGovernance.mjs
 * (player character owns seat.ruler; resolves rulerNpcId from
 * isPlayerRuler / seated-at-seat.ruler; locks that NPC on the throne;
 * clears the flag on any other NPC). Reshaped from mutate-world-in-place
 * to plain faction in / plain faction out.
 *
 * `removeNpc` / `setRuler` are verbatim ports of GMap/server/courtProposals.mjs
 * `applyRemoveNpc` / `applySetRuler` (cannot remove the current ruler
 * without confirmSetRuler; setRuler requires the same confirm flag).
 *
 * NPC create/edit shape is new (GMap never had a real npcs table — GM
 * upserted through the deferred courtProposals inbox). `raceId` is new,
 * not in GMap's npc shape (GMap only had raceLeadership.raceId on
 * race-caucus leaders).
 */

export const NPC_STATUSES = ["active", "away", "busy", "dead", "hidden"];

export function npcAvailable(npc) {
  return npc && npc.status !== "dead" && npc.status !== "hidden";
}

export function isRulerNpc(faction, npcId) {
  if (!npcId) return false;
  if (faction.rulerNpcId === npcId) return true;
  const npc = (faction.npcs ?? []).find((n) => n.id === npcId);
  return !!npc?.isPlayerRuler;
}

export function defaultNpc(fields = {}) {
  return {
    id: fields.id,
    factionId: fields.factionId,
    name: fields.name,
    status: NPC_STATUSES.includes(fields.status) ? fields.status : "active",
    raceId: fields.raceId,
    traitIds: Array.isArray(fields.traitIds) ? [...fields.traitIds] : [],
    posting: fields.posting && typeof fields.posting === "object"
      ? { ...fields.posting }
      : { kind: "court", sinceTurn: fields.posting?.sinceTurn ?? 0 },
    councilSeat: fields.councilSeat ?? null,
    blocId: fields.blocId ?? null,
    isBlocLeader: !!fields.isBlocLeader,
    isPlayerRuler: !!fields.isPlayerRuler,
    raceLeadership: fields.raceLeadership?.raceId
      ? { raceId: fields.raceLeadership.raceId }
      : undefined,
    currentTask: fields.currentTask ?? null,
  };
}

/**
 * @param {{ rulerNpcId?: string|null, npcs?: object[] }} faction
 * @returns {{ rulerNpcId: string|null, npcs: object[] }}
 */
export function ensurePlayerRulers(faction) {
  const npcs = Array.isArray(faction?.npcs) ? faction.npcs.map((n) => ({ ...n, posting: n.posting ? { ...n.posting } : n.posting })) : [];
  let rulerId =
    typeof faction?.rulerNpcId === "string" && faction.rulerNpcId
      ? faction.rulerNpcId
      : null;
  if (rulerId) {
    const ok = npcs.find((n) => n.id === rulerId && npcAvailable(n));
    if (!ok) rulerId = null;
  }
  if (!rulerId) {
    const marked = npcs.find((n) => n.isPlayerRuler && npcAvailable(n));
    if (marked) rulerId = marked.id;
  }
  if (!rulerId) {
    const seated = npcs.find((n) => n.councilSeat === "seat.ruler" && npcAvailable(n));
    if (seated) rulerId = seated.id;
  }
  if (!rulerId) {
    return { rulerNpcId: null, npcs };
  }
  for (const n of npcs) {
    if (n.id === rulerId) {
      n.isPlayerRuler = true;
      n.councilSeat = "seat.ruler";
      if (!n.posting || n.posting.kind !== "court") {
        n.posting = {
          kind: "court",
          sinceTurn: typeof n.posting?.sinceTurn === "number" ? n.posting.sinceTurn : 0,
        };
      }
      if (n.status === "away") n.status = "active";
    } else {
      if (n.isPlayerRuler) n.isPlayerRuler = false;
      if (n.councilSeat === "seat.ruler") n.councilSeat = null;
    }
  }
  return { rulerNpcId: rulerId, npcs };
}

export function removeNpc(faction, npcId, { confirmSetRuler } = {}) {
  if (!confirmSetRuler && isRulerNpc(faction, npcId)) {
    return { ok: false, error: "ruler_locked" };
  }
  const npcs = Array.isArray(faction?.npcs) ? [...faction.npcs] : [];
  const next = npcs.filter((n) => n.id !== npcId);
  if (next.length === npcs.length) return { ok: false, error: "npc_missing" };
  let rulerNpcId = faction.rulerNpcId ?? null;
  if (rulerNpcId === npcId && confirmSetRuler) rulerNpcId = null;
  return { ok: true, ...ensurePlayerRulers({ ...faction, npcs: next, rulerNpcId }) };
}

export function setRuler(faction, npcId, { confirmSetRuler } = {}) {
  if (!confirmSetRuler) return { ok: false, error: "confirm_required" };
  const npc = (faction.npcs ?? []).find((n) => n.id === npcId);
  if (!npc) return { ok: false, error: "npc_missing" };
  if (!npcAvailable(npc)) return { ok: false, error: "npc_unavailable" };
  return { ok: true, ...ensurePlayerRulers({ ...faction, rulerNpcId: npcId, npcs: faction.npcs }) };
}

export function upsertNpc(faction, patch) {
  if (!patch?.name) return { ok: false, error: "npc_params" };
  const id = patch.id || `npc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  if (patch.raceId == null && !(faction.npcs ?? []).some((n) => n.id === id)) {
    return { ok: false, error: "npc_race_required" };
  }
  const npcs = Array.isArray(faction?.npcs) ? [...faction.npcs] : [];
  const idx = npcs.findIndex((n) => n.id === id);
  if (idx >= 0) npcs[idx] = defaultNpc({ ...npcs[idx], ...patch, id });
  else npcs.push(defaultNpc({ ...patch, id }));
  return { ok: true, ...ensurePlayerRulers({ ...faction, npcs }) };
}
