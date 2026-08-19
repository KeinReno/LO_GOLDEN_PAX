import type { ReactNode } from "react";
import { Menu, ScrollText } from "lucide-react";
import type { ViewerPayload } from "../../state/types";
import {
  FORCE_OD_TOOLTIP,
  OD_TOOLTIP,
  formatForceOdHud,
  formatOdHud,
} from "../../state/playerUiTerms";
import { useViewerChromeStore } from "../../state/viewerChromeStore";
import { useViewerOrderSessionStore } from "../../state/viewerOrderSessionStore";
import { ViewerAlertFab, type AlertItem } from "../ViewerAlertFab";

type Props = {
  payload: ViewerPayload;
  pendingCount: number;
  ordersPanel: ReactNode;
  isStale?: boolean;
  viewerAlertItems: AlertItem[];
};

/** Phone-only top chrome: who / turn / AP. Not a squeezed desktop strip. */
export function PhoneStatusBar({
  payload,
  pendingCount,
  ordersPanel,
  isStale = false,
  viewerAlertItems,
}: Props) {
  const queueOpen = useViewerChromeStore((s) => s.queueOpen);
  const rpUnread = useViewerChromeStore((s) => s.rpUnread);
  const setQueueOpen = useViewerChromeStore((s) => s.setQueueOpen);
  const openMenuOnly = useViewerChromeStore((s) => s.openMenuOnly);

  const reservedAp = useViewerOrderSessionStore((s) => s.reservedAp);
  const apMax = useViewerOrderSessionStore((s) => s.apMax);
  const reservedForceAp = useViewerOrderSessionStore((s) => s.reservedForceAp);
  const forceApMax = useViewerOrderSessionStore((s) => s.forceApMax);

  const faction = payload.world.factions.find((f) => f.id === payload.factionId);

  return (
    <header className="phone-status-bar">
      <button
        type="button"
        className="viewer-icon-btn"
        aria-label="Меню"
        onClick={openMenuOnly}
      >
        <Menu size={18} strokeWidth={2} aria-hidden />
      </button>
      <div className="phone-status-bar__who">
        <span
          className="swatch"
          style={{ background: faction?.color ?? "#888" }}
        />
        <div>
          <strong>{faction?.name ?? "Игрок"}</strong>
          <span className="hint" aria-live="polite">
            {isStale ? "нет связи" : `ход ${payload.world.meta.turn}`}
          </span>
        </div>
      </div>
      <p className="phone-status-bar__od" title={OD_TOOLTIP}>
        {formatOdHud(reservedAp, apMax)}
      </p>
      <p className="phone-status-bar__od" title={FORCE_OD_TOOLTIP}>
        {formatForceOdHud(reservedForceAp, forceApMax)}
      </p>
      <div className="phone-status-bar__actions">
        <button
          type="button"
          className={`viewer-icon-btn viewer-queue-btn ${queueOpen ? "active" : ""}`}
          aria-label="Очередь приказов"
          onClick={() => setQueueOpen((v) => !v)}
        >
          <ScrollText size={18} strokeWidth={2} aria-hidden />
          {pendingCount > 0 && (
            <span className="dock-badge">{pendingCount}</span>
          )}
        </button>
        {queueOpen && (
          <div
            className="viewer-queue-popover"
            role="dialog"
            aria-label="Очередь"
          >
            <div className="viewer-queue-popover-body">{ordersPanel}</div>
          </div>
        )}
        <ViewerAlertFab
          items={viewerAlertItems}
          unreadRp={rpUnread}
          menuPlacement="down"
        />
      </div>
    </header>
  );
}
