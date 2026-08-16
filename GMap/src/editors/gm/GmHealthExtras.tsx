/**
 * C5 health-domain extras: faction compare, session brief, intervention log.
 * Used inside OpsHealthPanel / GmSessionNotch FloatingPanel — not a new domain.
 */
import { useCallback, useEffect, useState } from "react";
import { useCampaignSessionCtx } from "../CampaignSessionContext";

type FactionRow = {
  factionId: string;
  name: string;
  color?: string;
  planets?: number;
  metal: number;
  cognitio: number;
  fleets: number;
  legions: number;
  forceAp: number;
  unlockedTechs: number;
  openPaths: number;
  roleScores?: Record<string, number>;
  roleScoreTotal?: number;
  power: number;
};

type BriefPayload = {
  ok: boolean;
  error?: string;
  text?: string;
  from?: string;
  to?: string;
  backups?: string[];
};

type Intervention = {
  id: string;
  at: string;
  actor: string;
  action: string;
  before?: unknown;
  after?: unknown;
};

function fmtWhen(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
  } catch {
    return iso;
  }
}

function shortJson(v: unknown): string {
  if (v == null) return "—";
  try {
    const s = JSON.stringify(v);
    return s.length > 72 ? `${s.slice(0, 70)}…` : s;
  } catch {
    return String(v);
  }
}

