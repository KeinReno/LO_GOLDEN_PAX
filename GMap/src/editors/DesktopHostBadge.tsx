import { useCallback, useEffect, useState } from "react";
import {
  getHostStatus,
  isDesktopApp,
  openDataFolder,
  startHost,
  type HostStatus,
} from "../desktop/tauriHost";

/** Compact host status for TopBar when running inside Tauri. */
export function DesktopHostBadge() {
  const [status, setStatus] = useState<HostStatus | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const desktop = isDesktopApp();

  const refresh = useCallback(async () => {
    if (!desktop) return;
    const s = await getHostStatus();
    setStatus(s);
  }, [desktop]);

  useEffect(() => {
    if (!desktop) return;
    void refresh();
    const id = window.setInterval(() => void refresh(), 8000);
    return () => window.clearInterval(id);
  }, [desktop, refresh]);

  if (!desktop) return null;

  return (
    <div
      className="desktop-host-badge"
      title={status?.root || "GMap desktop"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        opacity: 0.9,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: status?.running ? "#3d9a5f" : "#c45c4a",
        }}
      />
      <span>
        {status?.running
          ? `Хост :${status.port}`
          : "Хост выкл"}
      </span>
      {!status?.running && (
        <button
          type="button"
          className="btn ghost"
          style={{ padding: "2px 8px", fontSize: 11 }}
          onClick={() => {
            void (async () => {
              try {
                const s = await startHost();
                setStatus(s);
                setMsg(s?.running ? "Хост запущен" : "Не удалось");
              } catch (e) {
                setMsg(e instanceof Error ? e.message : String(e));
              }
            })();
          }}
        >
          Старт
        </button>
      )}
      {status?.viewUrl && (
        <a
          className="btn ghost"
          style={{ padding: "2px 8px", fontSize: 11, textDecoration: "none" }}
          href={status.viewUrl}
          target="_blank"
          rel="noreferrer"
        >
          /view
        </a>
      )}
      <button
        type="button"
        className="btn ghost"
        style={{ padding: "2px 8px", fontSize: 11 }}
        onClick={() => {
          void openDataFolder().then((p) => setMsg(p ? `data: ${p}` : null));
        }}
      >
        data
      </button>
      {msg && <span className="hint">{msg}</span>}
    </div>
  );
}
