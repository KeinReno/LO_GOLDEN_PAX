import { useMemo } from "react";
import type { ViewerPayload } from "../state/types";
import { boardableFleets } from "../state/boardForce";
import { canAttackSystem } from "../state/combatEligibility";
import { formatHopDistance, hopDistance } from "../state/pathfinding";
import { isWithinMoveRange } from "../state/movementRange";
import { ActionRing, type ActionRingItem } from "../ui/ActionRing";

export type FleetOrderRingState = {
  x: number;
  y: number;
  fleetId: string | null;
  legionId: string | null;
  systemId: string;
};

type UnitKind = "fleet" | "legion";

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
  legionMoveForceApCost?: number;
  attackEmpireApCost?: number;
  attackForceApCost?: number;
  onClose: () => void;
  onMove: (
    kind: UnitKind,
    unitId: string,
    toSystemId: string,
    hops: number,
  ) => void | Promise<void>;
  onAttack: (
    kind: UnitKind,
    unitId: string,
    toSystemId: string,
  ) => void | Promise<void>;
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
  /** Owned legion in the same system as a non-owned fleet → POST /api/forces/board. */
  onBoard?: (legionId: string, targetFleetId: string) => void | Promise<void>;
};

/** Radial fleet/legion orders at map pointer — action-at-source, no orders-room hop.
 *  Board (абордаж) lives here when an owned legion shares a system with a non-owned fleet.
 */
