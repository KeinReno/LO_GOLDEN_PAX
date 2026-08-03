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
import {
  collectSystemPoiEffects,
  isIntentForbiddenByEffects,
  checkDepotAttackRange,
  collectPoiEffects,
} from "./narrative.mjs";
import { readLedger, ensureFactionEco } from "./ledger.mjs";
import { resolveVisibleWithFog, readFog } from "./fogStore.mjs";
import {
  getKnownFactionIds,
  getTradePartnerIds,
} from "./factionIntel.mjs";
import { isCommonMarketMember } from "./marketMembership.mjs";

const VISION_GATED_INTENTS = new Set([
  "intent.move_fleet",
  "intent.move_legion",
  "intent.attack_system",
  "intent.blockade",
  "intent.fortify",
  "intent.claim_system",
]);

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
  // Pending + already-applied instant actions (build/colonize) spend AP this turn.
  return readIntents()
    .filter(
      (i) =>
        i.factionId === factionId &&
        (turn == null || i.turn === turn) &&
        (i.status === "pending" || i.status === "applied"),
    )
    .reduce((sum, i) => sum + (i.apCost ?? 0), 0);
}

function validateIntentGates(world, factionId, defId, payload) {
  const content = getContent();
  const ledger = readLedger();
  const eco = ensureFactionEco(ledger, factionId);

  const facEffects = [...collectPoiEffects(world, factionId, content)];
  if (eco.deficit === "empty") {
    facEffects.push({
      effect: "forbid_intent",
      args: { intentId: "intent.build" },
    });
  }
  if (isIntentForbiddenByEffects(facEffects, defId)) {
    return { ok: false, error: `Запрещено эффектами державы: ${defId}` };
  }

  const targetId =
    payload.toSystemId || payload.systemId || payload.fromSystemId;
  if (targetId) {
    const sys = (world.systems ?? []).find((s) => s.id === targetId);
    if (sys) {
      const sysEffects = collectSystemPoiEffects(sys, content);
      if (
        (defId === "intent.move_fleet" ||
          defId === "intent.move_legion" ||
          defId === "intent.attack_system" ||
          defId === "intent.blockade" ||
          defId === "intent.fortify") &&
        isIntentForbiddenByEffects(sysEffects, "intent.move_fleet")
      ) {
        return {
          ok: false,
          error: "Карантин: вход флотом/легионом запрещён",
        };
      }
      if (isIntentForbiddenByEffects(sysEffects, defId)) {
        return { ok: false, error: `Запрещено POI системы: ${defId}` };
      }
    }
  }

  if (defId === "intent.attack_system" && payload.toSystemId) {
    const depot = checkDepotAttackRange(
      world,
      factionId,
      payload.toSystemId,
    );
    if (!depot.ok) return depot;
  }

  if (VISION_GATED_INTENTS.has(defId)) {
    const toSystemId = payload.toSystemId || payload.systemId;
    if (toSystemId) {
      const visible = resolveVisibleWithFog(world, factionId, readFog());
      if (!visible.has(toSystemId)) {
        return { ok: false, error: "Цель вне радиуса обзора" };
      }
    }
  }

  if (defId === "intent.transfer") {
    const toId = payload.toFactionId;
    const visible = resolveVisibleWithFog(world, factionId, readFog());
    const known = getKnownFactionIds(world, factionId, [...visible]);
    if (!toId || !known.has(toId)) {
      return { ok: false, error: "Получатель неизвестен — нет контакта" };
    }
  }

  if (defId === "intent.market_offer") {
    const venue = payload.venue === "common" ? "common" : "contacts";
    if (venue === "common") {
      if (!isCommonMarketMember(factionId)) {
        return {
          ok: false,
          error: "Сначала вступите в общий рынок",
        };
      }
    } else {
      const visible = resolveVisibleWithFog(world, factionId, readFog());
      const known = getKnownFactionIds(world, factionId, [...visible]);
      const partners = getTradePartnerIds(world, factionId, known);
      if (partners.length === 0) {
        return {
          ok: false,
          error: "Нет торговых партнёров — нужен договор торговли или союз",
        };
      }
    }
  }

  return { ok: true };
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
  world,
}) {
  const content = getContent();
  const def = content.intents?.[defId];
  if (!def) return { ok: false, error: `Неизвестный intent: ${defId}` };

  const apCost = def.ap ?? 0;
  const used = reservedAp(factionId, turn);
  if (used + apCost > apMax) {
    return {
      ok: false,
      error: `Недостаточно AP (занято ${used}/${apMax}, нужно ещё ${apCost})`,
    };
  }

  if (world) {
    const gate = validateIntentGates(world, factionId, defId, payload || {});
    if (!gate.ok) return gate;
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
  list[idx] = {
    ...intent,
    status: "cancelled",
    cancelledAt: new Date().toISOString(),
  };
  writeIntents(list);
  return { ok: true, intent: list[idx] };
}
