import { useCallback, useEffect, useState } from "react";
import { useWorldStore } from "../state/worldStore";
import { useCampaignSessionCtx } from "./CampaignSessionContext";
import { apPerTurn, fetchContent } from "../state/contentCatalog";
import { intentLabel } from "./intentLabels";
import {
  formatOdCost,
  formatOdMeter,
  TURN_RESOLVE_HINT,
} from "../state/playerUiTerms";
import {
  contestedIntentIdSet,
  findContestedIntentGroups,
} from "./gm/contestedIntents";

export type IntentRow = {
  id: string;
  defId: string;
  factionId: string;
  turn: number;
  status: string;
  apCost?: number;
  payload?: {
    toSystemId?: string;
    fleetId?: string;
    systemId?: string;
    currencyId?: string;
    giveCurrency?: string;
    wantCurrency?: string;
    fromCurrency?: string;
    toCurrency?: string;
    offerId?: string;
    taxSlot?: string;
    upgradeId?: string;
    techId?: string;
  };
  note?: string;
  submittedAt?: string;
};

export function usePendingIntents() {
  const world = useWorldStore((s) => s.world);
  const { masterToken, setSyncMsg } = useCampaignSessionCtx();
  const [intents, setIntents] = useState<IntentRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [apCap, setApCap] = useState(15);

  const refresh = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setBusy(true);
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
      if (!opts?.quiet) setBusy(false);
    }
  }, [masterToken, setSyncMsg]);

  useEffect(() => {
    void refresh({ quiet: true });
  }, [refresh, world.meta.turn, world.meta.tableRevision]);

  // Dock: poll — player orders do not bump tableRevision.
  useEffect(() => {
    const id = window.setInterval(() => void refresh({ quiet: true }), 5000);
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
  const { setSyncMsg } = useCampaignSessionCtx();
  const focusCameraOnSystem = useWorldStore((s) => s.focusCameraOnSystem);
  const openRpForFaction = useWorldStore((s) => s.openRpForFaction);
  const [arbiterRolls, setArbiterRolls] = useState<
    Record<string, { factionId: string; factionName: string; roll: number }[]>
  >({});

  const rollArbiter = (group: import("./gm/contestedIntents").ContestedIntentGroup) => {
    const rolls = group.factionIds.map((fid) => {
      const name = world.factions.find((f) => f.id === fid)?.name || fid;
      return {
        factionId: fid,
        factionName: name,
        roll: 1 + Math.floor(Math.random() * 100),
      };
    });
    rolls.sort((a, b) => b.roll - a.roll);
    setArbiterRolls((prev) => ({ ...prev, [group.id]: rolls }));
    const winner = rolls[0];
    if (winner) {
      setSyncMsg(
        `🎲 Арбитраж [${group.claimLabel}]: Победа «${winner.factionName}» (бросок ${winner.roll})`,
      );
    }
  };

  useEffect(() => {
    onPendingCount?.(pending.length);
  }, [pending.length, onPendingCount]);

  const byFaction = new Map<string, IntentRow[]>();
  for (const i of pending) {
    const list = byFaction.get(i.factionId) ?? [];
    list.push(i);
    byFaction.set(i.factionId, list);
  }

  const contestedGroups = findContestedIntentGroups(pending);
  const contestedById = contestedIntentIdSet(contestedGroups);

  const factions =
    variant === "dock"
      ? world.factions
      : world.factions.filter((f) => (byFaction.get(f.id) ?? []).length > 0);

  return (
    <section className={`intents-inbox intents-inbox--${variant}`}>
      {variant === "panel" && (
        <>
          <h3>Приказы хода {world.meta.turn}</h3>
          <p className="hint">
            До {apCap} ОД империи за ход (+ ОД сил для флотов/легионов).{" "}
            {TURN_RESOLVE_HINT}
          </p>
        </>
      )}
      {contestedGroups.length > 0 && (
        <div
          className="intents-contested-banner"
          role="status"
          aria-label="Спорные приказы"
        >
          <span className="intents-contested-icon" aria-hidden>
            ⚔
          </span>
          <div style={{ flex: "1 1 auto" }}>
            <strong>Спорные приказы & Арбитраж</strong>
            <p className="hint" style={{ margin: "2px 0 6px" }}>
              {contestedGroups.length} конфликт
              {contestedGroups.length === 1
                ? ""
                : contestedGroups.length < 5
                  ? "а"
                  : "ов"}{" "}
              одного ранга на один таргет/ресурс до резолва.
            </p>
            <div className="intents-contested-summary" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {contestedGroups.map((g) => {
                const sysId = g.claimKey.startsWith("sys:") ? g.claimKey.slice(4) : null;
                const sys = sysId ? world.systems.find((s) => s.id === sysId) : null;
                const rolls = arbiterRolls[g.id];
                return (
                  <div
                    key={g.id}
                    style={{
                      background: "var(--surface-overlay)",
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span>
                        <strong>ранг {g.rank}</strong> ·{" "}
                        {sys ? (
                          <button
                            type="button"
                            className="btn tiny ghost"
                            style={{ display: "inline-flex", padding: "1px 6px" }}
                            onClick={() => focusCameraOnSystem(sys.id)}
                            title="Фокус камеры"
                          >
                            🪐 {sys.name}
                          </button>
                        ) : (
                          g.claimLabel
                        )}{" "}
                        · {g.intents.length} прик.
                      </span>
                      <button
                        type="button"
                        className="btn tiny primary"
                        onClick={() => rollArbiter(g)}
                        title="Бросить кубики d100 для разрешения спора"
                      >
                        🎲 Бросок GM
                      </button>
                    </div>
                    {rolls && (
                      <div
                        style={{
                          marginTop: 4,
                          padding: "4px 6px",
                          background: "var(--surface-tooltip)",
                          borderRadius: 4,
                          fontSize: "0.78rem",
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        <span style={{ color: "var(--signal-build)", fontWeight: 700 }}>Результат:</span>
                        {rolls.map((r, rIdx) => (
                          <span
                            key={r.factionId}
                            style={{
                              fontWeight: rIdx === 0 ? 700 : 400,
                              color: rIdx === 0 ? "var(--signal-build)" : "var(--muted)",
                            }}
                          >
                            {rIdx === 0 ? "👑 " : ""}
                            {r.factionName}: {r.roll}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
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
                <span className="hint">{formatOdMeter(0, apCap)}</span>
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
                {formatOdMeter(used, apCap)}
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
                  const contested = contestedById.get(i.id);
                  return (
                    <li
                      key={i.id}
                      className={`intents-row${contested ? " intents-row--contested" : ""}`}
                    >
                      <div className="intents-row-body">
                        <strong>
                          {contested ? (
                            <span
                              className="intents-contested-badge"
                              title={`Спор: ${contested.claimLabel}`}
                            >
                              ⚔ Спор
                            </span>
                          ) : null}
                          {intentLabel(i.defId)}
                        </strong>
                        <span className="hint">
                          {[
                            fleetName,
                            toName !== "—" ? toName : null,
                            contested ? contested.claimLabel : null,
                            i.apCost != null ? formatOdCost(i.apCost) : null,
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
