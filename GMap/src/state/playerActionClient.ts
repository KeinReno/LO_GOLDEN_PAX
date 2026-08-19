import {
  playerAuthHeaders,
  playerJsonBody,
  rememberPlayerTokenFromPayload,
} from "./playerAuth";

export type PlayerActionJson = {
  error?: string;
  playerToken?: string | null;
  apMax?: number;
  reservedAp?: number;
  forceApMax?: number;
  reservedForceAp?: number;
  intent?: { apCost?: number; forceApCost?: number };
  economy?: unknown;
  order?: unknown;
  world?: unknown;
  session?: { world?: unknown; updatedAt?: string; tableRevision?: number };
  contactMode?: string;
  instantCombat?: boolean;
  engagements?: unknown;
  engagement?: unknown;
  mutual?: boolean;
  updatedAt?: string;
  tableRevision?: number;
  message?: string;
  outcome?: string;
  upgrade?: { name?: string };
  queue?: unknown;
  tech?: { name?: string };
  lineageId?: string;
  visibleSystemIds?: string[];
  knownFactionIds?: string[];
  tradePartnerIds?: string[];
  diploOffers?: unknown;
  intel?: unknown;
  briefing?: unknown;
  factionId?: string;
};

export type PlayerActionResponse = {
  ok: boolean;
  status: number;
  data: PlayerActionJson;
};

export async function postPlayerJson(
  url: string,
  body: Record<string, unknown>,
): Promise<PlayerActionResponse> {
  const res = await fetch(url, {
    method: "POST",
    headers: playerAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(playerJsonBody(body)),
  });
  const data = ((await res.json().catch(() => ({}))) ?? {}) as PlayerActionJson;
  rememberPlayerTokenFromPayload(data);
  return { ok: res.ok, status: res.status, data };
}

export function postPlayerIntent(body: Record<string, unknown>) {
  return postPlayerJson("/api/intents", body);
}

export function postPlayerOrder(body: Record<string, unknown>) {
  return postPlayerJson("/api/orders", body);
}

export async function getPlayerJson(
  url: string,
  extraHeaders: Record<string, string> = {},
): Promise<PlayerActionResponse> {
  const res = await fetch(url, {
    headers: playerAuthHeaders(extraHeaders),
  });
  const data = ((await res.json().catch(() => ({}))) ?? {}) as PlayerActionJson;
  rememberPlayerTokenFromPayload(data);
  return { ok: res.ok, status: res.status, data };
}

export function postEngagementStance(
  engagementId: string,
  body: Record<string, unknown>,
) {
  return postPlayerJson(
    `/api/engagements/${encodeURIComponent(engagementId)}/stance`,
    body,
  );
}

export function postEngagementCardRequest(
  engagementId: string,
  body: Record<string, unknown>,
) {
  return postPlayerJson(
    `/api/engagements/${encodeURIComponent(engagementId)}/request_card`,
    body,
  );
}

export function postQuestAction(body: Record<string, unknown>) {
  return postPlayerJson("/api/quest/action", body);
}

export function fetchEngagements(factionId: string, password?: string) {
  const extra: Record<string, string> = {
    "X-Faction-Id": factionId,
  };
  if (password) extra["X-Faction-Password"] = password;
  return getPlayerJson("/api/engagements", extra);
}
