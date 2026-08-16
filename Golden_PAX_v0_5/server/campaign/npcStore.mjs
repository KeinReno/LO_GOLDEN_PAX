import { randomUUID } from "node:crypto";
import { defaultNpc, ensurePlayerRulers } from "../domain/court/npcRoster.mjs";
import { ensureFactionCouncil } from "../domain/court/councilSeats.mjs";
import { ensureInternalBlocs, recomputeInternalBlocs } from "../domain/court/internalBlocs.mjs";

/**
 * Persistence for the court/NPC domain. The only DB boundary for this
 * domain (CLAUDE.md rule 5) — domain/court/* never imports server/db.
 */

const NPC_SELECT = `id, faction_id as factionId, name, status, race_id as raceId,
  trait_ids_json as traitIdsJson, posting_kind as postingKind, posting_target_id as postingTargetId,
  posting_since_turn as postingSinceTurn, council_seat as councilSeat, bloc_id as blocId,
  is_bloc_leader as isBlocLeader, is_player_ruler as isPlayerRuler,
  race_leadership_race_id as raceLeadershipRaceId, current_task_json as currentTaskJson`;

function postingFromRow(row) {
  const kind = row.postingKind || "court";
  const posting = { kind, sinceTurn: row.postingSinceTurn ?? 0 };
  if (kind === "governor" && row.postingTargetId) posting.systemId = row.postingTargetId;
  if ((kind === "commander" || kind === "admiral") && row.postingTargetId) posting.forceId = row.postingTargetId;
  return posting;
}

function postingToCols(posting) {
  const kind = posting?.kind || "court";
  let targetId = null;
  if (kind === "governor") targetId = posting.systemId ?? posting.targetId ?? null;
  if (kind === "commander" || kind === "admiral") targetId = posting.forceId ?? posting.targetId ?? null;
  return { kind, targetId, sinceTurn: posting?.sinceTurn ?? 0 };
}

function rowToNpc(row) {
  return {
    id: row.id,
    factionId: row.factionId,
    name: row.name,
    status: row.status,
    raceId: row.raceId,
    traitIds: JSON.parse(row.traitIdsJson || "[]"),
    posting: postingFromRow(row),
    councilSeat: row.councilSeat ?? null,
    blocId: row.blocId ?? null,
    isBlocLeader: !!row.isBlocLeader,
    isPlayerRuler: !!row.isPlayerRuler,
    raceLeadership: row.raceLeadershipRaceId ? { raceId: row.raceLeadershipRaceId } : undefined,
    currentTask: row.currentTaskJson ? JSON.parse(row.currentTaskJson) : null,
  };
}

export function listFactionNpcs(db, campaignId, factionId) {
  return db
    .prepare(`SELECT ${NPC_SELECT} FROM npcs WHERE campaign_id = ? AND faction_id = ?`)
    .all(campaignId, factionId)
    .map(rowToNpc);
}

export function loadNpc(db, campaignId, npcId) {
  const row = db.prepare(`SELECT ${NPC_SELECT} FROM npcs WHERE campaign_id = ? AND id = ?`).get(campaignId, npcId);
  return row ? rowToNpc(row) : null;
}

export function upsertNpcRow(db, campaignId, factionId, npc) {
  const id = npc.id || randomUUID();
  const shaped = defaultNpc({ ...npc, id, factionId });
  const cols = postingToCols(shaped.posting);
  db.prepare(
    `INSERT INTO npcs (
       id, campaign_id, faction_id, name, status, race_id, trait_ids_json,
       posting_kind, posting_target_id, posting_since_turn, council_seat, bloc_id,
       is_bloc_leader, is_player_ruler, race_leadership_race_id, current_task_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       name = excluded.name, status = excluded.status, race_id = excluded.race_id,
       trait_ids_json = excluded.trait_ids_json, posting_kind = excluded.posting_kind,
       posting_target_id = excluded.posting_target_id, posting_since_turn = excluded.posting_since_turn,
       council_seat = excluded.council_seat, bloc_id = excluded.bloc_id,
       is_bloc_leader = excluded.is_bloc_leader, is_player_ruler = excluded.is_player_ruler,
       race_leadership_race_id = excluded.race_leadership_race_id, current_task_json = excluded.current_task_json,
       faction_id = excluded.faction_id`,
  ).run(
    id,
    campaignId,
    factionId,
    shaped.name,
    shaped.status,
    shaped.raceId,
    JSON.stringify(shaped.traitIds ?? []),
    cols.kind,
    cols.targetId,
    cols.sinceTurn,
    shaped.councilSeat ?? null,
    shaped.blocId ?? null,
    shaped.isBlocLeader ? 1 : 0,
    shaped.isPlayerRuler ? 1 : 0,
    shaped.raceLeadership?.raceId ?? null,
    shaped.currentTask ? JSON.stringify(shaped.currentTask) : null,
  );
  return loadNpc(db, campaignId, id);
}

export function deleteNpcRow(db, campaignId, npcId) {
  const info = db.prepare("DELETE FROM npcs WHERE campaign_id = ? AND id = ?").run(campaignId, npcId);
  return info.changes > 0;
}

export function replaceFactionNpcs(db, campaignId, factionId, npcs) {
  const keep = new Set((npcs ?? []).map((n) => n.id));
  for (const existing of listFactionNpcs(db, campaignId, factionId)) {
    if (!keep.has(existing.id)) deleteNpcRow(db, campaignId, existing.id);
  }
  for (const npc of npcs ?? []) upsertNpcRow(db, campaignId, factionId, npc);
  return listFactionNpcs(db, campaignId, factionId);
}

