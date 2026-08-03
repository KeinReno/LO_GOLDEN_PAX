import { useCallback, useEffect, useState } from "react";
import {
  getHostStatus,
  isDesktopApp,
  openDataFolder,
  startHost,
  type HostStatus,
} from "../desktop/tauriHost";

function rootLooksWrong(root: string | undefined): boolean {
  if (!root || root === "." || root.length < 3) return true;
  const norm = root.replace(/\\/g, "/").toLowerCase();
  return !norm.includes("gmap") && !norm.endsWith("/server");
}

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

  const rootHint =
    !status?.running && rootLooksWrong(status?.root)
      ? "Корень GMap не найден — проверьте GMAP_ROOT"
      : null;

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
        flexWrap: "wrap",
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
      {!status?.running && status?.lastError && (
        <span
          className="hint"
          title={status.lastError}
          style={{
            color: "#e08a7a",
            maxWidth: 220,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {status.lastError}
        </span>
      )}
      {!status?.running && rootHint && (
        <span className="hint" title={status?.root} style={{ fontSize: 10, opacity: 0.75 }}>
          {rootHint}
        </span>
      )}
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
                const raw = e instanceof Error ? e.message : String(e);
                setMsg(
                  raw.includes("dynamically imported")
                    ? "IPC ошибка — перезапустите tauri:dev"
                    : raw.slice(0, 80),
                );
                await refresh();
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
          void openDataFolder()
            .then((p) => setMsg(p ? "data открыта" : null))
            .catch(() => setMsg("data: ошибка"));
        }}
      >
        data
      </button>
      {msg && (
        <span className="hint" title={msg} style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {msg}
        </span>
      )}
    </div>
  );
}
