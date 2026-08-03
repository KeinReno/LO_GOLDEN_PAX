import { useMemo } from "react";
import { ActionRing } from "../ui/ActionRing";
import {
  COMBAT_STANCES,
  COMBAT_STANCE_LABELS,
  type CombatStanceId,
} from "./PlayerEngagementPanel";

export type EngagementStanceRingProps = {
  open: boolean;
  x: number;
  y: number;
  engagementId: string;
  currentStance?: string;
  locked?: boolean;
  busy?: boolean;
  onClose: () => void;
  onPickStance: (stanceId: CombatStanceId) => void;
};

/** Radial combat-stance picker for open engagements (map alerts / cards). */
export function EngagementStanceRing({
  open,
  x,
  y,
  engagementId: _engagementId,
  currentStance,
  locked = false,
  busy = false,
  onClose,
  onPickStance,
}: EngagementStanceRingProps) {
  const active = (COMBAT_STANCES.includes(currentStance as CombatStanceId)
    ? currentStance
    : "hold") as CombatStanceId;

  const items = useMemo(
    () =>
      COMBAT_STANCES.map((id) => ({
        id,
        label: COMBAT_STANCE_LABELS[id],
        disabled: locked || busy,
        onSelect: () => {
          if (locked || busy) return;
          onPickStance(id);
        },
      })),
    [locked, busy, onPickStance],
  );

  if (!open || locked) return null;

  return (
    <ActionRing
      open={open}
      x={x}
      y={y}
      onClose={onClose}
      items={items.map((item) => {
        const id = item.id as CombatStanceId;
        return {
          ...item,
          label: id === active ? `${item.label} ·` : item.label,
          danger: id === "retreat",
        };
      })}
      radius={68}
    />
  );
}
