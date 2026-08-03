import { useDrag } from "@use-gesture/react";
import {
  motion,
  useMotionValue,
  useSpring,
  useReducedMotion,
} from "motion/react";
import { useRef, useState, type ReactNode } from "react";
import { useCardBoardOptional } from "./cardBoardContext";
import { CardVisual } from "./CardVisual";

export type DragCardProps = {
  cardId: string;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  accent?: string;
  children?: ReactNode;
  onDragEnd?: (pos: { x: number; y: number }) => void;
  onDropZone?: (zoneId: string) => void;
  pinned?: boolean;
  /** 3D tilt while dragging (Aceternity-style). Honors prefers-reduced-motion. */
  tilt?: boolean;
  className?: string;
  /** Initial offset from layout position. */
  initialX?: number;
  initialY?: number;
};

const SPRING = { stiffness: 380, damping: 32, mass: 0.7 };
const TILT_MAX = 12;

/**
 * Draggable card with spring settle + optional tilt.
 * Wrap with `<CardBoard>` when using DropZone hit-testing.
 */
export function DragCard({
  cardId,
  title,
  subtitle,
  icon,
  accent,
  children,
  onDragEnd,
  onDropZone,
  pinned = false,
  tilt = true,
  className = "",
  initialX = 0,
  initialY = 0,
}: DragCardProps) {
  const board = useCardBoardOptional();
  const reduceMotion = useReducedMotion();
  const [dragging, setDragging] = useState(false);
  const origin = useRef({ x: initialX, y: initialY });

  const x = useMotionValue(initialX);
  const y = useMotionValue(initialY);
  const springX = useSpring(x, SPRING);
  const springY = useSpring(y, SPRING);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springRotX = useSpring(rotateX, { stiffness: 260, damping: 22 });
  const springRotY = useSpring(rotateY, { stiffness: 260, damping: 22 });

  const bind = useDrag(
    ({ first, last, movement: [mx, my], xy: [px, py], memo, event }) => {
      if (pinned) return memo;
      event?.preventDefault?.();

      if (first) {
        setDragging(true);
        origin.current = { x: x.get(), y: y.get() };
      }

      const nextX = origin.current.x + mx;
      const nextY = origin.current.y + my;
      x.set(nextX);
      y.set(nextY);

      if (tilt && !reduceMotion) {
        const nx = Math.max(-1, Math.min(1, mx / 120));
        const ny = Math.max(-1, Math.min(1, my / 120));
        rotateY.set(nx * TILT_MAX);
        rotateX.set(-ny * TILT_MAX);
      }

      if (board) {
        const hit = board.hitTest(px, py, cardId);
        board.setHoverZone(hit?.zoneId ?? null);
      }

      if (last) {
        setDragging(false);
        rotateX.set(0);
        rotateY.set(0);
        board?.clearHover();

        const hit = board?.hitTest(px, py, cardId) ?? null;
        if (hit) {
          hit.onDrop?.(cardId);
          onDropZone?.(hit.zoneId);
        }
        onDragEnd?.({ x: nextX, y: nextY });
      }

      return memo;
    },
    {
      enabled: !pinned,
      filterTaps: true,
      pointer: { touch: true, capture: true },
      preventScroll: true,
    },
  );

  const liveX = reduceMotion ? x : springX;
  const liveY = reduceMotion ? y : springY;
  const liveRotX = reduceMotion || !tilt ? 0 : springRotX;
  const liveRotY = reduceMotion || !tilt ? 0 : springRotY;

  return (
    <motion.div
      className={[
        "drag-card-shell",
        dragging ? "drag-card-shell--dragging" : "",
        pinned ? "drag-card-shell--pinned" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        x: liveX,
        y: liveY,
        rotateX: liveRotX,
        rotateY: liveRotY,
        zIndex: dragging ? 40 : 1,
      }}
      data-card-id={cardId}
    >
      {/* Plain div hosts use-gesture bind — avoids onDrag clash with motion */}
      <div
        className="drag-card-shell__hit"
        style={{ touchAction: pinned ? "auto" : "none" }}
        {...bind()}
      >
        <CardVisual
          title={title}
          subtitle={subtitle}
          icon={icon}
          accent={accent}
          dragging={dragging}
          tilt={Boolean(tilt && dragging && !reduceMotion)}
          pinned={pinned}
        >
          {children}
        </CardVisual>
      </div>
    </motion.div>
  );
}

/*
 * Usage (A7 Card Battle / A8 Diplomacy / A9 Quests / A10 RP Court):
 *
 * import { CardBoard } from "./cardBoardContext";
 * import { DragCard } from "./DragCard";
 * import { DropZone } from "./DropZone";
 *
 * <CardBoard>
 *   <DropZone zoneId="frontline" onDrop={(id) => playCard(id)} label="Фронт" />
 *   <DragCard
 *     cardId="atk-1"
 *     title="Залп"
 *     subtitle="1 AP"
 *     accent="var(--signal-attack, #e85d4c)"
 *     tilt
 *     onDropZone={(zoneId) => {
 *       if (zoneId === "frontline") commitPlay("atk-1");
 *     }}
 *   />
 * </CardBoard>
 *
 * Notes:
 * - Always wrap DragCard + DropZone in the same <CardBoard>.
 * - accepts?: string[] on DropZone filters by cardId ("*" = any).
 * - pinned disables drag; tilt is off under prefers-reduced-motion.
 * - Styles live in app.css (.drag-card*, .drop-zone*). No Tailwind.
 */
