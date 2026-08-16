import { useCallback } from "react";
import {
  canAttackHostileUnit,
  canAttackUnitAtSystem,
} from "../../../state/combatEligibility";
import { isWithinMoveRange } from "../../../state/movementRange";
import { buildContactBattlePreview } from "../../../state/contactBattlePreview";
import type { MapUnitDropPayload } from "../../../renderers/MapCanvas";
import type { WorldState } from "../../../state/types";
import {
  checkOrderApBudget,
  orderTypeFromDropIntent,
  resolveUnitDrop,
  type ResolveUnitDropResult,
} from "./orderDropResolve";

export {
  checkOrderApBudget,
  orderTypeFromDropIntent,
  resolveUnitDrop,
};
export type { ResolveUnitDropResult };

const liveDeps = {
  canAttackHostileUnit,
  canAttackUnitAtSystem,
  isWithinMoveRange,
  buildContactBattlePreview,
};

export function resolveViewerUnitDrop(
  world: WorldState,
  factionId: string,
  visibleSystemIds: string[],
  drop: MapUnitDropPayload,
): ResolveUnitDropResult {
  return resolveUnitDrop(
    { world, factionId, visibleSystemIds, drop },
    liveDeps,
  );
}

/** React seam for drop validation. Fetch/selection stay in ViewerPage until later slices. */
export function useViewerOrders() {
  const resolveDrop = useCallback(
    (
      world: WorldState,
      factionId: string,
      visibleSystemIds: string[],
      drop: MapUnitDropPayload,
    ) => resolveViewerUnitDrop(world, factionId, visibleSystemIds, drop),
    [],
  );

  return {
    resolveDrop,
    checkOrderApBudget,
    orderTypeFromDropIntent,
  };
}
