import type { Fleet, Legion, ViewerPayload, WorldState } from "./types";
import {
  playerAuthHeaders,
  playerJsonBody,
  rememberPlayerTokenFromPayload,
} from "./playerAuth";

/**
 * Player boarding client — POST /api/forces/board.
 * Auth matches /api/forces/raise: x-player-token and/or factionId + password.
 */

export type BoardForceSession = {
  world?: ViewerPayload["world"];
  economy?: ViewerPayload["economy"];
  intel?: ViewerPayload["intel"];
  visibleSystemIds?: string[];
  captured?: boolean;
  outcome?: string;
  error?: string;
};

const BOARD_ERROR_RU: Record<string, string> = {
  boarder_must_be_legion: "Абордаж: действовать может только легион",
  target_must_be_fleet: "Абордаж: цель должна быть флотом",
  not_same_system: "Абордаж: легион и флот в разных системах",
  not_owner: "Абордаж: это не ваш легион",
  legion_not_found: "Абордаж: легион не найден",
  fleet_not_found: "Абордаж: флот не найден",
  same_force: "Абордаж: нельзя выбрать ту же силу",
  not_found: "Абордаж: сила не найдена",
  no_world: "Карта ещё не опубликована",
  no_faction: "Нет государства",
  missing_militia_def: "Абордаж: нет определения экипажа",
};

export function formatBoardError(error: string | undefined): string {
  const raw = (error || "").trim();
  if (!raw) return "Абордаж не удался";
  return BOARD_ERROR_RU[raw] || raw;
}

/** Other-faction fleets in the same system as an owned legion. */
export function boardableFleets(
  world: WorldState,
  factionId: string,
  systemId: string,
): Fleet[] {
  return (world.fleets ?? []).filter(
    (f) => f.systemId === systemId && f.factionId !== factionId,
  );
}

export function ownedLegionsInSystem(
  world: WorldState,
  factionId: string,
  systemId: string,
): Legion[] {
  return (world.legions ?? []).filter(
    (l) => l.systemId === systemId && l.factionId === factionId,
  );
}

export async function postForceBoard(body: {
  factionId: string;
  password?: string;
  legionId: string;
  targetFleetId: string;
}): Promise<{ ok: true; data: BoardForceSession } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/forces/board", {
      method: "POST",
      headers: playerAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(playerJsonBody(body as Record<string, unknown>)),
    });
    const data = (await res.json()) as BoardForceSession;
    rememberPlayerTokenFromPayload(data as { playerToken?: string | null });
    if (!res.ok) {
      return { ok: false, error: formatBoardError(data.error || res.statusText) };
    }
    return { ok: true, data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
