import { useEffect, useId, useRef, useState } from "react";
import {
  Bell,
  BookMarked,
  Coins,
  MessageSquare,
  ScrollText,
  Ship,
  Swords,
} from "lucide-react";

export type AlertFocusAnchor = { clientX: number; clientY: number };

export type AlertItem = {
  id: string;
  kind: "idle_fleet" | "engagement" | "orders" | "rp" | "economy" | "quest";
  /** Imperative CTA — shared with HQ «Внимание». */
  verb: string;
  title: string;
  subtitle?: string;
  onFocus: (anchor?: AlertFocusAnchor) => void;
};

type Props = {
  items: AlertItem[];
  unreadRp?: number;
  menuPlacement?: "up" | "down";
};

const KIND_ICONS = {
  idle_fleet: Ship,
  engagement: Swords,
  orders: ScrollText,
  rp: MessageSquare,
  economy: Coins,
  quest: BookMarked,
} as const;

export function ViewerAlertFab({
  items,
  unreadRp,
  menuPlacement = "up",
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const badgeCount = items.length;

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleItemClick = (item: AlertItem, e: React.MouseEvent) => {
    item.onFocus({ clientX: e.clientX, clientY: e.clientY });
    setOpen(false);
  };

  return (
    <div
      className={`viewer-alert-fab${menuPlacement === "down" ? " viewer-alert-fab--down" : ""}`}
      ref={rootRef}
    >
      <button
        type="button"
        className={`viewer-alert-fab-btn ${open ? "on" : ""}`}
        aria-label="Сигналы"
        aria-expanded={open}
        aria-controls={menuId}
        title={
          badgeCount > 0
            ? `${badgeCount} сигнал${badgeCount === 1 ? "" : badgeCount < 5 ? "а" : "ов"}`
            : "Нет сигналов"
        }
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={20} strokeWidth={2} aria-hidden />
        {badgeCount > 0 ? (
          <span className="viewer-alert-badge" aria-hidden>
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        ) : null}
        {unreadRp != null && unreadRp > 0 && badgeCount === 0 ? (
          <span className="viewer-alert-badge viewer-alert-badge--rp" aria-hidden>
            {unreadRp > 9 ? "9+" : unreadRp}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id={menuId}
          className="viewer-alert-menu"
          role="menu"
          aria-label="Сигналы"
        >
          {items.length === 0 ? (
            <p className="viewer-alert-empty">Нет сигналов</p>
          ) : (
            <ul className="viewer-alert-list">
              {items.map((item) => {
                const Icon = KIND_ICONS[item.kind];
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="viewer-alert-item"
                      role="menuitem"
                      onClick={(e) => handleItemClick(item, e)}
                    >
                      <span className="viewer-alert-item-icon" aria-hidden>
                        <Icon size={15} strokeWidth={2} />
                      </span>
                      <span className="viewer-alert-item-text">
                        <strong>{item.verb}</strong>
                        <span className="hint">
                          {item.title}
                          {item.subtitle ? ` · ${item.subtitle}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
