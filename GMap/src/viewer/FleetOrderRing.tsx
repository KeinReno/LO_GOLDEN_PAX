import { useMemo } from "react";
import type { ViewerPayload } from "../state/types";
import { canAttackSystem } from "../state/combatEligibility";
import { formatHopDistance, hopDistance } from "../state/pathfinding";
import { isWithinMoveRange } from "../state/movementRange";
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
  reservedForceAp?: number;
  forceApMax?: number;
  scoutApCost: number;
  scoutForceApCost?: number;
  moveForceApCost?: number;
  attackEmpireApCost?: number;
  attackForceApCost?: number;
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
  reservedForceAp = 0,
  forceApMax = 0,
  scoutApCost,
  moveForceApCost = 1,
  attackEmpireApCost = 1,
  attackForceApCost = 1,
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
    const forceShort =
      moveForceApCost > 0 && reservedForceAp + moveForceApCost > forceApMax;
    const attackShort =
      (attackForceApCost > 0 &&
        reservedForceAp + attackForceApCost > forceApMax) ||
      (attackEmpireApCost > 0 && reservedAp + attackEmpireApCost > apMax);

    const out: ActionRingItem[] = [];

    if (ownFleet && system.id !== ownFleet.systemId) {
      const hops = hopDistance(world, ownFleet.systemId, system.id, "fleet");
      const pathOk =
        Number.isFinite(hops) &&
        hops > 0 &&
        isWithinMoveRange(world, ownFleet.systemId, system.id, "fleet");
      out.push({
        id: "move",
        label: !inVision
          ? "вне обзора"
          : forceShort
            ? "нет ОД сил"
            : pathOk
              ? `Перелёт (${formatHopDistance(hops)})`
              : Number.isFinite(hops) && hops > 0
                ? "вне радиуса"
                : "Перелёт",
        disabled: !inVision || !pathOk || forceShort,
        onSelect: () => {
          if (pathOk && inVision && !forceShort) {
            onMove(ownFleet.id, system.id, hops);
          }
        },
      });
      out.push({
        id: "attack",
        label: !inVision ? "вне обзора" : attackShort ? "нет ОД" : "Атака",
        danger: inVision && !attackShort,
        disabled: !inVision || attackShort,
        onSelect: () => {
          if (inVision && !attackShort) onAttack(ownFleet.id, system.id);
        },
      });
      out.push({
        id: "blockade",
        label: !inVision
          ? "вне обзора"
          : forceShort
            ? "нет ОД сил"
            : "Блокада",
        disabled: !inVision || !pathOk || forceShort,
        onSelect: () => {
          if (inVision && !forceShort) {
            onBlockade(ownFleet.id, system.id, pathOk ? hops : undefined);
          }
        },
      });
    } else if (ownFleet && system.id === ownFleet.systemId) {
      const attackHere = canAttackSystem(world, factionId, system.id);
      out.push({
        id: "attack",
        label: !attackHere.eligible
          ? "Нет целей для атаки"
          : attackShort
            ? "нет ОД"
            : attackHere.label,
        danger: attackHere.eligible && !attackShort,
        disabled: !attackHere.eligible || attackShort,
        onSelect: () => {
          if (attackHere.eligible && !attackShort) {
            onAttack(ownFleet.id, system.id);
          }
        },
      });
      out.push({
        id: "fortify",
        label: forceShort ? "Оборона · нет ОД сил" : "Оборона",
        disabled: forceShort,
        onSelect: () => {
          if (!forceShort) onFortify(ownFleet.id, system.id);
        },
      });
      out.push({
        id: "blockade",
        label: forceShort ? "Блокада · нет ОД сил" : "Блокада",
        disabled: forceShort,
        onSelect: () => {
          if (!forceShort) onBlockade(ownFleet.id, system.id, undefined);
        },
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

    const scoutBlocked =
      scoutApCost > 0 && reservedAp + scoutApCost > apMax;
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
    reservedForceAp,
    forceApMax,
    scoutApCost,
    moveForceApCost,
    attackEmpireApCost,
    attackForceApCost,
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
