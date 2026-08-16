/**
 * Campaign API client. Auth per server/api/auth.mjs:
 * GM → x-master-token only
 * Player → x-player-token only (no x-faction-id spoof)
 */

export interface AuthContext {
  masterToken?: string;
  playerToken?: string;
}

export interface ApiError {
  status: number;
  error?: string;
  body?: unknown;
}

function authHeaders(auth: AuthContext): Record<string, string> {
  const h: Record<string, string> = {};
  if (auth.masterToken) h["x-master-token"] = auth.masterToken;
  if (auth.playerToken) h["x-player-token"] = auth.playerToken;
  return h;
}

export async function apiRequest<T>(
  path: string,
  auth: AuthContext,
  options: { method?: string; body?: unknown } = {},
): Promise<{ ok: true; data: T } | { ok: false; apiError: ApiError }> {
  const headers = authHeaders(auth);
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  try {
    const res = await fetch(`/api${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    let body: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    if (!res.ok) {
      const errObj = body as { error?: string } | null;
      return {
        ok: false,
        apiError: { status: res.status, error: errObj?.error, body },
      };
    }
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, apiError: { status: 0, error: "network_error" } };
  }
}

export function playerAuth(playerToken: string): AuthContext {
  return { playerToken };
}

export function gmAuth(masterToken: string): AuthContext {
  return { masterToken };
}

export function fetchCampaignList() {
  return apiRequest<{ campaigns: Array<{ id: string; name: string }> }>("/campaigns", {});
}

/** Verb catalog (buildings/units/ships/taxes). Cached on worldStore after login. */
export function fetchTableCatalog(auth: AuthContext) {
  return apiRequest<import("../state/viewTypes").TableCatalog>("/content/table", auth);
}
