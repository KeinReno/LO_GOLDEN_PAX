import type { MapUnitDropPayload, UnitDropIntent } from "../../../renderers/MapCanvas";
import type { OrderType, WorldState } from "../../../state/types";
import type { ContactBattlePreview } from "../../../state/contactBattlePreview";

export function orderTypeFromDropIntent(
  kind: "fleet" | "legion",
  intent: UnitDropIntent = "move",
): OrderType {
  if (intent === "attack") return "attack_system";
  if (intent === "claim") return "claim_system";
  return kind === "fleet" ? "move_fleet" : "move_legion";
}

export function checkOrderApBudget(p: {
  reservedAp: number;
  apMax: number;
  reservedForceAp: number;
  forceApMax: number;
  apCost: number;
  forceCost: number;
}): { ok: true } | { ok: false; message: string } {
  const {
    reservedAp,
    apMax,
    reservedForceAp,
    forceApMax,
    apCost,
    forceCost,
  } = p;
  if (apCost > 0 && reservedAp + apCost > apMax) {
    return {
      ok: false,
      message: `Недостаточно ОД: занято ${reservedAp}/${apMax}, нужно ещё ${apCost} ОД`,
    };
  }
  if (forceCost > 0 && reservedForceAp + forceCost > forceApMax) {
    return {
      ok: false,
      message: `Недостаточно ОД сил: занято ${reservedForceAp}/${forceApMax}, нужно ещё ${forceCost}`,
    };
  }
  return { ok: true };
}

export type ResolveUnitDropDeps = {
  canAttackHostileUnit: (
    world: WorldState,
    factionId: string,
    targetFac: string,
    systemId: string,
  ) => boolean;
  canAttackUnitAtSystem: (
    world: WorldState,
    factionId: string,
    systemId: string,
  ) => boolean;
  isWithinMoveRange: (
    world: WorldState,
    fromId: string,
    toId: string,
    mode: "fleet" | "legion",
  ) => boolean;
  buildContactBattlePreview: (
    world: WorldState,
    factionId: string,
    drop: MapUnitDropPayload,
  ) => ContactBattlePreview | null;
};

export type ResolveUnitDropResult =
  | { action: "reject"; message: string }
  | {
      action: "contact";
      preview: ContactBattlePreview;
      orderType: OrderType;
    }
  | {
      action: "submit";
      orderType: OrderType;
      fromSystemId: string | null | undefined;
    };

export function resolveUnitDrop(
  input: {
    world: WorldState;
    factionId: string;
    visibleSystemIds: string[];
    drop: MapUnitDropPayload;
  },
  deps: ResolveUnitDropDeps,
): ResolveUnitDropResult {
  const { world, factionId, visibleSystemIds, drop } = input;
  const intent = drop.intent ?? "move";
  const gated = intent === "move" || intent === "attack" || intent === "claim";
  if (gated && !visibleSystemIds.includes(drop.toSystemId)) {
    return { action: "reject", message: "Цель вне радиуса обзора" };
  }

  if (intent === "attack") {
    let targetFac = drop.targetFactionId;
    if (!targetFac && drop.targetUnitId && drop.targetUnitKind) {
      targetFac =
        drop.targetUnitKind === "fleet"
          ? world.fleets.find((f) => f.id === drop.targetUnitId)?.factionId
          : world.legions.find((l) => l.id === drop.targetUnitId)?.factionId;
    }
    const attackOk =
      (targetFac &&
        deps.canAttackHostileUnit(
          world,
          factionId,
          targetFac,
          drop.toSystemId,
        )) ||
      deps.canAttackUnitAtSystem(world, factionId, drop.toSystemId);
    if (!attackOk) {
      return {
        action: "reject",
        message: "Нельзя атаковать: нет войны или допустимой цели",
      };
    }
  }

  const orderType = orderTypeFromDropIntent(drop.kind, intent);
  const fromSystemId =
    drop.kind === "fleet"
      ? world.fleets.find((f) => f.id === drop.unitId)?.systemId
      : world.legions.find((l) => l.id === drop.unitId)?.systemId;
  const travelMode = drop.kind === "fleet" ? "fleet" : "legion";

  if (
    intent === "move" &&
    fromSystemId &&
    fromSystemId !== drop.toSystemId &&
    !deps.isWithinMoveRange(world, fromSystemId, drop.toSystemId, travelMode)
  ) {
    return { action: "reject", message: "Цель вне радиуса перемещения" };
  }

  const coLocated =
    !!fromSystemId &&
    fromSystemId === drop.toSystemId &&
    (drop.hops ?? 0) === 0;

  if (
    intent === "attack" &&
    drop.targetUnitId &&
    drop.targetUnitKind &&
    coLocated
  ) {
    const preview = deps.buildContactBattlePreview(world, factionId, drop);
    if (preview) {
      return { action: "contact", preview, orderType };
    }
  }

  return { action: "submit", orderType, fromSystemId };
}
