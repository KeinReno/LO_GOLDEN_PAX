import type { DiplomacyRelation } from "../state/types";
import type { DiploDealItem, TradeAssetPool } from "./diploTradeTypes";

export const DIPLO_CARD_PREFIX = "diplo:";
export const DIPLO_ZONE_ACCEPTS = [DIPLO_CARD_PREFIX];

export type ParsedDiploCard =
  | { kind: "resource"; currencyId: string }
  | { kind: "treaty"; treaty: DiplomacyRelation }
  | { kind: "tech"; techId: string }
  | { kind: "fleet"; fleetId: string }
  | { kind: "legion"; legionId: string }
  | { kind: "system"; systemId: string };

export function diploCardId(parsed: ParsedDiploCard): string {
  switch (parsed.kind) {
    case "resource":
      return `${DIPLO_CARD_PREFIX}res:${parsed.currencyId}`;
    case "treaty":
      return `${DIPLO_CARD_PREFIX}treaty:${parsed.treaty}`;
    case "tech":
      return `${DIPLO_CARD_PREFIX}tech:${parsed.techId}`;
    case "fleet":
      return `${DIPLO_CARD_PREFIX}fleet:${parsed.fleetId}`;
    case "legion":
      return `${DIPLO_CARD_PREFIX}legion:${parsed.legionId}`;
    case "system":
      return `${DIPLO_CARD_PREFIX}system:${parsed.systemId}`;
  }
}

export function parseDiploCard(cardId: string): ParsedDiploCard | null {
  if (!cardId.startsWith(DIPLO_CARD_PREFIX)) return null;
  const rest = cardId.slice(DIPLO_CARD_PREFIX.length);
  const colon = rest.indexOf(":");
  if (colon <= 0) return null;
  const kind = rest.slice(0, colon);
  const id = rest.slice(colon + 1);
  if (!id) return null;
  if (kind === "res") return { kind: "resource", currencyId: id };
  if (kind === "treaty") return { kind: "treaty", treaty: id as DiplomacyRelation };
  if (kind === "tech") return { kind: "tech", techId: id };
  if (kind === "fleet") return { kind: "fleet", fleetId: id };
  if (kind === "legion") return { kind: "legion", legionId: id };
  if (kind === "system") return { kind: "system", systemId: id };
  return null;
}

export function parsedToDealItem(
  parsed: ParsedDiploCard,
  amount = 1,
): DiploDealItem {
  if (parsed.kind === "resource") {
    return { kind: "resource", currencyId: parsed.currencyId, amount };
  }
  if (parsed.kind === "treaty") return { kind: "treaty", treaty: parsed.treaty };
  if (parsed.kind === "tech") return { kind: "tech", techId: parsed.techId };
  if (parsed.kind === "fleet") return { kind: "fleet", fleetId: parsed.fleetId };
  if (parsed.kind === "legion") return { kind: "legion", legionId: parsed.legionId };
  return { kind: "system", systemId: parsed.systemId };
}

export function uniqueDealKey(item: DiploDealItem): string | null {
  if (item.kind === "fleet") return `fleet:${item.fleetId}`;
  if (item.kind === "legion") return `legion:${item.legionId}`;
  if (item.kind === "system") return `system:${item.systemId}`;
  if (item.kind === "tech") return `tech:${item.techId}`;
  if (item.kind === "treaty") return `treaty:${item.treaty}`;
  return null;
}

export function resourceCommitted(
  items: DiploDealItem[],
  currencyId: string,
): number {
  let n = 0;
  for (const item of items) {
    if (item.kind === "resource" && item.currencyId === currencyId) {
      n += Number(item.amount) || 0;
    }
  }
  return n;
}

