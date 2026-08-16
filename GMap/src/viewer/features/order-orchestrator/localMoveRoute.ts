import type { OrderType, WorldState } from "../../../state/types";

type RangeFn = (
  world: WorldState,
  fromId: string | null | undefined,
  toId: string | null | undefined,
  mode: "fleet" | "legion",
) => boolean;

export function applyLocalMoveRoute(
  world: WorldState,
  kind: "fleet" | "legion",
  unitId: string,
  toSystemId: string,
  arriveStance: "idle" | "blockade" | "fortify" = "idle",
  inRange: RangeFn,
): WorldState {
  const fromId =
    kind === "fleet"
      ? world.fleets.find((f) => f.id === unitId)?.systemId
      : world.legions.find((l) => l.id === unitId)?.systemId;
  const mode = kind === "fleet" ? "fleet" : "legion";
  if (!fromId) return world;
  if (fromId === toSystemId) {
    if (kind === "fleet") {
      return {
        ...world,
        fleets: world.fleets.map((f) =>
          f.id === unitId
            ? {
                ...f,
                route: [],
                stance: arriveStance,
                pendingArrival: undefined,
              }
            : f,
        ),
      };
    }
    return {
      ...world,
      legions: world.legions.map((l) =>
        l.id === unitId ? { ...l, route: [] } : l,
      ),
    };
  }
  if (!inRange(world, fromId, toSystemId, mode)) return world;
  if (kind === "fleet") {
    return {
      ...world,
      fleets: world.fleets.map((f) =>
        f.id === unitId
          ? {
              ...f,
              lastSystemId: fromId,
              systemId: toSystemId,
              route: [],
              stance: arriveStance,
              pendingArrival: undefined,
            }
          : f,
      ),
    };
  }
  return {
    ...world,
    legions: world.legions.map((l) =>
      l.id === unitId
        ? {
            ...l,
            lastSystemId: fromId,
            systemId: toSystemId,
            route: [],
            status: "idle" as const,
          }
        : l,
    ),
  };
}

export function applyLocalFleetOrder(
  world: WorldState,
  unitId: string,
  toSystemId: string,
  orderType: OrderType,
  fromSystemId: string | undefined,
  inRange: RangeFn,
): WorldState {
  if (orderType === "move_fleet" && fromSystemId) {
    return applyLocalMoveRoute(
      world,
      "fleet",
      unitId,
      toSystemId,
      "idle",
      inRange,
    );
  }
  if (orderType === "blockade") {
    if (fromSystemId && fromSystemId !== toSystemId) {
      return applyLocalMoveRoute(
        world,
        "fleet",
        unitId,
        toSystemId,
        "blockade",
        inRange,
      );
    }
    return {
      ...world,
      fleets: world.fleets.map((f) =>
        f.id === unitId
          ? {
              ...f,
              route: [],
              stance: "blockade" as const,
              pendingArrival: undefined,
            }
          : f,
      ),
      systems: world.systems.map((s) =>
        s.id === toSystemId ? { ...s, blockaded: true } : s,
      ),
    };
  }
  if (orderType === "fortify") {
    if (fromSystemId && fromSystemId !== toSystemId) {
      return applyLocalMoveRoute(
        world,
        "fleet",
        unitId,
        toSystemId,
        "fortify",
        inRange,
      );
    }
    return {
      ...world,
      fleets: world.fleets.map((f) =>
        f.id === unitId
          ? {
              ...f,
              route: [],
              stance: "fortify" as const,
              pendingArrival: undefined,
            }
          : f,
      ),
    };
  }
  return world;
}

export function pendingFleetRouteOrderId(
  world: WorldState,
  fleetId: string,
): string | null {
  return (
    world.orders.find(
      (o) =>
        o.fleetId === fleetId &&
        o.status === "pending" &&
        (o.type === "move_fleet" || o.type === "blockade"),
    )?.id ?? null
  );
}

export function worldWithClearedFleetRoute(
  world: WorldState,
  fleetId: string,
): WorldState {
  return {
    ...world,
    fleets: world.fleets.map((f) =>
      f.id === fleetId ? { ...f, route: [] } : f,
    ),
  };
}

export function worldWithIdleFleetStance(
  world: WorldState,
  fleetId: string,
): WorldState {
  return {
    ...world,
    fleets: world.fleets.map((f) =>
      f.id === fleetId
        ? {
            ...f,
            stance: "idle" as const,
            route: [],
            pendingArrival: undefined,
          }
        : f,
    ),
  };
}
