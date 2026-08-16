/**
 * C5 T5.4 — detect pending intents of the same resolve-rank claiming
 * the same target/resource (mirrors processTurn rank buckets).
 */
import type { IntentRow } from "../IntentsInbox";

/** Same rank buckets as processTurn.mjs intent sort. */
export function intentResolveRank(defId: string): number {
  if (
    defId === "intent.transfer" ||
    defId === "intent.market_convert" ||
    defId === "intent.market_offer" ||
    defId === "intent.market_cancel"
  ) {
    return 0;
  }
  if (defId === "intent.set_tax") return 1;
  return 2;
}

type Payload = NonNullable<IntentRow["payload"]>;

/** Claim key for target/resource; null = no contestable claim. */
export function intentClaimKey(intent: IntentRow): string | null {
  const p = (intent.payload ?? {}) as Payload;
  const sys = p.toSystemId || p.systemId;
  if (sys) return `sys:${sys}`;
  if (p.currencyId) return `res:${p.currencyId}`;
  if (p.giveCurrency || p.wantCurrency) {
    return `mkt:${p.giveCurrency || "?"}→${p.wantCurrency || "?"}`;
  }
  if (p.fromCurrency || p.toCurrency) {
    return `cvt:${p.fromCurrency || "?"}→${p.toCurrency || "?"}`;
  }
  if (p.offerId) return `offer:${p.offerId}`;
  if (p.taxSlot) return `tax:${p.taxSlot}`;
  if (p.upgradeId || p.techId) {
    return `tech:${p.upgradeId || p.techId}`;
  }
  return null;
}

export type ContestedIntentGroup = {
  id: string;
  rank: number;
  claimKey: string;
  claimLabel: string;
  intentIds: string[];
  factionIds: string[];
  intents: IntentRow[];
};

function claimLabel(claimKey: string): string {
  if (claimKey.startsWith("sys:")) return `система ${claimKey.slice(4)}`;
  if (claimKey.startsWith("res:")) return `ресурс ${claimKey.slice(4)}`;
  if (claimKey.startsWith("mkt:")) return `рынок ${claimKey.slice(4)}`;
  if (claimKey.startsWith("cvt:")) return `обмен ${claimKey.slice(4)}`;
  if (claimKey.startsWith("offer:")) return `заявка ${claimKey.slice(6)}`;
  if (claimKey.startsWith("tax:")) return `налог ${claimKey.slice(4)}`;
  if (claimKey.startsWith("tech:")) return `тех ${claimKey.slice(5)}`;
  return claimKey;
}

/**
 * Groups of ≥2 pending intents sharing resolve-rank + claim key.
 */
export function findContestedIntentGroups(
  pending: IntentRow[],
): ContestedIntentGroup[] {
  const buckets = new Map<string, IntentRow[]>();
  for (const intent of pending) {
    if (intent.status && intent.status !== "pending") continue;
    const claimKey = intentClaimKey(intent);
    if (!claimKey) continue;
    const rank = intentResolveRank(intent.defId);
    const bucketId = `${rank}|${claimKey}`;
    const list = buckets.get(bucketId) ?? [];
    list.push(intent);
    buckets.set(bucketId, list);
  }

  const groups: ContestedIntentGroup[] = [];
  for (const [bucketId, intents] of buckets) {
    if (intents.length < 2) continue;
    const [rankStr, ...claimParts] = bucketId.split("|");
    const claimKey = claimParts.join("|");
    const rank = Number(rankStr);
    const factionIds = [...new Set(intents.map((i) => i.factionId))];
    groups.push({
      id: `contested:${bucketId}`,
      rank,
      claimKey,
      claimLabel: claimLabel(claimKey),
      intentIds: intents.map((i) => i.id),
      factionIds,
      intents,
    });
  }

  groups.sort(
    (a, b) =>
      b.intents.length - a.intents.length ||
      a.claimLabel.localeCompare(b.claimLabel, "ru"),
  );
  return groups;
}

/** Map intentId → contested group (for row highlighting). */
export function contestedIntentIdSet(
  groups: ContestedIntentGroup[],
): Map<string, ContestedIntentGroup> {
  const map = new Map<string, ContestedIntentGroup>();
  for (const g of groups) {
    for (const id of g.intentIds) map.set(id, g);
  }
  return map;
}
