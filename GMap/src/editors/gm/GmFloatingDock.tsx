import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { GM_LIVE_DOMAINS, domainHotkeyLabel } from "./gmDomains";
import { useWorldStore } from "../../state/worldStore";
import type { GmLiveDomainId } from "../../state/types";

const GM_DOCK_KEY = "gmap-gm-dock-collapsed";

/**
 * Aceternity-inspired Floating Dock — domain launcher pinned to map bottom.
 * Collapsible so the map can go full-bleed during live play.
 */
export function GmFloatingDock({
  onOpenDomain,
  onOpenRightDock,
}: {
  onOpenDomain: (id: GmLiveDomainId) => void;
  onOpenRightDock?: () => void;
}) {
  const activeId = useWorldStore((s) => s.gmLiveDomain);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(GM_DOCK_KEY) === "1";
    } catch {
      return false;
    }
  });

  const toggle = () => {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(GM_DOCK_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <nav
      className={`gm-floating-dock${collapsed ? " gm-floating-dock--collapsed" : ""}`}
      aria-label="Домены ГМа"
      aria-expanded={!collapsed}
    >
      <button
        type="button"
        className="gm-floating-dock__toggle"
        aria-label={collapsed ? "Показать домены" : "Скрыть домены"}
        title={collapsed ? "Показать домены" : "Скрыть домены"}
        onClick={toggle}
      >
        {collapsed ? (
          <ChevronUp size={14} strokeWidth={2.2} aria-hidden />
        ) : (
          <ChevronDown size={14} strokeWidth={2.2} aria-hidden />
        )}
        {collapsed && <span>Домены</span>}
      </button>
      <div className="gm-floating-dock__inner">
        {GM_LIVE_DOMAINS.map((d) => {
          const hk = domainHotkeyLabel(d.hotkey);
          return (
          <button
            key={d.id}
            type="button"
            className={`gm-floating-dock__item ${activeId === d.id ? "on" : ""}`}
            title={hk ? `${d.hint} · ${hk}` : d.hint}
            onClick={() => {
              if (d.id === "inbox") {
                onOpenRightDock?.();
                onOpenDomain("inbox");
                return;
              }
              onOpenDomain(d.id);
            }}
          >
            {hk ? <kbd>{hk}</kbd> : <span className="gm-floating-dock__item-key">клик</span>}
            <span>{d.label}</span>
          </button>
          );
        })}
      </div>
    </nav>
  );
}