function rowToCourt(row) {
  if (!row) return null;
  return {
    rulerNpcId: row.rulerNpcId ?? null,
    council: {
      unlockedSeatIds: JSON.parse(row.unlockedSeatIdsJson || "[]"),
      lockedSeatIds: JSON.parse(row.lockedSeatIdsJson || "[]"),
      seatPortfolios: JSON.parse(row.seatPortfoliosJson || "{}"),
    },
    activeEffects: JSON.parse(row.activeEffectsJson || "[]"),
  };
}

export function loadCourtAccount(db, campaignId, factionId) {
  const row = db
    .prepare(
      `SELECT ruler_npc_id as rulerNpcId, unlocked_seat_ids_json as unlockedSeatIdsJson,
              locked_seat_ids_json as lockedSeatIdsJson, seat_portfolios_json as seatPortfoliosJson,
              active_effects_json as activeEffectsJson
       FROM faction_court WHERE campaign_id = ? AND faction_id = ?`,
    )
    .get(campaignId, factionId);
  return rowToCourt(row);
}

export function saveCourtAccount(db, campaignId, factionId, account) {
  const council = account.council || { unlockedSeatIds: [], lockedSeatIds: [], seatPortfolios: {} };
  db.prepare(
    `INSERT INTO faction_court (
       campaign_id, faction_id, ruler_npc_id, unlocked_seat_ids_json, locked_seat_ids_json,
       seat_portfolios_json, active_effects_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (campaign_id, faction_id) DO UPDATE SET
       ruler_npc_id = excluded.ruler_npc_id,
       unlocked_seat_ids_json = excluded.unlocked_seat_ids_json,
       locked_seat_ids_json = excluded.locked_seat_ids_json,
       seat_portfolios_json = excluded.seat_portfolios_json,
       active_effects_json = excluded.active_effects_json`,
  ).run(
    campaignId,
    factionId,
    account.rulerNpcId ?? null,
    JSON.stringify(council.unlockedSeatIds ?? []),
    JSON.stringify(council.lockedSeatIds ?? []),
    JSON.stringify(council.seatPortfolios ?? {}),
    JSON.stringify(account.activeEffects ?? []),
  );
}

export function loadInternalBlocs(db, campaignId, factionId) {
  return db
    .prepare(
      `SELECT bloc_id as id, name, kind, stance, agenda, description, color,
              race_ids_json as raceIdsJson, leader_npc_id as leaderNpcId,
              influence, support, threat
       FROM faction_internal_blocs WHERE campaign_id = ? AND faction_id = ?`,
    )
    .all(campaignId, factionId)
    .map((row) => ({
      ...row,
      raceIds: JSON.parse(row.raceIdsJson || "[]"),
      raceIdsJson: undefined,
    }));
}

export function saveInternalBlocs(db, campaignId, factionId, blocs) {
  db.prepare("DELETE FROM faction_internal_blocs WHERE campaign_id = ? AND faction_id = ?").run(campaignId, factionId);
  const ins = db.prepare(
    `INSERT INTO faction_internal_blocs (
       campaign_id, faction_id, bloc_id, name, kind, stance, agenda, description, color,
       race_ids_json, leader_npc_id, influence, support, threat
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const b of blocs ?? []) {
    ins.run(
      campaignId,
      factionId,
      b.id,
      b.name ?? null,
      b.kind ?? null,
      b.stance || "neutral",
      b.agenda ?? null,
      b.description ?? null,
      b.color ?? null,
      JSON.stringify(b.raceIds ?? []),
      b.leaderNpcId ?? null,
      b.influence ?? 0,
      b.support ?? 0,
      b.threat ?? 0,
    );
  }
}

export function seedCourtAccount(db, campaignId, factionId, content) {
  const council = ensureFactionCouncil({}, content);
  const blocs = ensureInternalBlocs({}, content);
  saveCourtAccount(db, campaignId, factionId, { rulerNpcId: null, council, activeEffects: [] });
  saveInternalBlocs(db, campaignId, factionId, blocs);
}

/** Full court snapshot for one faction (npcs + council + blocs). */
export function loadFactionCourt(db, campaignId, factionId, content) {
  const npcs = listFactionNpcs(db, campaignId, factionId);
  let account = loadCourtAccount(db, campaignId, factionId);
  if (!account) {
    seedCourtAccount(db, campaignId, factionId, content);
    account = loadCourtAccount(db, campaignId, factionId);
  }
  let blocs = loadInternalBlocs(db, campaignId, factionId);
  if (!blocs.length) {
    blocs = ensureInternalBlocs({}, content);
    saveInternalBlocs(db, campaignId, factionId, blocs);
  }
  const synced = ensurePlayerRulers({ rulerNpcId: account.rulerNpcId, npcs });
  if (synced.rulerNpcId !== account.rulerNpcId || synced.npcs.some((n, i) => n.isPlayerRuler !== npcs[i]?.isPlayerRuler)) {
    replaceFactionNpcs(db, campaignId, factionId, synced.npcs);
    saveCourtAccount(db, campaignId, factionId, { ...account, rulerNpcId: synced.rulerNpcId });
  }
  const scored = recomputeInternalBlocs({ internalBlocs: blocs }, synced.npcs, content);
  return {
    rulerNpcId: synced.rulerNpcId,
    council: ensureFactionCouncil(account, content),
    activeEffects: account.activeEffects ?? [],
    npcs: synced.npcs,
    internalBlocs: scored,
  };
}

export function saveFactionCourt(db, campaignId, factionId, court) {
  replaceFactionNpcs(db, campaignId, factionId, court.npcs ?? []);
  saveCourtAccount(db, campaignId, factionId, {
    rulerNpcId: court.rulerNpcId ?? null,
    council: court.council,
    activeEffects: court.activeEffects ?? [],
  });
  if (court.internalBlocs) saveInternalBlocs(db, campaignId, factionId, court.internalBlocs);
}
