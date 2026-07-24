import { useCallback, useEffect, useState } from "react";
import { useCampaignSessionCtx } from "./CampaignSessionContext";

type Health = {
  lastTickAt?: string | null;
  minutesSinceLastTick?: number | null;
  tickFrozen?: boolean;
  missedDailyTick?: boolean;
  catchUpPending?: boolean;
  lastBackupAt?: string | null;
  lastBackupReason?: string | null;
  backupCount?: number;
  recentBackups?: string[];
  alerts?: { id: string; at: string; kind: string; message: string }[];
  turn?: number | null;
  cron?: string;
  timezone?: string;
  auth?: { source: string; isDefault: boolean; hint?: string | null };
  scheduler?: { started?: boolean; msUntilNext?: number | null };
};

export function OpsHealthPanel() {
  const { masterToken, setSyncMsg } = useCampaignSessionCtx();
  const [health, setHealth] = useState<Health | null>(null);
  const [busy, setBusy] = useState(false);
  const [newToken, setNewToken] = useState("");

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/turn/health", {
        headers: { "X-Master-Token": masterToken },
      });
      if (!res.ok) throw new Error(await res.text());
      setHealth(await res.json());
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [masterToken, setSyncMsg]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const runBackup = async () => {
    try {
      const res = await fetch("/api/backup/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Token": masterToken,
        },
        body: JSON.stringify({ reason: "manual" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setSyncMsg(`Бэкап: ${data.dir}`);
      void refresh();
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const clearAlerts = async () => {
    await fetch("/api/turn/alerts/clear", {
      method: "POST",
      headers: { "X-Master-Token": masterToken },
    });
    void refresh();
  };

  const saveToken = async () => {
    try {
      const res = await fetch("/api/auth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Token": masterToken,
        },
        body: JSON.stringify({ token: newToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setSyncMsg(
        "Токен записан в data/master-token.txt — обновите поле токена в Сессии",
      );
      setNewToken("");
      void refresh();
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const nextMin =
    health?.scheduler?.msUntilNext != null
      ? Math.round(health.scheduler.msUntilNext / 60000)
      : null;

  return (
    <section>
      <h3>Ops · тик / бэкапы</h3>
      <p className="hint">
        Мониторинг суточного тика, catch-up и снимков. Белый IP не нужен.
      </p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn ghost"
          disabled={busy}
          onClick={() => void refresh()}
        >
          Обновить
        </button>
        <button type="button" className="btn ghost" onClick={() => void runBackup()}>
          Бэкап сейчас
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => void clearAlerts()}
        >
          Очистить алерты
        </button>
      </div>

      {!health ? (
        <p className="hint">Нет данных…</p>
      ) : (
        <div className="order-card" style={{ marginTop: 8 }}>
          <div>
            <strong>Ход {health.turn ?? "—"}</strong>
            <br />
            <span className="hint">
              cron {health.cron} ({health.timezone})
              {nextMin != null ? ` · след. ~${nextMin} мин` : ""}
            </span>
          </div>
          <ul className="hint" style={{ paddingLeft: 16 }}>
            <li>
              lastTick: {health.lastTickAt ?? "никогда"}
              {health.minutesSinceLastTick != null
                ? ` (${health.minutesSinceLastTick} мин назад)`
                : ""}
            </li>
            <li>
              статус:{" "}
              {health.tickFrozen
                ? "ЗАМОРОЖЕН"
                : health.missedDailyTick
                  ? "пропущен суточный тик"
                  : "ок"}
            </li>
            <li>
              бэкапы: {health.backupCount ?? 0}
              {health.lastBackupAt
                ? ` · последний ${health.lastBackupAt} (${health.lastBackupReason})`
                : ""}
            </li>
            <li>
              токен: {health.auth?.source}
              {health.auth?.isDefault ? " ⚠ DEFAULT" : ""}
            </li>
          </ul>
          {health.auth?.hint && (
            <p className="hint" style={{ color: "#c9a227" }}>
              {health.auth.hint}
            </p>
          )}
          {(health.alerts?.length ?? 0) > 0 && (
            <>
              <h4>Алерты</h4>
              {health.alerts!.slice(-6).reverse().map((a) => (
                <div key={a.id} className="hint">
                  [{a.kind}] {a.message}
                </div>
              ))}
            </>
          )}
          {(health.recentBackups?.length ?? 0) > 0 && (
            <>
              <h4>Последние снимки</h4>
              <ul className="hint" style={{ paddingLeft: 16 }}>
                {health.recentBackups!.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <label className="field" style={{ marginTop: 10 }}>
        <span>Сменить мастер-токен (→ data/master-token.txt)</span>
        <input
          type="password"
          value={newToken}
          onChange={(e) => setNewToken(e.target.value)}
          placeholder="мин. 8 символов"
        />
      </label>
      <button
        type="button"
        className="btn ghost"
        disabled={newToken.length < 8}
        onClick={() => void saveToken()}
      >
        Записать токен
      </button>
    </section>
  );
}
