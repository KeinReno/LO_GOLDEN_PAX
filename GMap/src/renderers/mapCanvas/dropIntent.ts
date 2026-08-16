import type { StarSystem, WorldState } from "../../state/types";
import { systemHasHostileInvaders } from "../../state/combatEligibility";
import type { UnitDropIntent } from "./types";

/**
 * Gesture intent from target ownership. Drives one gesture → one order:
 * own / co-owned system → move, enemy or contested → attack, unowned → claim.
 */
export function resolveDropIntent(
  target: StarSystem,
  playerFactionId: string | null,
  world?: WorldState,
): UnitDropIntent {
  if (!playerFactionId) return "move";
  if (target.contested) return "attack";
  const owner = target.ownerFactionId;
  if (!owner) return "claim";
  if (owner === playerFactionId) {
    if (
      world &&
      systemHasHostileInvaders(world, playerFactionId, target.id)
    ) {
      return "attack";
    }
    return "move";
  }
  const co = target.coOwnerFactionIds ?? [];
  if (co.includes(playerFactionId)) return "move";
  return "attack";
}
