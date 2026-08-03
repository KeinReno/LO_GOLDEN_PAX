import { useEffect, useRef, useState, type ReactNode } from "react";
import { useCardBoard } from "./cardBoardContext";

export type DropZoneProps = {
  zoneId: string;
  /** Filter by cardId; empty / omit = accept all. Use `"*"` as wildcard. */
  accepts?: string[];
  onDrop?: (cardId: string) => void;
  /** Force highlight (in addition to drag-hover). */
  highlight?: boolean;
  children?: ReactNode;
  className?: string;
  label?: string;
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
  children,
  className = "",
  label,
}: DropZoneProps) {
  const board = useCardBoard();
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return board.registerZone({
      zoneId,
      accepts,
      el,
      onDrop: (cardId) => onDropRef.current?.(cardId),
      setHover,
    });
  }, [board, zoneId, accepts]);

  const active = highlight || hover;

  return (
    <div
      ref={ref}
      className={[
        "drop-zone",
        active ? "drop-zone--active" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-zone-id={zoneId}
      aria-dropeffect="move"
    >
      {label ? <div className="drop-zone__label">{label}</div> : null}
      <div className="drop-zone__content">{children}</div>
    </div>
  );
}
