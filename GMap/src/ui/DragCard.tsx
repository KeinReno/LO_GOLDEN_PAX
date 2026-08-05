import { useDrag } from "@use-gesture/react";
import {
  motion,
  useMotionValue,
  useSpring,
  useReducedMotion,
} from "motion/react";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
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
  /** Spring back to origin after release (default true). */
  returnHome?: boolean;
  className?: string;
  /** Initial offset from layout position. */
  initialX?: number;
  initialY?: number;
};

const SPRING = { stiffness: 380, damping: 32, mass: 0.7 };
const TILT_MAX = 12;
/** Above viewer chrome / docks / tooltips (eco-tip is 9000). */
const DRAG_LAYER_Z = 12000;

type DragOrigin = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * Draggable card with spring settle + optional tilt.
 * While dragging, a fixed portal ghost paints above all menus
 * (escapes parent stacking contexts / overflow).
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
  returnHome = true,
  className = "",
  initialX = 0,
  initialY = 0,
}: DragCardProps) {
  const board = useCardBoardOptional();
  const reduceMotion = useReducedMotion();
  const [dragging, setDragging] = useState(false);
  const [originBox, setOriginBox] = useState<DragOrigin | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const origin = useRef({ x: initialX, y: initialY });

  const x = useMotionValue(initialX);
  const y = useMotionValue(initialY);
  const springX = useSpring(x, SPRING);
  const springY = useSpring(y, SPRING);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springRotX = useSpring(rotateX, { stiffness: 260, damping: 22 });
  const springRotY = useSpring(rotateY, { stiffness: 260, damping: 22 });

  useEffect(() => {
    if (!dragging) return;
    document.body.classList.add("is-gmap-dragging");
    return () => document.body.classList.remove("is-gmap-dragging");
  }, [dragging]);

  const bind = useDrag(
    ({ first, last, movement: [mx, my], xy: [px, py], memo, event }) => {
      if (pinned) return memo;
      event?.preventDefault?.();

      if (first) {
        const el = shellRef.current;
        if (el) {
          const r = el.getBoundingClientRect();
          setOriginBox({
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height,
          });
        }
        setDragging(true);
        board?.setDraggingCardId(cardId);
        origin.current = { x: initialX, y: initialY };
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
        setOriginBox(null);
        board?.setDraggingCardId(null);
        rotateX.set(0);
        rotateY.set(0);
        board?.clearHover();

        const hit = board?.hitTest(px, py, cardId) ?? null;
        if (hit) {
          // Prefer zone.onDrop as the single action. onDropZone is only a
          // fallback when the zone has no handler — never fire both.
          if (hit.onDrop) hit.onDrop(cardId);
          else onDropZone?.(hit.zoneId);
        }
        if (returnHome) {
          x.set(initialX);
          y.set(initialY);
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

  const cardInner = (
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
  );

  const ghost =
    dragging &&
    originBox &&
    typeof document !== "undefined" &&
    createPortal(
      <motion.div
        className={[
          "drag-card-shell",
          "drag-card-shell--dragging",
          "drag-card-shell--ghost",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        style={{
          position: "fixed",
          left: originBox.left,
          top: originBox.top,
          width: originBox.width,
          height: originBox.height,
          x: liveX,
          y: liveY,
          rotateX: liveRotX,
          rotateY: liveRotY,
          zIndex: DRAG_LAYER_Z,
          pointerEvents: "none",
          margin: 0,
        }}
        data-card-id={cardId}
        data-drag-ghost=""
        aria-hidden
      >
        {cardInner}
      </motion.div>,
      document.body,
    );

  return (
    <>
      <motion.div
        ref={shellRef}
        className={[
          "drag-card-shell",
          dragging ? "drag-card-shell--dragging drag-card-shell--placeholder" : "",
          pinned ? "drag-card-shell--pinned" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        style={{
          // Keep layout slot; motion offset only on ghost while dragging
          x: dragging ? 0 : liveX,
          y: dragging ? 0 : liveY,
          rotateX: dragging ? 0 : liveRotX,
          rotateY: dragging ? 0 : liveRotY,
          zIndex: 1,
        }}
        data-card-id={cardId}
      >
        <div
          className="drag-card-shell__hit"
          style={{ touchAction: pinned ? "auto" : "none" }}
          {...bind()}
        >
          {cardInner}
        </div>
      </motion.div>
      {ghost}
    </>
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
 *   />
 * </CardBoard>
 *
 * Notes:
 * - Always wrap DragCard + DropZone in the same <CardBoard>.
 * - Prefer DropZone.onDrop for the action; DragCard.onDropZone is fallback only
 *   when the zone has no onDrop (never fires both).
 * - accepts?: string[] on DropZone filters by cardId ("*" = any).
 * - pinned disables drag; tilt is off under prefers-reduced-motion.
 * - returnHome (default true) springs the card back after release.
 * - While dragging, a fixed portal ghost paints above chrome (z-index 12000).
 * - Styles live in app.css (.drag-card*, .drop-zone*). No Tailwind.
 */
