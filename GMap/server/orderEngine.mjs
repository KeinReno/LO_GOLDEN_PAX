/**
 * B4 — Order + AP time engine (ETA processes, accumulating research).
 * Single time model: game hours = turn × HOURS_PER_TURN.
 */
import { getContent } from "./contentLoader.mjs";
import { intentApCosts } from "./apBudget.mjs";
import {
  completeForceTravel,
  refreshSystemBlockade,
} from "./forceMovement.mjs";
import { hopPath } from "./pathfinding.mjs";
import {
  applyPlanetAction,
  pushSystemHistory,
} from "./planetActions.mjs";
import { researchTech } from "./techActions.mjs";

export const HOURS_PER_TURN = 24;

const ACTIVE_STATUSES = new Set(["active", "pending"]);

/** Intent → order category (content override or legacy instant flag). */
export function intentCategory(def) {
  if (def?.category === "instant" || def?.category === "pending" || def?.category === "eta") {
    return def.category;
  }
  if (def?.instant) return "instant";
  return "eta";
}

export function gameHourAtTurn(turn) {
  return Math.max(0, Math.floor(Number(turn) || 0)) * HOURS_PER_TURN;
}

export function turnsUntil(resolvesAt, currentTurn) {
  const now = gameHourAtTurn(currentTurn);
  const remaining = Math.max(0, (Number(resolvesAt) || 0) - now);
  return Math.ceil(remaining / HOURS_PER_TURN);
}

export function hoursRemaining(resolvesAt, currentTurn) {
  const now = gameHourAtTurn(currentTurn);
  return Math.max(0, Math.round((Number(resolvesAt) || 0) - now));
}

export function buildHoursFromTier(tier) {
  const t = Math.max(1, Math.min(10, Math.floor(Number(tier) || 1)));
  if (t <= 1) return 6;
  if (t <= 3) return 24;
  if (t <= 6) return 72;
  return 240;
}

export function resolveBuildHours(content, buildingId) {
  const def = content?.buildings?.[buildingId];
  if (!def) return 24;
  if (def.buildHours != null) return Math.max(1, Number(def.buildHours) || 24);
  return buildHoursFromTier(def.tier ?? 1);
}

export function systemDistance(world, fromId, toId) {
  const a = (world.systems ?? []).find((s) => s.id === fromId);
  const b = (world.systems ?? []).find((s) => s.id === toId);
  if (!a || !b) return 0;
  if (fromId === toId) return 0;
  const dx = (Number(a.x) || 0) - (Number(b.x) || 0);
  const dy = (Number(a.y) || 0) - (Number(b.y) || 0);
  return Math.sqrt(dx * dx + dy * dy);
}

export function resolveFleetSpeed(world, fleetId, content) {
  const fleet = (world.fleets ?? []).find((f) => f.id === fleetId);
  const fallback = Number(content?.rules?.movement?.defaultFleetSpeed ?? 10);
  if (!fleet) return fallback;
  const ships = content?.ships ?? {};
  let total = 0;
  let count = 0;
  for (const g of fleet.composition ?? []) {
    const sid = g.shipId || g.defId || g.id || g.templateId;
    const def = sid ? ships[sid] : null;
    const speed =
      Number(def?.stats?.speed ?? def?.speed ?? g.speed ?? 5) || 5;
    const n = Math.max(1, Number(g.count) || 1);
    total += speed * n;
    count += n;
  }
  return count > 0 ? Math.max(1, total / count) : fallback;
}

export function resolveLegionSpeed(content) {
  return Number(content?.rules?.movement?.legionSpeed ?? 4);
}

export function applyDurationModifiers(baseHours, modifiers = []) {
  let hours = baseHours;
  for (const m of modifiers) {
    if (m.mult != null) hours *= Number(m.mult) || 1;
    if (m.flat != null) hours += Number(m.flat) || 0;
  }
  return Math.max(1, Math.round(hours));
}

export function computeFleetMoveEta(world, content, fromId, toId, fleetId, modifiers = []) {
  const dist = systemDistance(world, fromId, toId);
  const speed = resolveFleetSpeed(world, fleetId, content);
  const path = hopPath(world, fromId, toId, "fleet");
  const hopMult = path.length > 1 ? path.length - 1 : 1;
  const base = Math.max(1, (dist * hopMult) / speed);
  const baseDuration = Math.round(base);
  const totalHours = applyDurationModifiers(baseDuration, modifiers);
  return { baseDuration, totalHours, modifiers: [...modifiers] };
}

