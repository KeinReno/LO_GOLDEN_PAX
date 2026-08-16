import type { ContactBattlePreview } from "../../../state/contactBattlePreview";
import type { CombatStanceId } from "../../PlayerEngagementPanel";

export type ContactStrike = {
  kind: "fleet" | "legion";
  unitId: string;
  toSystemId: string;
  hops: number | undefined;
  contact: {
    contactMode: "auto" | "card";
    targetUnitKind: "fleet" | "legion";
    targetUnitId: string;
    targetFactionId?: string;
  };
};

export type ContactMode = "auto" | "card";

/** Build the attack_system contact payload from a chooser preview. */
export function contactStrikeFromPreview(
  preview: ContactBattlePreview,
  mode: ContactMode,
): ContactStrike | null {
  const d = preview.drop;
  if (!d.targetUnitKind || !d.targetUnitId) return null;
  return {
    kind: d.kind,
    unitId: d.unitId,
    toSystemId: d.toSystemId,
    hops: d.hops,
    contact: {
      contactMode: mode,
      targetUnitKind: d.targetUnitKind,
      targetUnitId: d.targetUnitId,
      targetFactionId: d.targetFactionId,
    },
  };
}

export function canOpenStanceRing(
  eng:
    | {
        sides: { factionId: string; locked?: boolean }[];
      }
    | undefined
    | null,
  factionId: string,
): boolean {
  if (!eng) return false;
  const mySide = eng.sides.find((s) => s.factionId === factionId);
  return !!mySide && !mySide.locked;
}

export function myEngagementSide(
  eng:
    | {
        sides: {
          factionId: string;
          locked?: boolean;
          stance?: CombatStanceId | string;
        }[];
      }
    | undefined
    | null,
  factionId: string,
) {
  return eng?.sides.find((s) => s.factionId === factionId) ?? null;
}