/** Merge stacked resources; skip duplicate unique assets. */
export function addDealItem(
  list: DiploDealItem[],
  item: DiploDealItem,
): { next: DiploDealItem[]; skipped?: string } {
  if (item.kind === "resource") {
    const idx = list.findIndex(
      (row) => row.kind === "resource" && row.currencyId === item.currencyId,
    );
    if (idx >= 0) {
      const cur = list[idx];
      if (cur.kind !== "resource") return { next: list };
      const next = list.slice();
      next[idx] = { ...cur, amount: cur.amount + item.amount };
      return { next };
    }
    return { next: [...list, item] };
  }
  const key = uniqueDealKey(item);
  if (key && list.some((row) => uniqueDealKey(row) === key)) {
    return { next: list, skipped: "already" };
  }
  return { next: [...list, item] };
}

function hasAsset(
  pool: TradeAssetPool,
  kind: "fleets" | "legions" | "systems" | "techs",
  id: string,
) {
  return pool[kind].some((row) => row.id === id);
}

export function resourceCommittedInOffers(
  offers: { give?: DiploDealItem[] }[] | undefined,
  currencyId: string,
): number {
  let n = 0;
  for (const offer of offers ?? []) {
    n += resourceCommitted(offer.give ?? [], currencyId);
  }
  return n;
}

export function remainingStock(
  have: number | undefined,
  items: DiploDealItem[],
  currencyId: string,
  escrowed = 0,
): number {
  return Math.max(
    0,
    (Number(have) || 0) - resourceCommitted(items, currencyId) - escrowed,
  );
}

const HOLD_TREATIES = new Set(["alliance", "vassal"]);

/** Fleet / world / tech / alliance need a hold before accept. */
export function dealNeedsHold(items: DiploDealItem[]): boolean {
  return items.some((item) => {
    if (
      item.kind === "fleet" ||
      item.kind === "legion" ||
      item.kind === "system" ||
      item.kind === "tech"
    ) {
      return true;
    }
    return item.kind === "treaty" && HOLD_TREATIES.has(item.treaty);
  });
}

function itemWeight(item: DiploDealItem): number {
  if (item.kind === "resource") return Math.max(1, Number(item.amount) || 0);
  if (item.kind === "treaty" && HOLD_TREATIES.has(item.treaty)) return 120;
  if (item.kind === "treaty") return 50;
  return 80;
}

export type DealFairness = {
  label: string;
  tone: "even" | "give" | "want";
};

/** Rough give-vs-want skew for the compose table. Not an AI acceptance score. */
export function dealFairness(
  give: DiploDealItem[],
  want: DiploDealItem[],
): DealFairness | null {
  if (give.length === 0 && want.length === 0) return null;
  const g = give.reduce((sum, item) => sum + itemWeight(item), 0);
  const w = want.reduce((sum, item) => sum + itemWeight(item), 0);
  if (g === 0 && w === 0) return null;
  const bigger = Math.max(g, w);
  const smaller = Math.min(g, w) || 1;
  if (bigger / smaller <= 1.4) return { label: "пакет ровный", tone: "even" };
  if (g > w) return { label: "вы отдаёте больше", tone: "give" };
  return { label: "вы просите больше", tone: "want" };
}

export function treatyConflict(
  items: DiploDealItem[],
  treaty: string,
): boolean {
  return items.some((row) => row.kind === "treaty" && row.treaty !== treaty);
}

/** Give = our assets. Want = their visible forces/systems, or any resource/treaty. */
export function cardAllowedOnSide(
  parsed: ParsedDiploCard,
  side: "give" | "want",
  my: TradeAssetPool,
  their: TradeAssetPool,
): boolean {
  if (parsed.kind === "resource" || parsed.kind === "treaty") return true;
  if (parsed.kind === "tech") {
    return side === "give" ? hasAsset(my, "techs", parsed.techId) : false;
  }
  if (parsed.kind === "fleet") {
    return side === "give"
      ? hasAsset(my, "fleets", parsed.fleetId)
      : hasAsset(their, "fleets", parsed.fleetId);
  }
  if (parsed.kind === "legion") {
    return side === "give"
      ? hasAsset(my, "legions", parsed.legionId)
      : hasAsset(their, "legions", parsed.legionId);
  }
  return side === "give"
    ? hasAsset(my, "systems", parsed.systemId)
    : hasAsset(their, "systems", parsed.systemId);
}