export function FactionCompareSection() {
  const { masterToken } = useCampaignSessionCtx();
  const [rows, setRows] = useState<FactionRow[]>([]);
  const [formula, setFormula] = useState("");
  const [snowballAlert, setSnowballAlert] = useState(false);
  const [leadRatio, setLeadRatio] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/gm/cockpit/factions", {
        headers: { "X-Master-Token": masterToken },
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || res.statusText);
      }
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setFormula(data.sortFormula || "");
      setSnowballAlert(Boolean(data.snowballAlert));
      setLeadRatio(typeof data.leadRatio === "number" ? data.leadRatio : null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setBusy(false);
    }
  }, [masterToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const maxPower = Math.max(1, ...rows.map((r) => r.power));

  return (
    <div>
      <h4>Сравнение фракций & Баланс стола</h4>
      <p className="hint">
        Казна / силы / техи / RoleScore из ledger + apBudget.
        {formula ? (
          <>
            {" "}
            Сортировка: <code>{formula}</code>
          </>
        ) : null}
      </p>

      {snowballAlert && leadRatio !== null && (
        <div
          className="cbt-intent"
          style={{
            margin: "8px 0",
            padding: "8px 12px",
            border: "1px solid #e8a54c",
            background: "rgba(232, 165, 76, 0.12)",
            borderRadius: 6,
          }}
        >
          <strong>⚠️ Предупреждение отрыва (Snowball):</strong> Лидер «{rows[0]?.name}»
          опережает 2-е место в <strong>×{leadRatio}</strong> раза по совокупной мощи.
          Рекомендуется стимулировать союзы или активировать кризисные квесты.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "8px 0" }}>
        <button
          type="button"
          className="btn ghost"
          disabled={busy}
          onClick={() => void refresh()}
        >
          {busy ? "Обновление…" : "Обновить"}
        </button>
        <span className="hint">Держав в игре: {rows.length}</span>
      </div>

      {err && (
        <p className="hint" style={{ color: "#e07070", marginTop: 6 }}>
          {err}
        </p>
      )}

      {rows.length > 0 && (
        <table className="gm-balance-table" style={{ marginTop: 8, width: "100%" }}>
          <thead>
            <tr>
              <th>Ранг</th>
              <th>Фракция</th>
              <th>Мощь</th>
              <th>Систем</th>
              <th>Металл</th>
              <th>Когн.</th>
              <th>Флот / Лег</th>
              <th>ОД сил</th>
              <th>Техи / Пути</th>
              <th>RoleScore</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const rankIcon = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
              const powerPct = Math.round((r.power / maxPower) * 100);
              return (
                <tr key={r.factionId}>
                  <td style={{ textAlign: "center", fontWeight: 700 }}>{rankIcon}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span
                        style={{
                          display: "inline-block",
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: r.color || "var(--accent)",
                        }}
                      />
                      <strong>{r.name}</strong>
                    </div>
                  </td>
                  <td className="tabular">
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 700, minWidth: 32 }}>{r.power}</span>
                      <div
                        style={{
                          flex: 1,
                          minWidth: 40,
                          height: 5,
                          background: "rgba(255,255,255,0.1)",
                          borderRadius: 2,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${powerPct}%`,
                            height: "100%",
                            background: r.color || "var(--accent)",
                          }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="tabular">{r.planets ?? "—"}</td>
                  <td className="tabular">{r.metal}</td>
                  <td className="tabular">{r.cognitio}</td>
                  <td className="tabular">
                    {r.fleets} / {r.legions}
                  </td>
                  <td className="tabular">{r.forceAp}</td>
                  <td className="tabular">
                    {r.unlockedTechs} / {r.openPaths}
                  </td>
                  <td
                    className="tabular"
                    title={
                      r.roleScores
                        ? Object.entries(r.roleScores)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(" · ")
                        : undefined
                    }
                  >
                    <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                      {r.roleScoreTotal ?? 0}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {!busy && !err && rows.length === 0 && (
        <p className="hint" style={{ marginTop: 6 }}>
          Нет фракций на доске.
        </p>
      )}
    </div>
  );
}

export function SessionBriefSection({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { masterToken } = useCampaignSessionCtx();
  const [brief, setBrief] = useState<BriefPayload | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [backups, setBackups] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(
    async (fromName?: string, toName?: string) => {
      setBusy(true);
      setErr(null);
      try {
        const qs = new URLSearchParams();
        if (fromName) qs.set("from", fromName);
        if (toName) qs.set("to", toName);
        const res = await fetch(
          `/api/gm/cockpit/brief${qs.toString() ? `?${qs}` : ""}`,
          { headers: { "X-Master-Token": masterToken } },
        );
        const data = (await res.json()) as BriefPayload;
        if (!res.ok || data.ok === false) {
          throw new Error(data.error || res.statusText);
        }
        setBrief(data);
        const list = Array.isArray(data.backups) ? data.backups : [];
        setBackups(list);
        if (data.from) setFrom(data.from);
        if (data.to) setTo(data.to);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        setBrief(null);
      } finally {
        setBusy(false);
      }
    },
    [masterToken],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div>
      {!compact && <h4>Бриф сессии</h4>}
      <p className="hint">
        Diff двух снимков <code>data/turns/</code> (backupTurnSnapshot): дипло,
        исследования, казна, открытые квесты.
      </p>
      {backups.length > 0 && (
        <div className="gmsys-row" style={{ marginBottom: 6, gap: 6 }}>
          <label className="hint">
            От{" "}
            <select
              className="gmsys-select-sm"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            >
              {backups.map((b) => (
                <option key={`f-${b}`} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          <label className="hint">
            К{" "}
            <select
              className="gmsys-select-sm"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            >
              {backups.map((b) => (
                <option key={`t-${b}`} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <button
        type="button"
        className="btn ghost"
        disabled={busy}
        onClick={() => void refresh(from || undefined, to || undefined)}
      >
        {busy ? "Сборка…" : "Обновить бриф"}
      </button>
      {err && (
        <p className="hint" style={{ color: "#e07070", marginTop: 6 }}>
          {err}
        </p>
      )}
      {brief?.text && (
        <pre
          className="hint"
          style={{
            marginTop: 8,
            whiteSpace: "pre-wrap",
            maxHeight: compact ? 360 : 420,
            overflow: "auto",
            padding: 8,
            border: "1px solid var(--line-hairline, #2a2a3a)",
            borderRadius: 8,
            background: "color-mix(in srgb, var(--surface-overlay, #101820) 88%, transparent)",
          }}
        >
          {brief.text}
        </pre>
      )}
    </div>
  );
}

export function InterventionsSection({ limit = 30 }: { limit?: number }) {
  const { masterToken } = useCampaignSessionCtx();
  const [entries, setEntries] = useState<Intervention[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/gm/cockpit/interventions?limit=${limit}`,
        { headers: { "X-Master-Token": masterToken } },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setEntries(Array.isArray(data.entries) ? data.entries : []);
      setTotal(Number(data.total) || 0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setEntries([]);
    } finally {
      setBusy(false);
    }
  }, [masterToken, limit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div>
      <h4>Журнал вмешательств GM</h4>
      <p className="hint">
        Append-only лог правок баланса (setAp / startStock / forceMult /
        alchemy) · всего {total}
      </p>
      <button
        type="button"
        className="btn ghost"
        disabled={busy}
        onClick={() => void refresh()}
      >
        {busy ? "Обновление…" : "Обновить"}
      </button>
      {err && (
        <p className="hint" style={{ color: "#e07070", marginTop: 6 }}>
          {err}
        </p>
      )}
      {entries.length === 0 && !busy && !err && (
        <p className="hint" style={{ marginTop: 6 }}>
          Записей пока нет — сделайте правку в Atelier · Баланс.
        </p>
      )}
      {entries.length > 0 && (
        <ul
          className="hint"
          style={{
            paddingLeft: 16,
            marginTop: 8,
            maxHeight: 280,
            overflow: "auto",
          }}
        >
          {entries.map((e) => (
            <li key={e.id} style={{ marginBottom: 6 }}>
              <strong>{e.action}</strong> · {fmtWhen(e.at)} · {e.actor}
              <br />
              <span>
                {shortJson(e.before)} → {shortJson(e.after)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type DryRunEconomyRow = {
  factionId: string;
  name: string;
  income: number;
  expense: number;
  net: number;
};

type DryRunStockDiff = {
  factionId: string;
  name: string;
  delta: Record<string, number>;
  changed: boolean;
};

type DryRunResult = {
  ok: boolean;
  error?: string;
  dryRun?: boolean;
  applied?: boolean;
  turnFrom?: number;
  turnTo?: number;
  economy?: DryRunEconomyRow[];
  stockDiffs?: DryRunStockDiff[];
  eventCount?: number;
  note?: string;
  scratchDir?: string;
  safetyDir?: string;
};

function fmtDelta(n: number): string {
  if (!n) return "0";
  return n > 0 ? `+${n}` : String(n);
}

/** GM treasury peg rate dial — writes `world.meta.gmPegMultipliers` (master token). */
export function PegMultiplierSection() {
  const { masterToken, setSyncMsg } = useCampaignSessionCtx();
  const [resources, setResources] = useState<
    Array<{ id: string; name: string; multiplier: number; peggedBy: string[] }>
  >([]);
  const [min, setMin] = useState(0.8);
  const [max, setMax] = useState(1.5);
  const [fallback, setFallback] = useState(1);
  const [resourceId, setResourceId] = useState("map.solari");
  const [multiplier, setMultiplier] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/gm/peg-multipliers", {
      headers: { "X-Master-Token": masterToken },
    });
    const data = await res.json();
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || res.statusText);
    }
    const rows = Array.isArray(data.resources) ? data.resources : [];
    setResources(rows);
    if (Number.isFinite(Number(data.min))) setMin(Number(data.min));
    if (Number.isFinite(Number(data.max))) setMax(Number(data.max));
    if (Number.isFinite(Number(data.default))) setFallback(Number(data.default));
    return rows as Array<{
      id: string;
      name: string;
      multiplier: number;
      peggedBy: string[];
    }>;
  }, [masterToken]);

  useEffect(() => {
    void refresh()
      .then((rows) => {
        const current =
          rows.find((r) => r.id === resourceId) ||
          rows.find((r) => r.peggedBy?.length) ||
          rows[0];
        if (current) {
          setResourceId(current.id);
          setMultiplier(Number(current.multiplier) || 1);
        }
        setErr(null);
      })
      .catch((e) => {
        setErr(e instanceof Error ? e.message : String(e));
      });
    // resourceId is seed-only; re-fetch on token change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  const pickResource = (id: string) => {
    setResourceId(id);
    const row = resources.find((r) => r.id === id);
    setMultiplier(Number(row?.multiplier) || fallback);
  };

  const submit = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/gm/peg-multiplier", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Token": masterToken,
        },
        body: JSON.stringify({ resourceId, multiplier }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || res.statusText);
      }
      const applied = Number(data.multiplier);
      setMultiplier(applied);
      setLast(`${data.resourceId} × ${applied}`);
      setSyncMsg(`Peg ${data.resourceId} × ${applied}`);
      const rows = await refresh();
      const row = rows.find((r) => r.id === data.resourceId);
      if (row) setMultiplier(Number(row.multiplier) || applied);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [masterToken, multiplier, refresh, resourceId, setSyncMsg]);

  const selected = resources.find((r) => r.id === resourceId);

  return (
    <div>
      <h4>Курс казны (peg)</h4>
      <p className="hint">
        Множитель обмена якорного ресурса в металл/снабжение. Clamp{" "}
        {min}–{max} на сервере. Пишется в{" "}
        <code>world.meta.gmPegMultipliers</code>.
      </p>
      <div className="gmsys-row" style={{ gap: 8, marginTop: 6, flexWrap: "wrap" }}>
        <label className="hint">
          Ресурс{" "}
          <select
            className="gmsys-select-sm"
            value={resourceId}
            onChange={(e) => pickResource(e.target.value)}
          >
            {resources.length === 0 && (
              <option value={resourceId}>{resourceId}</option>
            )}
            {resources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.id})
                {r.peggedBy?.length ? " · в игре" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="hint">
          × {multiplier.toFixed(2)}{" "}
          <input
            type="range"
            min={min}
            max={max}
            step={0.05}
            value={multiplier}
            onChange={(e) => setMultiplier(Number(e.target.value))}
            style={{ width: 140, verticalAlign: "middle" }}
          />
        </label>
        <button
          type="button"
          className="btn ghost"
          disabled={busy}
          onClick={() => setMultiplier(fallback)}
        >
          Сброс {fallback}
        </button>
        <button
          type="button"
          className="btn ghost"
          disabled={busy}
          onClick={() => void submit()}
        >
          {busy ? "…" : "Записать"}
        </button>
      </div>
      {selected?.peggedBy?.length ? (
        <p className="hint" style={{ marginTop: 6 }}>
          Peg фракций: {selected.peggedBy.join(", ")}
        </p>
      ) : null}
      {last && (
        <p className="hint" style={{ marginTop: 6 }}>
          Последнее: {last}
        </p>
      )}
      {err && (
        <p className="hint" style={{ color: "#e07070", marginTop: 6 }}>
          {err}
        </p>
      )}
    </div>
  );
}

/** B9 — GM «касание Хивера»: выдать Путь Силы фракции. */
export function PowerTouchSection() {
  const { masterToken, setSyncMsg } = useCampaignSessionCtx();
  const [factionId, setFactionId] = useState("f1");
  const [powerPath, setPowerPath] = useState("shadow");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/gm/grant-power-touch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Token": masterToken,
        },
        body: JSON.stringify({ factionId, powerPath }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || res.statusText);
      }
      const paths = Array.isArray(data.powerPaths)
        ? data.powerPaths.join(", ")
        : powerPath;
      setLast(paths);
      setSyncMsg(`Путь Силы «${powerPath}» → ${factionId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [factionId, masterToken, powerPath, setSyncMsg]);

  return (
    <div>
      <h4>Касание Хивера</h4>
      <p className="hint">
        Выдать фракции Путь Силы (ledger). Расовые дефолты — в{" "}
        <code>races.json</code>.
      </p>
      <div className="gmsys-row" style={{ gap: 8, marginTop: 6, flexWrap: "wrap" }}>
        <label className="hint">
          Фракция{" "}
          <input
            className="gmsys-input-sm"
            value={factionId}
            onChange={(e) => setFactionId(e.target.value)}
            style={{ width: 72 }}
          />
        </label>
        <label className="hint">
          Путь{" "}
          <select
            className="gmsys-select-sm"
            value={powerPath}
            onChange={(e) => setPowerPath(e.target.value)}
          >
            <option value="mind">Разум</option>
            <option value="will">Воля</option>
            <option value="chaos">Хаотетика</option>
            <option value="shadow">Теневодство</option>
          </select>
        </label>
        <button
          type="button"
          className="btn ghost"
          disabled={busy}
          onClick={() => void submit()}
        >
          {busy ? "…" : "Выдать"}
        </button>
      </div>
      {last && (
        <p className="hint" style={{ marginTop: 6 }}>
          Активные пути: {last}
        </p>
      )}
      {err && (
        <p className="hint" style={{ color: "#e07070", marginTop: 6 }}>
          {err}
        </p>
      )}
    </div>
  );
}

/** C5 T5.3 — dry-run tick button + income/expense / stock diffs (health domain). */
export function DryRunSection() {
  const { masterToken, setSyncMsg } = useCampaignSessionCtx();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DryRunResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/gm/cockpit/dry-run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Token": masterToken,
        },
        body: "{}",
      });
      const data = (await res.json()) as DryRunResult;
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || res.statusText);
      }
      setResult(data);
      setSyncMsg(
        `Пробный тик ${data.turnFrom ?? "?"}→${data.turnTo ?? "?"} (не применён)`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      setResult(null);
      setSyncMsg(`Dry-run: ${msg}`);
    } finally {
      setBusy(false);
    }
  }, [masterToken, setSyncMsg]);

  const changedStocks = (result?.stockDiffs ?? []).filter((r) => r.changed);

  return (
    <div>
      <h4>Пробный прогон хода</h4>
      <p className="hint">
        Копия через <code>backupTurnSnapshot</code> → полный{" "}
        <code>processTurn</code> → diff доходов/расходов → восстановление live
        из <code>pre_dry_run</code>. Боевые ledger / published / intents не
        меняются.
      </p>
      <button
        type="button"
        className="btn ghost"
        disabled={busy}
        onClick={() => void run()}
      >
        {busy ? "Прогон…" : "Прогнать пробно"}
      </button>
      {err && (
        <p className="hint" style={{ color: "#e07070", marginTop: 6 }}>
          {err}
        </p>
      )}
      {result?.ok && (
        <div className="order-card" style={{ marginTop: 8 }}>
          <strong>
            Ход {result.turnFrom ?? "?"}→{result.turnTo ?? "?"}
          </strong>
          <span className="hint">
            {" "}
            · событий {result.eventCount ?? 0} · не применено
          </span>
          {result.note && (
            <p className="hint" style={{ marginTop: 4 }}>
              {result.note}
            </p>
          )}
          {(result.economy?.length ?? 0) > 0 && (
            <>
              <h4 style={{ marginTop: 10 }}>Доходы / расходы (тик)</h4>
              <table className="gm-balance-table">
                <thead>
                  <tr>
                    <th>Фракция</th>
                    <th>Доход</th>
                    <th>Расход</th>
                    <th>Нетто</th>
                  </tr>
                </thead>
                <tbody>
                  {result.economy!.map((r) => (
                    <tr key={r.factionId}>
                      <td>{r.name}</td>
                      <td className="tabular">{r.income}</td>
                      <td className="tabular">{r.expense}</td>
                      <td className="tabular">{fmtDelta(r.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {changedStocks.length > 0 && (
            <>
              <h4 style={{ marginTop: 10 }}>Сдвиг запасов</h4>
              <table className="gm-balance-table">
                <thead>
                  <tr>
                    <th>Фракция</th>
                    <th>Металл</th>
                    <th>Когн.</th>
                    <th>Материя</th>
                    <th>Энергия</th>
                    <th>Биос</th>
                    <th>Снабж.</th>
                  </tr>
                </thead>
                <tbody>
                  {changedStocks.map((r) => (
                    <tr key={r.factionId}>
                      <td>{r.name}</td>
                      <td className="tabular">
                        {fmtDelta(r.delta["currency.metal"] ?? 0)}
                      </td>
                      <td className="tabular">
                        {fmtDelta(r.delta["currency.cognitio"] ?? 0)}
                      </td>
                      <td className="tabular">
                        {fmtDelta(r.delta["currency.materia"] ?? 0)}
                      </td>
                      <td className="tabular">
                        {fmtDelta(r.delta["currency.energia"] ?? 0)}
                      </td>
                      <td className="tabular">
                        {fmtDelta(r.delta["currency.bios"] ?? 0)}
                      </td>
                      <td className="tabular">
                        {fmtDelta(r.delta["currency.supply"] ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {result.ok &&
            !(result.economy?.length) &&
            changedStocks.length === 0 && (
              <p className="hint" style={{ marginTop: 6 }}>
                Метрики без изменений (пустая экономика или нет фракций).
              </p>
            )}
        </div>
      )}
    </div>
  );
}
