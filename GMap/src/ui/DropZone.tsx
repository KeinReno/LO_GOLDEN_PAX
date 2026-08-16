import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useCardBoard } from "./cardBoardContext";

export type DropZoneProps = {
  zoneId: string;
  /** Filter by cardId; empty / omit = accept all. Use `"*"` as wildcard. */
  accepts?: string[];
  onDrop?: (cardId: string, pos: { x: number; y: number }) => void;
  /** Force highlight (in addition to drag-hover). */
  highlight?: boolean;
  /** Soft “armed” glow while a valid card is being dragged elsewhere. */
  armWhileDragging?: boolean;
  children?: ReactNode;
  className?: string;
  label?: string;
  /**
   * How the inner content wrapper lays out children.
   * - center: legacy (row-ish flex center) — fine for empty targets
   * - stack: column, stretch, fills parent — panels/drawers
   * - contents: wrapper is display:contents (children participate in parent flex)
   */
  contentLayout?: "center" | "stack" | "contents";
  /** True while a valid drag is over this zone (hit-test or pointer). */
  onHoverChange?: (active: boolean) => void;
};

/**
 * Drop target for DragCard. Must sit under the same `<CardBoard>` as cards.
 * Hover highlight is driven by DragCard hit-testing via getBoundingClientRect.
 */
export function DropZone({
  zoneId,
  accepts,
  onDrop,
  highlight = false,
  armWhileDragging = false,
  children,
  className = "",
  label,
  contentLayout = "center",
  onHoverChange,
}: DropZoneProps) {
  const board = useCardBoard();
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  const onHoverRef = useRef(onHoverChange);
  onHoverRef.current = onHoverChange;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return board.registerZone({
      zoneId,
      accepts,
      el,
      onDrop: (cardId, pos) => onDropRef.current?.(cardId, pos),
      setHover,
    });
  }, [board, zoneId, accepts]);

  useEffect(() => {
    onHoverRef.current?.(hover);
  }, [hover]);

  const acceptsDrag = useMemo(() => {
    const id = board.draggingCardId;
    if (!id) return false;
    if (!accepts || accepts.length === 0) return true;
    return accepts.includes(id) || accepts.includes("*");
  }, [board.draggingCardId, accepts]);

  const armed = armWhileDragging && acceptsDrag;
  const active = highlight || hover || armed;

  return (
    <div
      ref={ref}
      className={[
        "drop-zone",
        active ? "drop-zone--active" : "",
        hover ? "drop-zone--hover" : "",
        armed && !hover ? "drop-zone--armed" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-zone-id={zoneId}
      aria-dropeffect="move"
    >
      {label ? <div className="drop-zone__label">{label}</div> : null}
      <div
        className={[
          "drop-zone__content",
          contentLayout === "stack" ? "drop-zone__content--stack" : "",
          contentLayout === "contents" ? "drop-zone__content--contents" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </div>
    </div>
  );
}
