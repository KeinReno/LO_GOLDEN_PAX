import { RESOURCE_META, type ResourceMeta } from "./resourcePool.generated.ts";

function metaForToken(token: string): ResourceMeta | undefined {
  if (!token) return undefined;
  const direct = RESOURCE_META[token];
  if (direct) return direct;
  for (const meta of Object.values(RESOURCE_META)) {
    if (meta.id === token || meta.name === token) return meta;
  }
  return undefined;
}

/** `map.iron` and «железо» are the same deposit. */
export function sameDepositToken(a: string, b: string): boolean {
  if (a === b) return true;
  const ma = metaForToken(a);
  const mb = metaForToken(b);
  return !!ma && !!mb && ma.id === mb.id;
}

export function resourcesHas(
  list: string[] | undefined,
  token: string,
): boolean {
  return (list ?? []).some((x) => sameDepositToken(x, token));
}

/** Store the paint-pool name when known; strip id/name duplicates. */
export function toggleDeposit(
  list: string[] | undefined,
  token: string,
): string[] {
  const cur = list ?? [];
  if (resourcesHas(cur, token)) {
    return cur.filter((x) => !sameDepositToken(x, token));
  }
  const meta = metaForToken(token);
  return [...cur, meta?.name ?? token];
}

export function uniqueDepositTokens(values: string[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    if (!out.some((x) => sameDepositToken(x, v))) out.push(v);
  }
  return out;
}

/** Unknown tiles stay; catalog id/name twins of the pool are dropped. */
export function paintTagExtras(
  current: string[] | undefined,
  pool: readonly string[],
): string[] {
  const extras = (current ?? []).filter((r) => {
    if (pool.includes(r)) return false;
    return !pool.some((p) => sameDepositToken(p, r));
  });
  return uniqueDepositTokens(extras);
}
