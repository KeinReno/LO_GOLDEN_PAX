/** Session token after /api/login. Never log the value. */
const HEADER = "x-player-token";
const STORAGE_KEY = "gmap-player-token";

function readStoredToken(): string {
  try {
    return String(sessionStorage.getItem(STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

function writeStoredToken(token: string) {
  try {
    if (token) sessionStorage.setItem(STORAGE_KEY, token);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

let playerToken = readStoredToken();

export function setPlayerToken(token: string | null | undefined) {
  playerToken = String(token || "").trim();
  writeStoredToken(playerToken);
}

export function clearPlayerToken() {
  playerToken = "";
  writeStoredToken("");
}

export function getPlayerToken(): string {
  return playerToken;
}

export function hasPlayerToken(): boolean {
  return Boolean(playerToken);
}

export function rememberPlayerTokenFromPayload(data: {
  playerToken?: string | null;
}) {
  if (data?.playerToken) setPlayerToken(data.playerToken);
}

/** Drop PIN from JSON when a session token is already on the wire. */
export function playerJsonBody(
  body: Record<string, unknown>,
): Record<string, unknown> {
  if (!playerToken) return body;
  const next = { ...body };
  delete next.password;
  delete next.playerToken;
  return next;
}

/** Attach x-player-token when a session token is held. Password compat stays caller-side. */
export function playerAuthHeaders(
  extra: Record<string, string> = {},
): Record<string, string> {
  const headers = { ...extra };
  if (playerToken) headers[HEADER] = playerToken;
  return headers;
}
