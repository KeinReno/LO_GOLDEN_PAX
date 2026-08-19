/**
 * Order queries: active-order lookups, AP reservations, normalization,
 * ETA summary formatting. Extracted from ../orderEngine.mjs.
 */
import { gameHourAtTurn, hoursRemaining, turnsUntil } from "./time.mjs";

export const ACTIVE_STATUSES = new Set(["active", "pending"]);

export function activeOrders(world, factionId) {
  return (world?.orders ?? []).filter(
    (o) =>
      o.factionId === factionId &&
      ACTIVE_STATUSES.has(o.status) &&
      o.category !== "instant",
  );
}

/** AP parallelism: active ETA orders hold slots until resolved/cancelled. */
export function reservedApFromOrders(world, factionId) {
  return activeOrders(world, factionId).reduce(
    (sum, o) => sum + Math.max(0, Number(o.apCost ?? 0)),
    0,
  );
}

export function reservedForceApFromOrders(world, factionId) {
  return activeOrders(world, factionId).reduce(
    (sum, o) => sum + Math.max(0, Number(o.forceApCost ?? 0)),
    0,
  );
}

/** Migrate / normalize a persisted PlayerOrder. */
export function normalizePlayerOrder(raw, currentTurn = 0) {
  if (!raw || typeof raw !== "object") return raw;
  const category = raw.category ?? "eta";
  let status = raw.status ?? "pending";
  if (category === "eta" && raw.resolvesAt == null) {
    if (status === "pending" || status === "applied" || status === "accepted") {
      status = "resolved";
    }
  }
  if (status === "applied") status = "resolved";
  const { apCost, forceApCost } = raw.apCost != null
    ? { apCost: raw.apCost, forceApCost: raw.forceApCost ?? 0 }
    : { apCost: 0, forceApCost: 0 };
  return {
    ...raw,
    category,
    status,
    resolvesAt: raw.resolvesAt ?? null,
    startedAt: raw.startedAt ?? gameHourAtTurn(raw.turn ?? currentTurn),
    baseDuration: raw.baseDuration ?? null,
    modifiers: Array.isArray(raw.modifiers) ? raw.modifiers : [],
    progress: raw.progress ?? undefined,
    ratePerTurn: raw.ratePerTurn ?? undefined,
    apCost,
    forceApCost,
  };
}

/** UI helper: base → modifiers → total (hours). */
export function formatOrderEtaSummary(order, currentTurn) {
  const base = order.baseDuration ?? 0;
  const total =
    order.resolvesAt != null
      ? Math.max(0, (order.resolvesAt ?? 0) - (order.startedAt ?? 0))
      : null;
  const modParts = (order.modifiers ?? [])
    .map((m) => `${m.label || m.source} ×${m.mult ?? 1}`)
    .join(" → ");
  const remaining = hoursRemaining(order.resolvesAt, currentTurn);
  const turns = turnsUntil(order.resolvesAt, currentTurn);
  const head =
    modParts && total != null
      ? `${base}ч → ${modParts} → ${total}ч`
      : `${base}ч`;
  if (order.ratePerTurn != null) {
    const pct = Math.round((order.progress ?? 0) * 100);
    return `${head} · ${pct}%`;
  }
  return `${head} · через ${turns} ход${turns === 1 ? "" : turns < 5 ? "а" : "ов"} (≈${remaining}ч)`;
}