export function computeLegionMoveEta(world, content, fromId, toId, modifiers = []) {
  const dist = systemDistance(world, fromId, toId);
  const speed = resolveLegionSpeed(content);
  const path = hopPath(world, fromId, toId, "legion");
  const hopMult = path.length > 1 ? path.length - 1 : 1;
  const baseDuration = Math.max(1, Math.round((dist * hopMult) / speed));
  const totalHours = applyDurationModifiers(baseDuration, modifiers);
  return { baseDuration, totalHours, modifiers: [...modifiers] };
}

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

function newOrderId() {
  return `ord_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function orderTypeFromDefId(defId) {
  const map = {
    "intent.move_fleet": "move_fleet",
    "intent.move_legion": "move_legion",
    "intent.attack_system": "attack_system",
    "intent.blockade": "blockade",
    "intent.fortify": "fortify",
    "intent.build": "build",
    "intent.research_upgrade": "research",
    "intent.scout_world": "scout",
    "intent.send_caravan": "caravan",
  };
  return map[defId] || defId?.replace(/^intent\./, "") || "order";
}

function arriveStanceForDef(defId) {
  if (defId === "intent.blockade") return "blockade";
  if (defId === "intent.fortify") return "fortify";
  return "idle";
}

/**
 * Create an ETA PlayerOrder from a submitted intent; mutates world.orders.
 * @returns {{ ok: true, order } | { ok: false, error: string }}
 */
export function createOrderFromIntent(world, intent, def) {
  const content = getContent();
  const category = intentCategory(def);
  if (category !== "eta") {
    return { ok: false, error: "not_eta_intent" };
  }

  const turn = world.meta?.turn ?? 0;
  const startedAt = gameHourAtTurn(turn);
  const { apCost, forceApCost } = intentApCosts(def);
  const payload = intent.payload || {};
  const type = orderTypeFromDefId(intent.defId);
  let baseDuration = 24;
  let modifiers = [];
  let resolvesAt = startedAt + 24;
  let progress = 0;
  let ratePerTurn = null;
  const order = {
    id: newOrderId(),
    factionId: intent.factionId,
    type,
    turn,
    status: "active",
    category: "eta",
    intentId: intent.id,
    startedAt,
    baseDuration,
    modifiers,
    resolvesAt,
    progress,
    apCost,
    forceApCost,
    fleetId: payload.fleetId,
    legionId: payload.legionId,
    fromSystemId: payload.fromSystemId,
    toSystemId: payload.toSystemId,
    systemId: payload.systemId,
    planetId: payload.planetId,
    buildingId: payload.buildingId,
    techId: payload.techId,
    note: intent.note || "",
    createdAt: intent.submittedAt || new Date().toISOString(),
    payload: { ...payload },
  };

  if (
    intent.defId === "intent.move_fleet" ||
    intent.defId === "intent.blockade" ||
    intent.defId === "intent.fortify" ||
    intent.defId === "intent.attack_system"
  ) {
    const fleetId = payload.fleetId;
    const fleet = (world.fleets ?? []).find((f) => f.id === fleetId);
    if (!fleet || fleet.factionId !== intent.factionId) {
      return { ok: false, error: "Флот недоступен" };
    }
    const fromId = payload.fromSystemId || fleet.systemId;
    const toId = payload.toSystemId;
    if (!toId) return { ok: false, error: "Нет цели" };
    const eta = computeFleetMoveEta(world, content, fromId, toId, fleetId, modifiers);
    baseDuration = eta.baseDuration;
    modifiers = eta.modifiers;
    resolvesAt = startedAt + eta.totalHours;
    order.fromSystemId = fromId;
    order.toSystemId = toId;
    order.baseDuration = baseDuration;
    order.modifiers = modifiers;
    order.resolvesAt = resolvesAt;
    fleet.travelOrderId = order.id;
    fleet.stance = "move";
    if (intent.defId === "intent.attack_system") {
      fleet.pendingAttackSystemId = toId;
    }
  } else if (intent.defId === "intent.move_legion") {
    const legionId = payload.legionId;
    const legion = (world.legions ?? []).find((l) => l.id === legionId);
    if (!legion || legion.factionId !== intent.factionId) {
      return { ok: false, error: "Легион недоступен" };
    }
    const fromId = payload.fromSystemId || legion.systemId;
    const toId = payload.toSystemId;
    if (!toId) return { ok: false, error: "Нет цели" };
    const eta = computeLegionMoveEta(world, content, fromId, toId, modifiers);
    baseDuration = eta.baseDuration;
    modifiers = eta.modifiers;
    resolvesAt = startedAt + eta.totalHours;
    order.fromSystemId = fromId;
    order.toSystemId = toId;
    order.baseDuration = baseDuration;
    order.modifiers = modifiers;
    order.resolvesAt = resolvesAt;
    legion.travelOrderId = order.id;
    legion.status = "move";
    if (intent.defId === "intent.attack_system" && payload.legionId) {
      legion.pendingAttackSystemId = toId;
    }
  } else if (intent.defId === "intent.build") {
    const { systemId, planetId, buildingId } = payload;
    if (!systemId || !planetId || !buildingId) {
      return { ok: false, error: "Неполные параметры стройки" };
    }
    const buildHours = resolveBuildHours(content, buildingId);
    baseDuration = buildHours;
    resolvesAt = startedAt + buildHours;
    order.baseDuration = baseDuration;
    order.resolvesAt = resolvesAt;
    order.systemId = systemId;
    order.planetId = planetId;
    order.buildingId = buildingId;
    const apMax = content.rules?.apPerTurn ?? 9;
    const prep = applyPlanetAction({
      world,
      factionId: intent.factionId,
      action: "build",
      systemId,
      planetId,
      buildingId,
      note: `order:${order.id}`,
      apMax,
      persist: false,
      skipApCheck: true,
      skipIntentRecord: true,
      deferPlacement: true,
    });
    if (!prep.ok) return prep;
    order.buildingInstanceId = prep.building?.id;
    order.payload = {
      ...order.payload,
      building: prep.building,
      listKey: prep.listKey,
    };
    order.buildReserved = true;
  } else if (intent.defId === "intent.research_upgrade" || payload.techId) {
    order.type = "research";
    order.techId = payload.techId || payload.upgradeId;
    ratePerTurn = 0.2;
    order.ratePerTurn = ratePerTurn;
    order.progress = 0;
    order.resolvesAt = null;
  } else {
    baseDuration = 24;
    resolvesAt = startedAt + baseDuration;
    order.baseDuration = baseDuration;
    order.resolvesAt = resolvesAt;
  }

  if (!Array.isArray(world.orders)) world.orders = [];
  world.orders.push(order);
  return { ok: true, order };
}

function clearTravelLock(world, order) {
  if (order.fleetId) {
    const fleet = (world.fleets ?? []).find((f) => f.id === order.fleetId);
    if (fleet?.travelOrderId === order.id) delete fleet.travelOrderId;
  }
  if (order.legionId) {
    const legion = (world.legions ?? []).find((l) => l.id === order.legionId);
    if (legion?.travelOrderId === order.id) delete legion.travelOrderId;
  }
}

function resolveFleetOrder(world, order, journal) {
  const fleet = (world.fleets ?? []).find((f) => f.id === order.fleetId);
  if (!fleet) return false;
  const toId = order.toSystemId;
  const stance = arriveStanceForDef(
    order.type === "blockade"
      ? "intent.blockade"
      : order.type === "fortify"
        ? "intent.fortify"
        : "intent.move_fleet",
  );
  const travel = completeForceTravel(
    world,
    fleet,
    "fleet",
    toId,
    stance,
    journal,
    {
      type: order.type,
      intentId: order.intentId,
      factionId: order.factionId,
      orderId: order.id,
    },
  );
  clearTravelLock(world, order);
  if (travel.ok && stance === "blockade") {
    const sys = (world.systems ?? []).find((s) => s.id === toId);
    if (sys) sys.blockaded = true;
  }
  return travel.ok;
}

function resolveLegionOrder(world, order, journal) {
  const legion = (world.legions ?? []).find((l) => l.id === order.legionId);
  if (!legion) return false;
  const travel = completeForceTravel(
    world,
    legion,
    "legion",
    order.toSystemId,
    "idle",
    journal,
    {
      type: order.type,
      intentId: order.intentId,
      factionId: order.factionId,
      orderId: order.id,
    },
  );
  clearTravelLock(world, order);
  return travel.ok;
}

function resolveBuildOrder(world, order, journal, turn) {
  const system = (world.systems ?? []).find((s) => s.id === order.systemId);
  const planet = system?.planets?.find((p) => p.id === order.planetId);
  const building = order.payload?.building;
  if (system && planet && building) {
    const content = getContent();
    const def = content.buildings?.[order.buildingId];
    const listKey =
      order.payload?.listKey ||
      (def?.zone === "orbital" ? "orbitalBuildings" : "surfaceBuildings");
    const list = [...(planet[listKey] ?? [])];
    list.push(building);
    planet[listKey] = list;
    if (!planet.ownerFactionId) planet.ownerFactionId = order.factionId;
    pushSystemHistory(system, {
      turn,
      type: "build",
      planetId: order.planetId,
      buildingId: order.buildingId,
      description: `Построено: ${building.name || order.buildingId}`,
    });
    journal?.push?.({
      at: new Date().toISOString(),
      type: "order_build_complete",
      orderId: order.id,
      buildingId: order.buildingId,
      systemId: order.systemId,
      planetId: order.planetId,
      factionId: order.factionId,
      turn,
    });
    return true;
  }
  if (!order.buildReserved) {
    const content = getContent();
    const apMax = content.rules?.apPerTurn ?? 9;
    const result = applyPlanetAction({
      world,
      factionId: order.factionId,
      action: "build",
      systemId: order.systemId,
      planetId: order.planetId,
      buildingId: order.buildingId,
      note: order.note,
      apMax,
      persist: false,
      skipApCheck: true,
      skipIntentRecord: true,
    });
    if (!result.ok) return false;
  }
  journal?.push?.({
    at: new Date().toISOString(),
    type: "order_build_complete",
    orderId: order.id,
    buildingId: order.buildingId,
    systemId: order.systemId,
    planetId: order.planetId,
    factionId: order.factionId,
    turn,
  });
  return true;
}

function resolveResearchOrder(world, order, journal, turn) {
  if (!order.techId) return false;
  const result = researchTech(order.factionId, order.techId, {
    turn,
    world,
    intentId: order.intentId,
  });
  if (result.ok) {
    journal?.push?.({
      at: new Date().toISOString(),
      type: "order_research_complete",
      orderId: order.id,
      techId: order.techId,
      factionId: order.factionId,
      turn,
    });
  }
  return result.ok;
}

/**
 * Tick step: advance accumulating orders, resolve fixed-ETA due orders.
 * Call after economy tick, before turn++.
 */
export function resolveDueOrders(world, turn, journal) {
  const now = gameHourAtTurn(turn);
  const content = getContent();
  const orders = world.orders ?? [];
  let changed = false;

  for (const order of orders) {
    if (!ACTIVE_STATUSES.has(order.status)) continue;
    if (order.category === "instant" || order.category === "pending") continue;

    if (order.ratePerTurn != null && order.resolvesAt == null) {
      const rate = Number(order.ratePerTurn) || 0.1;
      order.progress = Math.min(1, (order.progress ?? 0) + rate);
      changed = true;
      if (order.progress >= 1) {
        const ok = resolveResearchOrder(world, order, journal, turn);
        order.status = ok ? "resolved" : "cancelled";
        order.resolvedAt = turn;
        journal?.push?.({
          at: new Date().toISOString(),
          type: ok ? "order_resolved" : "order_failed",
          orderId: order.id,
          orderType: order.type,
          factionId: order.factionId,
          turn,
        });
      }
      continue;
    }

    if (order.resolvesAt == null) continue;
    if (Number(order.resolvesAt) > now) continue;

    let ok = false;
    if (
      order.type === "move_fleet" ||
      order.type === "blockade" ||
      order.type === "fortify" ||
      order.type === "attack_system"
    ) {
      ok = order.legionId
        ? resolveLegionOrder(world, order, journal)
        : resolveFleetOrder(world, order, journal);
    } else if (order.type === "move_legion") {
      ok = resolveLegionOrder(world, order, journal);
    } else if (order.type === "build") {
      ok = resolveBuildOrder(world, order, journal, turn);
    } else {
      ok = true;
    }

    order.status = ok ? "resolved" : "cancelled";
    order.resolvedAt = turn;
    clearTravelLock(world, order);
    changed = true;
    journal?.push?.({
      at: new Date().toISOString(),
      type: ok ? "order_resolved" : "order_failed",
      orderId: order.id,
      orderType: order.type,
      factionId: order.factionId,
      turn,
    });
  }

  if (changed) {
    world.orders = orders.filter(
      (o) => o.status === "active" || o.status === "pending" || o.status === "resolved",
    );
    if (world.orders.length > 200) {
      world.orders = world.orders
        .filter((o) => ACTIVE_STATUSES.has(o.status))
        .concat(
          world.orders
            .filter((o) => o.status === "resolved")
            .slice(-50),
        );
    }
  }

  return { changed, resolved: orders.filter((o) => o.status === "resolved" && o.resolvedAt === turn) };
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

export function shouldCreateEtaOrder(def) {
  return intentCategory(def) === "eta";
}
