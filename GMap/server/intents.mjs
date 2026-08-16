/**
 * Intents inbox (P2.1) — evolves player-orders.json.
 */
import {
  INTENTS_PATH,
  ORDERS_PATH,
  readJson,
  writeJson,
} from "./tableStore.mjs";
import { isNormalizedStoreActive } from "./db/storeAdapter.mjs";
import {
  readPlayerIntents,
  writePlayerIntents,
} from "./db/campaignDb.mjs";
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
import { intentApCosts } from "./apBudget.mjs";
import { readLiveBoard } from "./tableStore.mjs";
import { checkMoveRange } from "./forceMovement.mjs";
import { assertMoveAffordable, collectMoveCostEffects, techMoveCostEffects } from "./forceMp.mjs";

const VISION_GATED_INTENTS = new Set([
  "intent.move_fleet",
  "intent.move_legion",
  "intent.attack_system",
  "intent.blockade",
  "intent.fortify",
  "intent.claim_system",
  "intent.scout_reveal",
  "intent.scout_world",
]);

function factionHasScoutPresence(world, factionId, systemId) {
  const near = new Set([systemId]);
  for (const l of world.links ?? []) {
    if (l.fromId === systemId) near.add(l.toId);
    else if (l.toId === systemId) near.add(l.fromId);
  }
  for (const f of world.fleets ?? []) {
    if (f.factionId === factionId && near.has(f.systemId)) return true;
  }
  for (const l of world.legions ?? []) {
    if (l.factionId === factionId && near.has(l.systemId)) return true;
  }
  return false;
}

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
  if (isNormalizedStoreActive()) {
    const fromDb = readPlayerIntents();
    if (Array.isArray(fromDb)) return fromDb;
  }

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
  if (isNormalizedStoreActive()) {
    writePlayerIntents(list);
  } else {
    writeJson(INTENTS_PATH, list);
  }
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

function activeOrderSlots(world, factionId) {
  return (world?.orders ?? []).filter(
    (o) =>
      o.factionId === factionId &&
      (o.status === "active" || o.status === "pending") &&
      o.category !== "instant",
  );
}

function intentsSpendingAp(_factionId, _turn) {
  // B4: AP parallelism — only active ETA orders hold slots (not per-turn intents).
  return [];
}

export function reservedAp(factionId, turn, world) {
  const w = world ?? readLiveBoard();
  if (!w) return 0;
  return activeOrderSlots(w, factionId).reduce(
    (sum, o) => sum + Math.max(0, Number(o.apCost ?? 0)),
    0,
  );
}

export function reservedForceAp(factionId, turn, world) {
  const w = world ?? readLiveBoard();
  if (!w) return 0;
  return activeOrderSlots(w, factionId).reduce(
    (sum, o) => sum + Math.max(0, Number(o.forceApCost ?? 0)),
    0,
  );
}

export function validateIntentGates(world, factionId, defId, payload) {
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
      payload,
    );
    if (!depot.ok) return depot;
  }

  const MOVE_RANGE_INTENTS = {
    "intent.move_fleet": "fleet",
    "intent.move_legion": "legion",
    "intent.blockade": "fleet",
    "intent.fortify": "fleet",
  };
  const moveMode = MOVE_RANGE_INTENTS[defId];
  if (moveMode && payload.toSystemId) {
    const unitId =
      moveMode === "legion" ? payload.legionId : payload.fleetId;
    const unit =
      moveMode === "legion"
        ? (world.legions ?? []).find((l) => l.id === unitId)
        : (world.fleets ?? []).find((f) => f.id === unitId);
    const fromId = unit?.systemId ?? payload.fromSystemId;
    if (fromId && fromId !== payload.toSystemId) {
      const range = checkMoveRange(
        world,
        content,
        fromId,
        payload.toSystemId,
        moveMode,
        unit,
      );
      if (!range.ok) return range;
      const fac = (world.factions ?? []).find((f) => f.id === factionId);
      const effects = collectMoveCostEffects(
        fac?.activeEffects,
        techMoveCostEffects(eco, content),
        unit,
      );
      const afford = assertMoveAffordable(
        unit,
        range.hops,
        content,
        effects,
        moveMode === "legion" ? "legion" : "fleet",
      );
      if (!afford.ok) return { ok: false, error: afford.error };
    }
  }

  if (VISION_GATED_INTENTS.has(defId)) {
    const toSystemId = payload.toSystemId || payload.systemId;
    if (toSystemId) {
      const visible = resolveVisibleWithFog(world, factionId, readFog());
      if (!visible.has(toSystemId)) {
        const ownForcesNearby =
          defId === "intent.scout_reveal" ||
          defId === "intent.attack_system"
            ? factionHasScoutPresence(world, factionId, toSystemId)
            : false;
        if (ownForcesNearby) {
          // ok — разведка / удар сил в системе или с соседней
        } else {
          return { ok: false, error: "Цель вне радиуса обзора" };
        }
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
  forceApMax = 0,
  world,
  master = false,
}) {
  const content = getContent();
  const def = content.intents?.[defId];
  if (!def) return { ok: false, error: `Неизвестный intent: ${defId}` };
  if (def.gmOnly && !master) {
    return { ok: false, error: "Только мастер может отправить этот intent" };
  }

  const { apCost, forceApCost } = intentApCosts(def);
  const used = reservedAp(factionId, turn, world);
  if (apCost > 0 && used + apCost > apMax) {
    return {
      ok: false,
      error: `Недостаточно ОД (занято ${used}/${apMax}, нужно ещё ${apCost})`,
    };
  }
  const usedForce = reservedForceAp(factionId, turn, world);
  if (forceApCost > 0 && usedForce + forceApCost > forceApMax) {
    return {
      ok: false,
      error: `Недостаточно ОД сил (занято ${usedForce}/${forceApMax}, нужно ещё ${forceApCost})`,
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
    forceApCost,
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
