import { useState } from "react";
import { IntentsInbox } from "./IntentsInbox";
import { useWorldStore } from "../state/worldStore";
import { useCampaignSessionCtx } from "./CampaignSessionContext";

/** Right rail for Live table — command center, not inspector. */
export function GmLiveDock({ onRequestTick }: { onRequestTick: () => void }) {
  const world = useWorldStore((s) => s.world);
  const setRpFloatOpen = useWorldStore((s) => s.setRpFloatOpen);
  const [pendingCount, setPendingCount] = useState(0);
  const {
    shareStatus,
    shareViewUrl,
    shareLastViewUrl,
    openForPlayers,
    setShareOpen,
    shareOpen,
    onSaveToServer,
  } = useCampaignSessionCtx();

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
          <p className="gm-live-kicker">Ход {world.meta.turn}</p>
          <h3>Приказы</h3>
        </div>
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
        {pendingCount > 0 ? ` · ${pendingCount} в очереди` : ""}
      </p>

      <div className="gm-live-inbox">
        <IntentsInbox variant="dock" onPendingCount={setPendingCount} />
      </div>

      <footer className="gm-live-dock-foot">
        <button
          type="button"
          className="btn ghost block"
          onClick={() => setRpFloatOpen(true)}
        >
          Связь
        </button>
        <button
          type="button"
          className="btn ghost block"
          onClick={() => {
            if (displayShare) setShareOpen(!shareOpen);
            else void openForPlayers();
          }}
        >
          {online || displayShare ? "Ссылка игрокам" : "Открыть для игроков"}
        </button>
        <button
          type="button"
          className="btn ghost block"
          onClick={() => void onSaveToServer()}
        >
          Сохранить / опубликовать
        </button>
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
