/**
 * createOrderFromIntent: turn a submitted ETA intent into a PlayerOrder.
 * Extracted from ../orderEngine.mjs.
 */
import { getContent } from "../contentLoader.mjs";
import { intentApCosts } from "../apBudget.mjs";
import { applyPlanetAction } from "../planetActions.mjs";
import {
  gameHourAtTurn,
  intentCategory,
  resolveBuildHours,
  computeFleetMoveEta,
  computeLegionMoveEta,
} from "./time.mjs";

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