export function FleetOrderRing({
  ring,
  payload,
  reservedAp,
  apMax,
  reservedForceAp = 0,
  forceApMax = 0,
  scoutApCost,
  moveForceApCost = 1,
  legionMoveForceApCost = 1,
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
  onBoard,
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
    const legion = ring.legionId
      ? world.legions.find((l) => l.id === ring.legionId)
      : null;
    const ownFleet =
      fleet && fleet.factionId === factionId ? fleet : null;
    const ownLegion =
      legion && legion.factionId === factionId ? legion : null;
    const unitKind: UnitKind | null = ownFleet
      ? "fleet"
      : ownLegion
        ? "legion"
        : null;
    const unit = ownFleet ?? ownLegion;
    const travelMode: UnitKind = unitKind ?? "fleet";
    const moveCost =
      unitKind === "legion" ? legionMoveForceApCost : moveForceApCost;

    const visibleSet = new Set(payload.visibleSystemIds);
    const inVision = visibleSet.has(system.id);
    const forceShort = moveCost > 0 && reservedForceAp + moveCost > forceApMax;
    const attackShort =
      (attackForceApCost > 0 &&
        reservedForceAp + attackForceApCost > forceApMax) ||
      (attackEmpireApCost > 0 && reservedAp + attackEmpireApCost > apMax);

    const out: ActionRingItem[] = [];

    if (unit && unitKind && system.id !== unit.systemId) {
      const hops = hopDistance(world, unit.systemId, system.id, travelMode);
      const pathOk =
        Number.isFinite(hops) &&
        hops > 0 &&
        isWithinMoveRange(world, unit.systemId, system.id, travelMode);
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
                : unitKind === "legion"
                  ? "Марш"
                  : "Перелёт",
        disabled: !inVision || !pathOk || forceShort,
        onSelect: () => {
          if (pathOk && inVision && !forceShort) {
            onMove(unitKind, unit.id, system.id, hops);
          }
        },
      });
      out.push({
        id: "attack",
        label: !inVision ? "вне обзора" : attackShort ? "нет ОД" : "Атака",
        danger: inVision && !attackShort,
        disabled: !inVision || attackShort,
        onSelect: () => {
          if (inVision && !attackShort) onAttack(unitKind, unit.id, system.id);
        },
      });
      if (unitKind === "fleet") {
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
              onBlockade(unit.id, system.id, pathOk ? hops : undefined);
            }
          },
        });
      }
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
            onAttack("fleet", ownFleet.id, system.id);
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
    } else if (ownLegion && system.id === ownLegion.systemId) {
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
            onAttack("legion", ownLegion.id, system.id);
          }
        },
      });
      out.push({
        id: "open-system",
        label: "В систему",
        onSelect: () => onOpenSystem(system.id),
      });
    }

    const fleetActingHere = !!(ownFleet && system.id === ownFleet.systemId);
    const boardLegion =
      ownLegion && system.id === ownLegion.systemId
        ? ownLegion
        : fleetActingHere
          ? null
          : (world.legions ?? []).find(
              (l) => l.systemId === system.id && l.factionId === factionId,
            ) ?? null;
    if (onBoard && boardLegion) {
      const targets = boardableFleets(world, factionId, system.id);
      const many = targets.length > 1;
      for (const tf of targets.slice(0, 4)) {
        out.push({
          id: `board-${tf.id}`,
          label: many ? `Абордаж · ${tf.name}` : "Абордаж",
          danger: true,
          onSelect: () => onBoard(boardLegion.id, tf.id),
        });
      }
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
    legionMoveForceApCost,
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
    onBoard,
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

/** Whether RMB / long-press on this pick should open the unit order ring. */
export function resolveFleetOrderRing(
  pick: {
    systemId: string | null;
    fleetId: string | null;
    legionId: string | null;
    screenX: number;
    screenY: number;
    /** True when pick.fleetId came from a fleet glyph hit (not selectedFleetId fallback). */
    fromFleetHit?: boolean;
    /** True when pick.legionId came from a legion glyph hit (not selectedLegionId fallback). */
    fromLegionHit?: boolean;
  },
  payload: ViewerPayload,
  selectedFleetId: string | null,
  selectedLegionId: string | null = null,
): FleetOrderRingState | null {
  const factionId = payload.factionId;
  let fleetId: string | null = null;
  let legionId: string | null = null;

  if (pick.fleetId) {
    const f = payload.world.fleets.find((x) => x.id === pick.fleetId);
    if (f?.factionId === factionId) fleetId = f.id;
  }
  if (!fleetId && selectedFleetId) {
    const f = payload.world.fleets.find((x) => x.id === selectedFleetId);
    if (f?.factionId === factionId) fleetId = f.id;
  }

  if (pick.legionId) {
    const l = payload.world.legions.find((x) => x.id === pick.legionId);
    if (l?.factionId === factionId) legionId = l.id;
  }
  if (!legionId && selectedLegionId) {
    const l = payload.world.legions.find((x) => x.id === selectedLegionId);
    if (l?.factionId === factionId) legionId = l.id;
  }

  // Glyph hit on own unit — don't mix with the other selection fallback.
  // Enemy fleet hits keep a selected own legion so Board can show in-system.
  if (pick.fromFleetHit) {
    const hitFleet = pick.fleetId
      ? payload.world.fleets.find((x) => x.id === pick.fleetId)
      : null;
    if (!hitFleet || hitFleet.factionId === factionId) legionId = null;
  }
  if (pick.fromLegionHit) fleetId = null;

  const fleet = fleetId
    ? payload.world.fleets.find((f) => f.id === fleetId)
    : null;
  const legion = legionId
    ? payload.world.legions.find((l) => l.id === legionId)
    : null;
  const unit = fleet ?? legion;

  let systemId = pick.systemId;
  if (unit && ((pick.fleetId && fleet?.id === pick.fleetId) || (pick.legionId && legion?.id === pick.legionId))) {
    if (!systemId) {
      systemId = unit.systemId;
    } else if (
      (pick.fromFleetHit || pick.fromLegionHit) &&
      systemId !== unit.systemId
    ) {
      systemId = unit.systemId;
    }
  }
  if (!systemId && pick.fleetId) {
    systemId =
      payload.world.fleets.find((f) => f.id === pick.fleetId)?.systemId ?? null;
  }

  if (!systemId) return null;
  const system = payload.world.systems.find((s) => s.id === systemId);
  if (!system) return null;

  if (unit && system.id === unit.systemId) {
    return {
      x: pick.screenX,
      y: pick.screenY,
      fleetId,
      legionId,
      systemId,
    };
  }

  const wouldOfferAttack = !!unit && system.id !== unit.systemId;
  const wouldOfferClaim = system.ownerFactionId !== factionId;
  const longPressWithUnit = !!fleetId || !!legionId;

  if (!wouldOfferAttack && !wouldOfferClaim && !longPressWithUnit) {
    return null;
  }

  return {
    x: pick.screenX,
    y: pick.screenY,
    fleetId,
    legionId,
    systemId,
  };
}
