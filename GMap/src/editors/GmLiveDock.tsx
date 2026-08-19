import { useState } from "react";
import { IntentsInbox } from "./IntentsInbox";
import { useWorldStore } from "../state/worldStore";
import { useCampaignSessionCtx } from "./CampaignSessionContext";

/** Right rail for Live table — inbox + close-turn, not a second TopBar. */
export function GmLiveDock({ onRequestTick }: { onRequestTick: () => void }) {
  const world = useWorldStore((s) => s.world);
  const [pendingCount, setPendingCount] = useState(0);
  const { shareStatus, shareViewUrl, shareLastViewUrl } =
    useCampaignSessionCtx();

  const displayShare = shareViewUrl || shareLastViewUrl;
  const online = shareStatus === "online";
  const statusLabel = online
    ? "Игроки online"
    : shareStatus === "degraded" || shareStatus === "starting"
      ? "Переподключение…"
      : displayShare
        ? "Туннель есть"
        : "Туннель выкл";

  return (
    <aside className="panel panel-right gm-live-dock">
      <header className="gm-live-dock-head">
        <div>
          <p className="gm-live-kicker">Очередь · ход {world.meta.turn}</p>
          <h3>Приказы игроков</h3>
        </div>
        {pendingCount > 0 && (
          <span className="gm-live-pending-pill">{pendingCount}</span>
        )}
      </header>

      <p className="gm-live-status-line">
        <span
          className={`gm-live-dot gm-live-dot--${
            online ? "ok" : shareStatus === "idle" ? "off" : "warn"
          }`}
        />
        {statusLabel}
        {world.meta.tableRevision != null
          ? ` · rev ${world.meta.tableRevision}`
          : ""}
      </p>

      <div className="gm-live-inbox">
        <p className="gm-live-inbox-title">По державам</p>
        <IntentsInbox
          variant="dock"
          hideRefresh
          onPendingCount={setPendingCount}
        />
      </div>

      <footer className="gm-live-dock-foot">
        <p className="hint gm-live-foot-hint">
          Ссылка и сохранение — в верхней панели (···). Здесь — очередь и тик.
        </p>
        <button
          type="button"
          className="btn primary block gm-live-tick-btn"
          onClick={onRequestTick}
        >
          Закрыть ход · превью
        </button>
      </footer>
    </aside>
  );
}
