import { useCallback, useEffect, useState } from "react";
import { useWorldStore } from "../state/worldStore";
import { useCampaignSessionCtx } from "./CampaignSessionContext";
import { apPerTurn, fetchContent } from "../state/contentCatalog";
import { intentLabel } from "./intentLabels";

export type IntentRow = {
  id: string;
  defId: string;
  factionId: string;
  turn: number;
  status: string;
  apCost?: number;
  payload?: { toSystemId?: string; fleetId?: string; systemId?: string };
  note?: string;
  submittedAt?: string;
};

export function usePendingIntents() {
  const world = useWorldStore((s) => s.world);
  const { masterToken, setSyncMsg } = useCampaignSessionCtx();
  const [intents, setIntents] = useState<IntentRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [apCap, setApCap] = useState(3);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      await fetchContent();
      setApCap(apPerTurn());
      const res = await fetch("/api/intents", {
        headers: { "X-Master-Token": masterToken },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as IntentRow[];
      const list = Array.isArray(data) ? data : [];
      setIntents(list);
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [masterToken, setSyncMsg]);

  useEffect(() => {
    void refresh();
  }, [refresh, world.meta.turn, world.meta.tableRevision]);

  // Dock: poll — player orders do not bump tableRevision.
  useEffect(() => {
    const id = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const pending = intents.filter((i) => i.status === "pending");
  return { world, intents, pending, busy, apCap, refresh };
}

export function IntentsInbox({
  variant = "panel",
  hideRefresh = false,
  onPendingCount,
}: {
  variant?: "panel" | "dock";
  hideRefresh?: boolean;
  onPendingCount?: (n: number) => void;
}) {
  const { world, pending, busy, apCap, refresh } = usePendingIntents();
  const focusCameraOnSystem = useWorldStore((s) => s.focusCameraOnSystem);
  const openRpForFaction = useWorldStore((s) => s.openRpForFaction);

  useEffect(() => {
    onPendingCount?.(pending.length);
  }, [pending.length, onPendingCount]);

  const byFaction = new Map<string, IntentRow[]>();
  for (const i of pending) {
    const list = byFaction.get(i.factionId) ?? [];
    list.push(i);
    byFaction.set(i.factionId, list);
  }

  const factions =
    variant === "dock"
      ? world.factions
      : world.factions.filter(
          (f) => (byFaction.get(f.id) ?? []).length > 0 || true,
        );

  return (
    <section className={`intents-inbox intents-inbox--${variant}`}>
      {variant === "panel" && (
        <>
          <h3>Приказы хода {world.meta.turn}</h3>
          <p className="hint">
            Лимит AP/ход: {apCap}. Тик применит pending автоматически.
          </p>
        </>
      )}
      {variant === "dock" && busy && (
        <p className="hint live-inbox-busy">Обновляю очередь…</p>
      )}
      {!hideRefresh && (
        <div className="btn-col">
          <button
            type="button"
            className="btn ghost"
            disabled={busy}
            onClick={() => void refresh()}
          >
            {busy ? "Обновляю…" : "Обновить"}
          </button>
        </div>
      )}
      {factions.map((f) => {
        const list = byFaction.get(f.id) ?? [];
        const used = list.reduce((s, i) => s + (i.apCost ?? 0), 0);
        const apPct = Math.min(100, Math.round((used / Math.max(apCap, 1)) * 100));
        if (variant === "dock" && list.length === 0) {
          return (
            <div
              key={f.id}
              className="live-faction-card live-faction-card--quiet"
              style={{ ["--card-faction" as string]: f.color }}
            >
              <div className="live-faction-card-head">
                <strong style={{ color: f.color }}>{f.name}</strong>
                <span className="hint">AP 0/{apCap}</span>
              </div>
              <div className="live-faction-ap">
                <span style={{ width: "0%" }} />
              </div>
              <div className="live-faction-quiet-row">
                <p className="hint live-faction-quiet">тихо</p>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => openRpForFaction(f.id)}
                >
                  В сцену
                </button>
              </div>
            </div>
          );
        }
        return (
          <div
            key={f.id}
            className={`live-faction-card ${list.length ? "has-orders" : ""}`}
            style={{ ["--card-faction" as string]: f.color }}
          >
            <div className="live-faction-card-head">
              <strong style={{ color: f.color }}>{f.name}</strong>
              <span className="hint">
                AP {used}/{apCap}
                {list.length > 0 ? ` · ${list.length}` : ""}
              </span>
            </div>
            <div className="live-faction-ap">
              <span style={{ width: `${apPct}%` }} />
            </div>
            {list.length === 0 ? (
              variant === "panel" ? (
                <p className="hint">нет приказов</p>
              ) : null
            ) : (
              <ul className="intents-list">
                {list.map((i) => {
                  const toId =
                    i.payload?.toSystemId || i.payload?.systemId || null;
                  const toName = toId
                    ? (world.systems.find((s) => s.id === toId)?.name ?? toId)
                    : "—";
                  const fleetName = i.payload?.fleetId
                    ? (world.fleets.find((fl) => fl.id === i.payload?.fleetId)
                        ?.name ?? null)
                    : null;
                  return (
                    <li key={i.id} className="intents-row">
                      <div className="intents-row-body">
                        <strong>{intentLabel(i.defId)}</strong>
                        <span className="hint">
                          {[
                            fleetName,
                            toName !== "—" ? toName : null,
                            i.apCost != null ? `${i.apCost} AP` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                          {i.note ? ` · ${i.note}` : ""}
                        </span>
                      </div>
                      <div className="intents-row-actions">
                        {toId && (
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() => focusCameraOnSystem(toId)}
                          >
                            На карте
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => openRpForFaction(i.factionId)}
                        >
                          В сцену
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
      {pending.length === 0 && variant === "panel" && (
        <p className="hint">Нет приказов в очереди на этот ход.</p>
      )}
    </section>
  );
}
