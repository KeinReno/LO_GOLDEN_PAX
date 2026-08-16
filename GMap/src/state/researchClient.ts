import { playerAuthHeaders, rememberPlayerTokenFromPayload } from "./playerAuth";
import type { ViewerPayload } from "./types";

type JsonErr = { error?: string };

export type ResearchSession = {
  economy?: ViewerPayload["economy"];
  tech?: { id?: string; name?: string };
  offer?: unknown;
  offerBypass?: boolean;
};

async function postJson<T>(
  url: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: playerAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as T & JsonErr;
    rememberPlayerTokenFromPayload(data as { playerToken?: string | null });
    if (!res.ok) {
      return { ok: false, error: data.error || res.statusText };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Start research. Password in body is optional when x-player-token is held. */
export function postResearch(body: {
  factionId: string;
  password?: string;
  techId: string;
}) {
  return postJson<ResearchSession>("/api/economy/research", body);
}

/** Reroll a direction offer. Password in body is optional when x-player-token is held. */
export function postResearchOfferReroll(body: {
  factionId: string;
  password?: string;
  direction?: string;
  category?: string;
}) {
  const direction = body.direction || body.category;
  return postJson<ResearchSession>("/api/economy/tech-offers/direction-reroll", {
    factionId: body.factionId,
    password: body.password,
    direction,
  });
}

export function postUpgradeTechGrade(body: {
  factionId: string;
  password?: string;
  techId: string;
}) {
  return postJson<ResearchSession & { grade?: number; techId?: string }>(
    "/api/economy/tech/upgrade-grade",
    body,
  );
}

export function postFillTechSocket(body: {
  factionId: string;
  password?: string;
  techId: string;
  resourceId: string;
}) {
  return postJson<ResearchSession & { resourceId?: string; techId?: string }>(
    "/api/economy/tech/fill-socket",
    body,
  );
}
