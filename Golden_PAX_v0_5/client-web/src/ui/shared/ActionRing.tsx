import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";

export type ActionRingItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

type Props = {
  open: boolean;
  x: number;
  y: number;
  onClose: () => void;
  items: ActionRingItem[];
  radius?: number;
};

const DEFAULT_RADIUS = 56;

export function ActionRing({
  open,
  x,
  y,
  onClose,
  items,
  radius = DEFAULT_RADIUS,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const openedAtRef = useRef(0);

  useLayoutEffect(() => {
    if (open) openedAtRef.current = performance.now();
  }, [open, x, y]);

  const handleSelect = useCallback(
    (item: ActionRingItem) => {
      if (item.disabled) return;
      item.onSelect();
      onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };

    const onPointerDown = (e: PointerEvent) => {
      if (performance.now() - openedAtRef.current < 80) return;
      const root = rootRef.current;
      if (root && !root.contains(e.target as Node)) onClose();
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open, onClose]);

  if (!open || items.length === 0 || typeof document === "undefined") {
    return null;
  }

  const step = 360 / items.length;

  return createPortal(
    <div
      ref={rootRef}
      className="pointer-events-none fixed z-[401] h-0 w-0"
      role="menu"
      aria-label="Actions"
      style={{ left: x, top: y }}
    >
      <button
        type="button"
        className="pointer-events-auto absolute left-0 top-0 -ml-3.5 -mt-3.5 h-7 w-7 rounded-full border border-cyan-500/30 bg-slate-950/95 shadow-lg backdrop-blur-md"
        aria-label="Close"
        onClick={onClose}
      />
      {items.map((item, i) => {
        const angleDeg = step * i - 90;
        const rad = (angleDeg * Math.PI) / 180;
        const tx = Math.cos(rad) * radius;
        const ty = Math.sin(rad) * radius;

        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            title={item.label}
            style={{ transform: `translate(${tx}px, ${ty}px)` }}
            className={cn(
              "pointer-events-auto absolute left-0 top-0 -ml-[22px] -mt-[22px] flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-full border px-1.5 py-1 text-[0.62rem] backdrop-blur-md transition",
              item.danger
                ? "border-red-500/40 bg-red-950/40 text-red-100 hover:border-red-400"
                : "border-cyan-500/25 bg-slate-950/90 text-slate-100 hover:border-cyan-400/50",
              item.disabled && "cursor-default opacity-40",
            )}
            onClick={() => handleSelect(item)}
          >
            {item.icon ? <span aria-hidden>{item.icon}</span> : null}
            <span className="max-w-[52px] truncate">{item.label}</span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
