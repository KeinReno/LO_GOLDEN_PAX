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

  tokenIsDefault?: boolean;

  auth?: { source: string; isDefault: boolean; hint?: string | null };

  scheduler?: { started?: boolean; msUntilNext?: number | null };

  store?: {
    driver: string;
    ok: boolean;
    path?: string;
    betterSqlite3?: boolean;
  };

  dataSizes?: Record<string, number>;

};



const SQLITE_HINT_THRESHOLD = 5 * 1024 * 1024;



function fmtBytes(n: number) {

  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;

  if (n >= 1024) return `${Math.round(n / 1024)} KB`;

  return `${n} B`;

}



function fmtWhen(iso?: string | null) {

  if (!iso) return null;

  try {

    return new Date(iso).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });

  } catch {

    return iso;

  }

}



function tokenLabel(health: Health) {

  const weak = health.tokenIsDefault ?? health.auth?.isDefault;

  if (weak) return "слабый (default) — смените перед публикацией";

  const src = health.auth?.source;

  return src === "env" ? "кастомный (env)" : "кастомный (файл)";

}



export function OpsHealthPanel() {

  const { masterToken, setSyncMsg } = useCampaignSessionCtx();

  const [health, setHealth] = useState<Health | null>(null);

  const [busy, setBusy] = useState(false);

  const [backupBusy, setBackupBusy] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);

  const [newToken, setNewToken] = useState("");



  const refresh = useCallback(async () => {

    setBusy(true);

    setLoadError(null);

    try {

      const res = await fetch("/api/ops/health", {

        headers: { "X-Master-Token": masterToken },

      });

      if (!res.ok) {

        const text = await res.text();

        throw new Error(

          res.status === 401 ? "Неверный мастер-токен" : text || res.statusText,

        );

      }

      setHealth(await res.json());

    } catch (e) {

      const msg = e instanceof Error ? e.message : String(e);

      setLoadError(msg);

      setHealth(null);

    } finally {

      setBusy(false);

    }

  }, [masterToken]);



  useEffect(() => {

    void refresh();

    const id = window.setInterval(() => void refresh(), 60_000);

    return () => window.clearInterval(id);

  }, [refresh]);



  const runBackup = async () => {

    setBackupBusy(true);

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

    } finally {

      setBackupBusy(false);

    }

  };



  const toggleFreeze = async () => {

    const frozen = !health?.tickFrozen;

    try {

      const res = await fetch("/api/turn/freeze", {

        method: "POST",

        headers: {

          "Content-Type": "application/json",

          "X-Master-Token": masterToken,

        },

        body: JSON.stringify({ frozen }),

      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || res.statusText);

      setSyncMsg(frozen ? "Catch-up заморожен" : "Catch-up разморожен");

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



  const [journal, setJournal] = useState<{
    turnFrom?: number;
    turnTo?: number;
    events?: unknown[];
  } | null>(null);
  const [journalBusy, setJournalBusy] = useState(false);

  const refreshJournal = useCallback(async () => {
    setJournalBusy(true);
    try {
      const res = await fetch("/api/turn/journal", {
        headers: { "X-Master-Token": masterToken },
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { journal?: typeof journal };
      setJournal(data.journal ?? null);
    } catch {
      setJournal(null);
    } finally {
      setJournalBusy(false);
    }
  }, [masterToken]);

  useEffect(() => {
    void refreshJournal();
  }, [refreshJournal, health?.lastTickAt]);

  const nextMin =

    health?.scheduler?.msUntilNext != null

      ? Math.round(health.scheduler.msUntilNext / 60000)

      : null;



  const tickWhen = fmtWhen(health?.lastTickAt);

  const backupWhen = fmtWhen(health?.lastBackupAt);

  const tokenWeak = health?.tokenIsDefault ?? health?.auth?.isDefault;

  const dataSizes = health?.dataSizes ?? {};

  const anyLargeJson = Object.values(dataSizes).some(

    (n) => n >= SQLITE_HINT_THRESHOLD,

  );



  const tickStatus = !health

    ? null

    : health.tickFrozen

      ? "frozen"

      : health.catchUpPending

        ? "catchup"

        : health.missedDailyTick

          ? "missed"

          : "ok";



  return (

    <section>

      <h3>Ops · тик / бэкапы</h3>

      <p className="hint">

        Мониторинг суточного тика, catch-up и снимков. Белый IP не нужен —

        туннели через <code>npm run players:*</code>.

      </p>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>

        <button

          type="button"

          className="btn ghost"

          disabled={busy}

          onClick={() => void refresh()}

        >

          {busy ? "Обновление…" : "Обновить"}

        </button>

        <button

          type="button"

          className="btn ghost"

          disabled={backupBusy || !health}

          onClick={() => void runBackup()}

        >

          {backupBusy ? "Бэкап…" : "Бэкап сейчас"}

        </button>

        <button

          type="button"

          className="btn ghost"

          disabled={!health}

          onClick={() => void toggleFreeze()}

        >

          {health?.tickFrozen ? "Разморозить catch-up" : "Заморозить catch-up"}

        </button>

        <button

          type="button"

          className="btn ghost"

          disabled={!health?.alerts?.length}

          onClick={() => void clearAlerts()}

        >

          Очистить алерты

        </button>

      </div>



      {loadError ? (

        <p className="hint" style={{ color: "#e07070", marginTop: 8 }}>

          Ошибка загрузки: {loadError}

        </p>

      ) : busy && !health ? (

        <p className="hint" style={{ marginTop: 8 }}>

          Загрузка…

        </p>

      ) : !health ? (

        <p className="hint" style={{ marginTop: 8 }}>

          Нет данных — проверьте мастер-токен в Сессии.

        </p>

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

              lastTick:{" "}

              {tickWhen ?? (

                <span style={{ color: "#c9a227" }}>никогда — первый boot без catch-up</span>

              )}

              {health.minutesSinceLastTick != null

                ? ` (${health.minutesSinceLastTick} мин назад)`

                : ""}

            </li>

            <li>

              статус:{" "}

              {tickStatus === "frozen" ? (

                <span style={{ color: "#e07070" }}>

                  ЗАМОРОЖЕН — догоняющий тик (catch-up) заблокирован

                </span>

              ) : tickStatus === "catchup" ? (

                <span style={{ color: "#c9a227" }}>

                  ожидает catch-up при следующем boot

                </span>

              ) : tickStatus === "missed" ? (

                <span style={{ color: "#c9a227" }}>пропущен суточный тик</span>

              ) : (

                "ок"

              )}

            </li>

            <li>

              бэкапы: {health.backupCount ?? 0}

              {backupWhen

                ? ` · последний ${backupWhen}${health.lastBackupReason ? ` (${health.lastBackupReason})` : ""}`

                : " · снимков пока нет"}

            </li>

            <li>

              токен:{" "}

              <span style={{ color: tokenWeak ? "#c9a227" : "#7ec87e" }}>

                {tokenLabel(health)}

              </span>

            </li>

            {health.store && (

              <li>

                store:{" "}

                <span style={{ color: health.store.ok ? "#7ec87e" : "#e07070" }}>

                  {health.store.driver}

                  {health.store.path ? ` (${health.store.path})` : ""}

                </span>

                {health.store.betterSqlite3 != null && (

                  <span className="hint">

                    {" "}

                    · better-sqlite3: {health.store.betterSqlite3 ? "да" : "нет"}

                  </span>

                )}

              </li>

            )}

            {Object.keys(dataSizes).length > 0 && (

              <li>

                JSON размеры:{" "}

                {Object.entries(dataSizes).map(([name, bytes], i) => {

                  const large = bytes >= SQLITE_HINT_THRESHOLD;

                  return (

                    <span key={name}>

                      {i > 0 ? ", " : ""}

                      <span style={large ? { color: "#c9a227" } : undefined}>

                        {name} {fmtBytes(bytes)}

                        {large ? " ⚠" : ""}

                      </span>

                    </span>

                  );

                })}

              </li>

            )}

          </ul>

          {anyLargeJson && (

            <p className="hint" style={{ color: "#c9a227" }}>

              SQLite когда JSON &gt; ~5MB — миграция опциональна, драйвер не

              переключается автоматически.

            </p>

          )}

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

      <div style={{ marginTop: 10 }}>
        <h4>Журнал хода (GM)</h4>
        <p className="hint">
          Полный журнал последнего тика — все фракции и GM-события.
        </p>
        <button
          type="button"
          className="btn ghost"
          disabled={journalBusy}
          onClick={() => void refreshJournal()}
        >
          {journalBusy ? "Загрузка…" : "Обновить журнал"}
        </button>
        {journal ? (
          <div className="order-card" style={{ marginTop: 6 }}>
            <strong>
              Ход {journal.turnFrom ?? "?"}→{journal.turnTo ?? "?"}
            </strong>
            <span className="hint"> · событий {journal.events?.length ?? 0}</span>
            {(journal.events?.length ?? 0) > 0 && (
              <details style={{ marginTop: 6 }}>
                <summary className="hint">Показать события</summary>
                <ul className="hint" style={{ paddingLeft: 16, maxHeight: 200, overflow: "auto" }}>
                  {(journal.events ?? []).slice(-40).map((e, i) => (
                    <li key={i}>
                      {(e as { type?: string }).type ?? "?"}
                      {(e as { systemId?: string }).systemId
                        ? ` · ${(e as { systemId?: string }).systemId}`
                        : ""}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ) : (
          !journalBusy && (
            <p className="hint" style={{ marginTop: 6 }}>
              Журнал пуст — тик ещё не выполнялся.
            </p>
          )
        )}
      </div>

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


