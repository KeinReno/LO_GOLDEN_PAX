/**
 * Intents inbox (P2.1) — evolves player-orders.json.
 */
import {
  INTENTS_PATH,
  ORDERS_PATH,
  readJson,
  writeJson,
} from "./tableStore.mjs";
import { getContent } from "./contentLoader.mjs";

function legacyTypeToDefId(type) {
  const intents = getContent().intents || {};
  for (const [id, def] of Object.entries(intents)) {
    if (def.legacyOrderType === type) return id;
  }
  if (type?.startsWith("intent.")) return type;
  return `intent.${type}`;
}

/** Merge legacy orders file into intents shape once. */
export function readIntents() {
  const intents = readJson(INTENTS_PATH, null);
  if (Array.isArray(intents)) return intents;

  const orders = readJson(ORDERS_PATH, []);
  if (!Array.isArray(orders) || orders.length === 0) return [];

  return orders.map((o) => ({
    id: o.id,
    defId: legacyTypeToDefId(o.type),
    factionId: o.factionId,
    turn: o.turn,
    status: o.status || "pending",
    apCost: getContent().intents?.[legacyTypeToDefId(o.type)]?.ap ?? 1,
    payload: {
      fleetId: o.fleetId,
      legionId: o.legionId,
      fromSystemId: o.fromSystemId,
      toSystemId: o.toSystemId,
    },
    note: o.note || "",
    submittedAt: o.createdAt || new Date().toISOString(),
    source: "map",
    legacyType: o.type,
  }));
}

export function writeIntents(list) {
  writeJson(INTENTS_PATH, list);
  // Keep legacy mirror for old UI
  const orders = list.map((i) => ({
    id: i.id,
    factionId: i.factionId,
    type: i.legacyType || i.defId.replace(/^intent\./, ""),
    turn: i.turn,
    status: i.status,
    fleetId: i.payload?.fleetId,
    legionId: i.payload?.legionId,
    fromSystemId: i.payload?.fromSystemId,
    toSystemId: i.payload?.toSystemId,
    note: i.note || "",
    createdAt: i.submittedAt,
  }));
  writeJson(ORDERS_PATH, orders);
}

export function getPendingForFaction(factionId, turn) {
  return readIntents().filter(
    (i) =>
      i.factionId === factionId &&
      i.status === "pending" &&
      (turn == null || i.turn === turn),
  );
}

export function reservedAp(factionId, turn) {
  return getPendingForFaction(factionId, turn).reduce(
    (sum, i) => sum + (i.apCost ?? 0),
    0,
  );
}

/**
 * @returns {{ ok: true, intent } | { ok: false, error: string }}
 */
export function submitIntent({
  factionId,
  defId,
  payload,
  note,
  source,
  turn,
  apMax,
}) {
  const def = getContent().intents?.[defId];
  if (!def) return { ok: false, error: `Неизвестный intent: ${defId}` };

  const apCost = def.ap ?? 0;
  const used = reservedAp(factionId, turn);
  if (used + apCost > apMax) {
    return {
      ok: false,
      error: `Недостаточно AP (занято ${used}/${apMax}, нужно ещё ${apCost})`,
    };
  }

  const intent = {
    id: `int_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    defId,
    factionId,
    turn,
    status: "pending",
    apCost,
    payload: payload || {},
    note: note || "",
    submittedAt: new Date().toISOString(),
    source: source || "map",
    legacyType: def.legacyOrderType || null,
  };

  const list = readIntents();
  list.push(intent);
  writeIntents(list);
  return { ok: true, intent };
}

export function cancelIntent(intentId, factionId) {
  const list = readIntents();
  const idx = list.findIndex((i) => i.id === intentId);
  if (idx < 0) return { ok: false, error: "Intent не найден" };
  const intent = list[idx];
  if (intent.factionId !== factionId) {
    return { ok: false, error: "Чужой intent" };
  }
  if (intent.status !== "pending") {
    return { ok: false, error: "Можно отменить только pending" };
  }
  list[idx] = { ...intent, status: "cancelled", cancelledAt: new Date().toISOString() };
  writeIntents(list);
  return { ok: true, intent: list[idx] };
}
