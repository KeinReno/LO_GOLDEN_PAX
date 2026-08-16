/** Session token after /api/login. Never log the value. */
const HEADER = "x-player-token";

let playerToken = "";

export function setPlayerToken(token: string | null | undefined) {
  playerToken = String(token || "").trim();
}

export function clearPlayerToken() {
  playerToken = "";
}

export function getPlayerToken(): string {
  return playerToken;
}

export function rememberPlayerTokenFromPayload(data: {
  playerToken?: string | null;
}) {
  if (data?.playerToken) setPlayerToken(data.playerToken);
}

/** Attach x-player-token when a session token is held. Password compat stays caller-side. */
export function playerAuthHeaders(
  extra: Record<string, string> = {},
): Record<string, string> {
  const headers = { ...extra };
  if (playerToken) headers[HEADER] = playerToken;
  return headers;
}
