/** GM posts as a polity without touching the browser player-token session. */

export type GmJsonResult = {
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
};

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const data = (await res.json().catch(() => ({}))) ?? {};
  return typeof data === "object" && data !== null
    ? (data as Record<string, unknown>)
    : {};
}

export async function gmMasterGet(
  url: string,
  masterToken: string,
): Promise<GmJsonResult> {
  const res = await fetch(url, {
    headers: { "X-Master-Token": masterToken },
  });
  return { ok: res.ok, status: res.status, data: await readJson(res) };
}

export async function gmMasterPost(
  url: string,
  masterToken: string,
  body: Record<string, unknown>,
): Promise<GmJsonResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Master-Token": masterToken,
    },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, data: await readJson(res) };
}

/**
 * Player force routes treat master as faction=null. Password in the body,
 * no X-Master-Token and no x-player-token.
 */
export async function gmFactionPasswordPost(
  url: string,
  body: Record<string, unknown>,
): Promise<GmJsonResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, data: await readJson(res) };
}

export function gmJsonError(result: GmJsonResult, fallback: string): string {
  const err = result.data.error;
  if (typeof err === "string" && err.trim()) return err;
  return fallback;
}
