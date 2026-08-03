import { useMemo } from "react";
import type { ViewerPayload } from "../state/types";
import { formatHopTurns, hopDistance } from "../state/pathfinding";
import { ActionRing, type ActionRingItem } from "../ui/ActionRing";

export type FleetOrderRingState = {
  x: number;
  y: number;
  fleetId: string | null;
  systemId: string;
};

type Props = {
  ring: FleetOrderRingState | null;
  payload: ViewerPayload;
  reservedAp: number;
  apMax: number;
  scoutApCost: number;
  onClose: () => void;
  onMove: (
    fleetId: string,
    toSystemId: string,
    hops: number,
  ) => void | Promise<void>;
  onAttack: (fleetId: string, toSystemId: string) => void | Promise<void>;
  onBlockade: (
    fleetId: string,
    toSystemId: string,
    hops: number | undefined,
  ) => void | Promise<void>;
  onFortify: (fleetId: string, systemId: string) => void | Promise<void>;
  onCancelRoute: (fleetId: string) => void | Promise<void>;
  onOpenSystem: (systemId: string) => void | Promise<void>;
  onClearStance: (fleetId: string) => void | Promise<void>;
  onScout: (systemId: string) => void | Promise<void>;
  onClaim: (systemId: string, fleetId: string | null) => void | Promise<void>;
};

/** Radial fleet orders at map pointer — action-at-source, no orders-room hop. */
export function FleetOrderRing({
  ring,
  payload,
  reservedAp,
  apMax,
  scoutApCost,
  onClose,
  onMove,
  onAttack,
  onBlockade,
  onFortify,
  onCancelRoute,
  onOpenSystem,
  onClearStance,
  onScout,
  onClaim,
}: Props) {
  const items = useMemo((): ActionRingItem[] => {
    if (!ring) return [];
    const world = payload.world;
    const factionId = payload.factionId;
    const system = world.systems.find((s) => s.id === ring.systemId);
    if (!system) return [];

    const fleet = ring.fleetId
      ? world.fleets.find((f) => f.id === ring.fleetId)
      : null;
    const ownFleet =
      fleet && fleet.factionId === factionId ? fleet : null;

    const visibleSet = new Set(payload.visibleSystemIds);
    const inVision = visibleSet.has(system.id);

    const out: ActionRingItem[] = [];

    if (ownFleet && system.id !== ownFleet.systemId) {
      const hops = hopDistance(world, ownFleet.systemId, system.id, "fleet");
      const pathOk = Number.isFinite(hops) && hops > 0;
      out.push({
        id: "move",
        label: !inVision
          ? "вне обзора"
          : pathOk
            ? `Перелёт (${formatHopTurns(hops)})`
            : "Перелёт",
        disabled: !inVision || !pathOk,
        onSelect: () => {
          if (pathOk && inVision) onMove(ownFleet.id, system.id, hops);
        },
      });
      out.push({
        id: "attack",
        label: inVision ? "Атака" : "вне обзора",
        danger: inVision,
        disabled: !inVision,
        onSelect: () => {
          if (inVision) onAttack(ownFleet.id, system.id);
        },
      });
      out.push({
        id: "blockade",
        label: inVision ? "Блокада" : "вне обзора",
        disabled: !inVision || !pathOk,
        onSelect: () => {
          if (inVision) onBlockade(ownFleet.id, system.id, pathOk ? hops : undefined);
        },
      });
    } else if (ownFleet && system.id === ownFleet.systemId) {
      out.push({
        id: "fortify",
        label: "Оборона",
        onSelect: () => onFortify(ownFleet.id, system.id),
      });
      out.push({
        id: "blockade",
        label: "Блокада",
        onSelect: () => onBlockade(ownFleet.id, system.id, undefined),
      });
      if ((ownFleet.route?.length ?? 0) > 0) {
        out.push({
          id: "cancel-route",
          label: "Отменить маршрут",
          onSelect: () => onCancelRoute(ownFleet.id),
        });
      }
      if (
        ownFleet.stance === "move" ||
        ownFleet.stance === "blockade" ||
        ownFleet.stance === "fortify"
      ) {
        out.push({
          id: "clear-stance",
          label: "Снять режим",
          onSelect: () => onClearStance(ownFleet.id),
        });
      }
      out.push({
        id: "open-system",
        label: "В систему",
        onSelect: () => onOpenSystem(system.id),
      });
    }

    const scoutBlocked = reservedAp + scoutApCost > apMax;
    out.push({
      id: "scout",
      label: scoutBlocked ? "Разведка" : "Наблюдение",
      disabled: scoutBlocked,
      onSelect: () => onScout(system.id),
    });

    if (system.ownerFactionId !== factionId) {
      out.push({
        id: "claim",
        label: inVision ? "Захват" : "вне обзора",
        disabled: !inVision,
        onSelect: () => {
          if (inVision) onClaim(system.id, ownFleet?.id ?? null);
        },
      });
    }

    return out;
  }, [
    ring,
    payload,
    reservedAp,
    apMax,
    scoutApCost,
    onMove,
    onAttack,
    onBlockade,
    onFortify,
    onCancelRoute,
    onOpenSystem,
    onClearStance,
    onScout,
    onClaim,
  ]);

  if (!ring) return null;

  return (
    <ActionRing
      open
      x={ring.x}
      y={ring.y}
      items={items}
      onClose={onClose}
    />
  );
}

export type HoldProgressState = {
  x: number;
  y: number;
  progress: number;
};

/** Whether RMB / long-press on this pick should open the fleet order ring. */
export function resolveFleetOrderRing(
  pick: {
    systemId: string | null;
    fleetId: string | null;
    screenX: number;
    screenY: number;
    /** True when pick.fleetId came from a fleet glyph hit (not selectedFleetId fallback). */
    fromFleetHit?: boolean;
  },
  payload: ViewerPayload,
  selectedFleetId: string | null,
): FleetOrderRingState | null {
  const factionId = payload.factionId;
  let fleetId: string | null = null;

  if (pick.fleetId) {
    const f = payload.world.fleets.find((x) => x.id === pick.fleetId);
    if (f?.factionId === factionId) fleetId = f.id;
  }
  if (!fleetId && selectedFleetId) {
    const f = payload.world.fleets.find((x) => x.id === selectedFleetId);
    if (f?.factionId === factionId) fleetId = f.id;
  }

  const fleet = fleetId
    ? payload.world.fleets.find((f) => f.id === fleetId)
    : null;

  let systemId = pick.systemId;
  if (fleet && pick.fleetId && fleet.id === pick.fleetId) {
    if (!systemId) {
      systemId = fleet.systemId;
    } else if (pick.fromFleetHit && systemId !== fleet.systemId) {
      systemId = fleet.systemId;
    }
  }

  if (!systemId) return null;
  const system = payload.world.systems.find((s) => s.id === systemId);
  if (!system) return null;

  if (fleet && system.id === fleet.systemId) {
    return {
      x: pick.screenX,
      y: pick.screenY,
      fleetId,
      systemId,
    };
  }

  const wouldOfferAttack =
    !!fleet && system.id !== fleet.systemId;
  const wouldOfferClaim = system.ownerFactionId !== factionId;
  const longPressWithFleet = !!fleetId;

  if (!wouldOfferAttack && !wouldOfferClaim && !longPressWithFleet) {
    return null;
  }

  return {
    x: pick.screenX,
    y: pick.screenY,
    fleetId,
    systemId,
  };
}
