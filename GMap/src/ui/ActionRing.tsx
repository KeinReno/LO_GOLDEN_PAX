import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";

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
  /** Distance from center to item buttons (px). */
  radius?: number;
};

const DEFAULT_RADIUS = 56;

/**
 * Radial action menu anchored at a viewport point (long-press / tap-at-source).
 */
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
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (performance.now() - openedAtRef.current < 80) return;
      const root = rootRef.current;
      if (root && !root.contains(e.target as Node)) onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open, onClose]);

  if (!open || items.length === 0) return null;

  const step = 360 / items.length;

  return (
    <div
      ref={rootRef}
      className="action-ring"
      role="menu"
      aria-label="Действия"
      style={{ left: x, top: y }}
    >
      <button
        type="button"
        className="action-ring-center"
        aria-label="Закрыть действия"
        onClick={onClose}
      />

      {items.map((item, i) => {
        const angleDeg = step * i - 90;
        const rad = (angleDeg * Math.PI) / 180;
        const tx = Math.cos(rad) * radius;
        const ty = Math.sin(rad) * radius;
        const cls = [
          "action-ring-item",
          item.danger ? "danger" : "",
          item.disabled ? "disabled" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className={cls}
            disabled={item.disabled}
            aria-disabled={item.disabled || undefined}
            title={item.label}
            style={{ transform: `translate(${tx}px, ${ty}px)` }}
            onClick={() => handleSelect(item)}
          >
            {item.icon ? (
              <span className="action-ring-item-icon" aria-hidden>
                {item.icon}
              </span>
            ) : null}
            <span className="action-ring-item-label">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
