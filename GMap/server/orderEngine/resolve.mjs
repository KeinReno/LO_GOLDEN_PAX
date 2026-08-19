/**
 * resolveDueOrders: tick step that advances accumulating orders and
 * resolves fixed-ETA due orders (fleet/legion travel, build, research).
 * Extracted from ../orderEngine.mjs.
 */
import { getContent } from "../contentLoader.mjs";
import { completeForceTravel } from "../forceMovement.mjs";
import { applyPlanetAction, pushSystemHistory } from "../planetActions.mjs";
import { researchTech } from "../techActions.mjs";
import { gameHourAtTurn } from "./time.mjs";
import { ACTIVE_STATUSES } from "./queries.mjs";

function arriveStanceForDef(defId) {
  if (defId === "intent.blockade") return "blockade";
  if (defId === "intent.fortify") return "fortify";
  return "idle";
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
