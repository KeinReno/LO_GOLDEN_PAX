import { playerAuthHeaders, rememberPlayerTokenFromPayload } from "./playerAuth";
import type { ViewerPayload } from "./types";

type JsonErr = { error?: string };

export type EconomicTrackSession = {
  world?: ViewerPayload["world"];
  economy?: ViewerPayload["economy"];
  error?: string;
  adoptedPeg?: string | null;
  giveAmt?: number;
  takeAmt?: number;
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

export function postCurrencyUnion(body: {
  factionId: string;
  password?: string;
  fromFactionId: string;
  intoFactionId: string;
}) {
  return postJson<EconomicTrackSession>("/api/diplo/economic/union", body);
}

export function postExchangeDeal(body: {
  factionId: string;
  password?: string;
  factionAId: string;
  factionBId: string;
  unitsQuotePerBase?: number;
  basePeg?: string;
  quotePeg?: string;
}) {
  return postJson<EconomicTrackSession>("/api/diplo/economic/quote", body);
}

