import { useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Rocket, Swords, Shield, Heart } from "lucide-react";
import type { ShipGroup } from "../../state/types";
import { GESTURE } from "../../ui/gestureMap";
import { CometCard } from "../quests/CometCard";
import {
  TIER_COLORS,
  type CatalogShip,
  type DropZoneId,
} from "./constants";
import { hitCardIndex, hitDropZone } from "./useDeckGestures";

export type UnitCardModel = {
  type: string;
  count: number;
  defId?: string;
  hp?: number;
  filledSlots?: Record<string, string>;
  xp?: number;
  level?: number;
};

type UnitCardProps = {
  group: UnitCardModel | ShipGroup;
  catalogItem: CatalogShip | null;
  isSelected: boolean;
  isDragging: boolean;
  index: number;
  /** When false, hide module slot pips (infantry etc.). */
  showSlots?: boolean;
  onTap: () => void;
  onDragStart: () => void;
  onDragMove?: (point: { x: number; y: number }) => void;
  onDragEnd: (result: {
    zone: DropZoneId | null;
    mergeIndex: number | null;
  }) => void;
  onLongPress: () => void;
  isHighlighted?: boolean;
};

export function UnitCard({
  group,
  catalogItem,
  isSelected,
  isDragging,
  index,
  showSlots = true,
  onTap,
  onDragStart,
  onDragMove,
  onDragEnd,
  onLongPress,
  isHighlighted,
}: UnitCardProps) {
  const reduce = useReducedMotion();
  const longTimer = useRef<number | null>(null);
  const longFired = useRef(false);
  const dragActive = useRef(false);

  const tier = Math.min(5, Math.max(1, catalogItem?.tier ?? 1));
  const level = Math.min(5, Math.max(0, group.level ?? 0));
  const maxHp = catalogItem?.stats?.hp ?? 100;
  const hpPercent = group.hp != null ? Math.round((group.hp / maxHp) * 100) : 100;
  const slots = catalogItem?.slots ?? [];
  const slotTotal = slots.length;
  const name = catalogItem?.name ?? group.type;
  const role = catalogItem?.roles?.[0] ?? group.type;

  const clearLong = () => {
    if (longTimer.current != null) {
      window.clearTimeout(longTimer.current);
      longTimer.current = null;
    }
  };

  return (
    <CometCard
      className="forces-unit-comet"
      rotateDepth={12}
      disabled={reduce || isDragging}
    >
      <motion.div
        className={[
          "forces-unit-card",
          isSelected ? "is-selected" : "",
          isDragging ? "is-dragging" : "",
          isHighlighted ? "is-tech-highlight" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ borderColor: TIER_COLORS[tier] }}
        data-unit-card-index={index}
        role="button"
        tabIndex={0}
        aria-pressed={isSelected}
        aria-label={`${name} ×${group.count}`}
        drag={!reduce}
        dragSnapToOrigin
        dragElastic={0.12}
        onPointerDown={() => {
          longFired.current = false;
          dragActive.current = false;
          clearLong();
          longTimer.current = window.setTimeout(() => {
            longFired.current = true;
            onLongPress();
          }, GESTURE.longPressMs);
        }}
        onPointerUp={clearLong}
        onPointerCancel={clearLong}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onTap();
          }
        }}
        onDragStart={() => {
          clearLong();
          dragActive.current = true;
          onDragStart();
        }}
        onDrag={(_e, info) => {
          onDragMove?.(info.point);
        }}
        onDragEnd={(_e, info) => {
          clearLong();
          const { x, y } = info.point;
          const zone = hitDropZone(x, y);
          const mergeIndex = zone ? null : hitCardIndex(x, y, index);
          onDragEnd({ zone, mergeIndex });
          dragActive.current = false;
        }}
        onTap={() => {
          if (longFired.current || dragActive.current) return;
          onTap();
        }}
        whileHover={reduce || isDragging ? undefined : { y: -6, scale: 1.04 }}
        whileDrag={reduce ? undefined : { scale: 1.08, zIndex: 50 }}
        initial={reduce ? false : { opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          delay: reduce ? 0 : index * 0.04,
          type: "spring",
          stiffness: 300,
          damping: 26,
        }}
      >
        <div className="forces-unit-card-header">
          <Rocket size={20} strokeWidth={1.6} aria-hidden />
          <span className="forces-unit-role">{role}</span>
        </div>
        <div className="forces-unit-name">{name}</div>
        <div className="forces-unit-count">×{group.count}</div>
        <div
          className="forces-unit-vet"
          aria-label={`Ветераны ${level} из 5`}
          title={`Veterancy ${level}/5 · XP ${group.xp ?? 0}`}
        >
          {"★".repeat(level)}
          {"☆".repeat(5 - level)}
        </div>
        <div className="forces-unit-stats">
          <span title="Урон">
            <Swords size={12} aria-hidden /> {catalogItem?.stats?.damage ?? "—"}
          </span>
          <span title="Броня">
            <Shield size={12} aria-hidden />{" "}
            {catalogItem?.stats?.armor ?? catalogItem?.stats?.defense ?? "—"}
          </span>
          <span title="Прочность">
            <Heart size={12} aria-hidden /> {hpPercent}%
          </span>
        </div>
        {showSlots && slotTotal > 0 && (
          <div className="forces-unit-slots" aria-label="Слоты оснащения">
            {slots.map((s) => (
              <span
                key={s.role}
                className={group.filledSlots?.[s.role] ? "filled" : ""}
                title={
                  group.filledSlots?.[s.role]
                    ? `${s.role}: ${group.filledSlots[s.role]}`
                    : s.role
                }
              />
            ))}
          </div>
        )}
      </motion.div>
    </CometCard>
  );
}
