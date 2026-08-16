import type { ViewerPayload } from "./types";
import { playerAuthHeaders, rememberPlayerTokenFromPayload } from "./playerAuth";

/**
 * Court roster unique API — POST /api/court/npcs* (v0.5 onto GMap).
 * Player posting/recall; GM upsert/remove/ruler. Existing CourtPanel only.
 */

export type CourtRosterSession = {
  world?: ViewerPayload["world"];
  economy?: ViewerPayload["economy"];
  intel?: ViewerPayload["intel"];
  visibleSystemIds?: string[];
  npc?: unknown;
  posting?: { kind?: string; systemId?: string; legionId?: string; fleetId?: string; forceId?: string };
  fromKind?: string;
  error?: string;
};

const ROSTER_ERROR_RU: Record<string, string> = {
  npc_params: "Нужны имя и поля NPC",
  npc_race_required: "Укажите расу NPC",
  npc_missing: "NPC не найден",
  npc_unavailable: "NPC недоступен",
  npc_busy: "NPC занят поручением",
  npc_is_player_ruler: "Правителя нельзя отправить в поле",
  npc_posting_params: "Нужны вид назначения и цель",
  npc_posting_foreign: "Цель назначения не вашей державы",
  npc_already_at_court: "NPC уже при дворе",
  ruler_locked: "Нельзя снять правителя без подтверждения",
  confirm_required: "Нужно подтверждение смены правителя",
  faction_missing: "Нет государства",
  council_seat_params: "Нужно место совета",
  council_seat_locked: "Место совета закрыто",
  council_seat_ruler_locked: "Трон нельзя занять или освободить так",
  npc_not_seated: "NPC не за столом",
  council_portfolio_params: "Нужны место и портфолио",
  council_seat_unknown: "Неизвестное место совета",
  council_portfolio_ruler: "Трону нельзя назначить портфолио",
  council_portfolio_unknown: "Неизвестное портфолио",
};

export function formatCourtRosterError(error: string | undefined): string {
  const raw = (error || "").trim();
  if (!raw) return "Двор: действие не удалось";
  return ROSTER_ERROR_RU[raw] || raw;
}

export function courtMasterHeaders(
  masterToken: string,
  extra?: Record<string, string>,
): Record<string, string> {
  return { "X-Master-Token": masterToken, ...extra };
}

export async function courtMasterFetch(
  path: string,
  masterToken: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("X-Master-Token", masterToken);
  return fetch(path, { ...init, headers });
}

async function readCourtJson(res: Response): Promise<CourtRosterSession> {
  const data = (await res.json()) as CourtRosterSession;
  rememberPlayerTokenFromPayload(data as { playerToken?: string | null });
  return data;
}

export async function postCourtNpcPosting(body: {
  factionId: string;
  password?: string;
  npcId: string;
  kind: "governor" | "commander" | "admiral";
  targetId?: string;
  forceId?: string;
  systemId?: string;
  legionId?: string;
  fleetId?: string;
}): Promise<{ ok: true; data: CourtRosterSession } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/court/npcs/posting", {
      method: "POST",
      headers: playerAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    const data = await readCourtJson(res);
    if (!res.ok) {
      return { ok: false, error: formatCourtRosterError(data.error || res.statusText) };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Двор: сеть" };
  }
}

export async function postCourtNpcRecall(body: {
  factionId: string;
  password?: string;
  npcId: string;
}): Promise<{ ok: true; data: CourtRosterSession } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/court/npcs/posting/recall", {
      method: "POST",
      headers: playerAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    const data = await readCourtJson(res);
    if (!res.ok) {
      return { ok: false, error: formatCourtRosterError(data.error || res.statusText) };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Двор: сеть" };
  }
}

export async function postCourtNpcUpsert(body: {
  factionId: string;
  masterToken: string;
  npc: Record<string, unknown>;
}): Promise<{ ok: true; data: CourtRosterSession } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/court/npcs", {
      method: "POST",
      headers: courtMasterHeaders(body.masterToken, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ factionId: body.factionId, npc: body.npc }),
    });
    const data = await readCourtJson(res);
    if (!res.ok) {
      return { ok: false, error: formatCourtRosterError(data.error || res.statusText) };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Двор: сеть" };
  }
}

export async function postCourtNpcRemove(body: {
  factionId: string;
  masterToken: string;
  npcId: string;
  confirmSetRuler?: boolean;
}): Promise<{ ok: true; data: CourtRosterSession } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/court/npcs/remove", {
      method: "POST",
      headers: courtMasterHeaders(body.masterToken, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        factionId: body.factionId,
        npcId: body.npcId,
        confirmSetRuler: body.confirmSetRuler === true,
      }),
    });
    const data = await readCourtJson(res);
    if (!res.ok) {
      return { ok: false, error: formatCourtRosterError(data.error || res.statusText) };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Двор: сеть" };
  }
}

export async function postCourtNpcSetRuler(body: {
  factionId: string;
  masterToken: string;
  npcId: string;
  confirmSetRuler?: boolean;
}): Promise<{ ok: true; data: CourtRosterSession } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/court/npcs/ruler", {
      method: "POST",
      headers: courtMasterHeaders(body.masterToken, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        factionId: body.factionId,
        npcId: body.npcId,
        confirmSetRuler: body.confirmSetRuler !== false,
      }),
    });
    const data = await readCourtJson(res);
    if (!res.ok) {
      return { ok: false, error: formatCourtRosterError(data.error || res.statusText) };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Двор: сеть" };
  }
}

async function postCourtMaster(
  path: string,
  body: Record<string, unknown>,
  masterToken: string,
): Promise<{ ok: true; data: CourtRosterSession } | { ok: false; error: string }> {
  try {
    const res = await courtMasterFetch(path, masterToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await readCourtJson(res);
    if (!res.ok) {
      return { ok: false, error: formatCourtRosterError(data.error || res.statusText) };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Двор: сеть" };
  }
}

export async function postCourtSeatLock(body: {
  factionId: string;
  masterToken: string;
  seatId: string;
}): Promise<{ ok: true; data: CourtRosterSession } | { ok: false; error: string }> {
  return postCourtMaster(
    "/api/court/seats/lock",
    { factionId: body.factionId, seatId: body.seatId },
    body.masterToken,
  );
}

export async function postCourtSeatUnlock(body: {
  factionId: string;
  masterToken: string;
  seatId: string;
}): Promise<{ ok: true; data: CourtRosterSession } | { ok: false; error: string }> {
  return postCourtMaster(
    "/api/court/seats/unlock",
    { factionId: body.factionId, seatId: body.seatId },
    body.masterToken,
  );
}

export async function postCourtNpcSeat(body: {
  factionId: string;
  password?: string;
  npcId: string;
  seatId: string;
}): Promise<{ ok: true; data: CourtRosterSession } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/court/npcs/seat", {
      method: "POST",
      headers: playerAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    const data = await readCourtJson(res);
    if (!res.ok) {
      return { ok: false, error: formatCourtRosterError(data.error || res.statusText) };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Двор: сеть" };
  }
}

export async function postCourtNpcUnseat(body: {
  factionId: string;
  password?: string;
  npcId: string;
}): Promise<{ ok: true; data: CourtRosterSession } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/court/npcs/unseat", {
      method: "POST",
      headers: playerAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    const data = await readCourtJson(res);
    if (!res.ok) {
      return { ok: false, error: formatCourtRosterError(data.error || res.statusText) };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Двор: сеть" };
  }
}
