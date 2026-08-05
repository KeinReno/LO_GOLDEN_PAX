import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorldStore } from "../state/worldStore";
import type { StarSystem } from "../state/types";
import { useCampaignSessionCtx } from "./CampaignSessionContext";
import { GmSeedPanel } from "./gm/GmSeedPanel";

type Preset = { id: string; name: string };

type TimerRow = {
  systemId: string;
  systemName: string;
  id: string;
  label: string;
  expiresTurn: number;
  turnsLeft: number;
};

function collectUpcomingTimers(
  systems: StarSystem[],
  currentTurn: number,
  filterIds: string[] | null,
): TimerRow[] {
  const idSet = filterIds?.length ? new Set(filterIds) : null;
  const rows: TimerRow[] = [];
  for (const sys of systems) {
    if (idSet && !idSet.has(sys.id)) continue;
    for (const t of sys.timers ?? []) {
      rows.push({
        systemId: sys.id,
        systemName: sys.name,
        id: t.id,
        label: t.label?.trim() || "—",
        expiresTurn: t.expiresTurn,
        turnsLeft: Math.max(0, t.expiresTurn - currentTurn),
      });
    }
  }
  return rows.sort(
    (a, b) =>
      a.expiresTurn - b.expiresTurn ||
      a.systemName.localeCompare(b.systemName, "ru"),
  );
}

function patchSystemTimers(
  updates: { id: string; timers: StarSystem["timers"] }[],
) {
  const map = new Map(updates.map((u) => [u.id, u.timers]));
  useWorldStore.setState((s) => ({
    world: {
      ...s.world,
      systems: s.world.systems.map((sys) => {
        const timers = map.get(sys.id);
        return timers ? { ...sys, timers } : sys;
      }),
    },
  }));
}

export function GmOpsPanel() {
  const world = useWorldStore((s) => s.world);
  const selectedSystemId = useWorldStore((s) => s.selectedSystemId);
  const selectedSystemIds = useWorldStore((s) => s.selectedSystemIds);
  const presetId = useWorldStore((s) => s.activeConsequencePresetId);
  const setPresetId = useWorldStore((s) => s.setActiveConsequencePresetId);
  const setTool = useWorldStore((s) => s.setTool);
  const { masterToken, setSyncMsg } = useCampaignSessionCtx();

  const [consequences, setConsequences] = useState<Record<string, Preset>>({});
  const [systemPresets, setSystemPresets] = useState<Record<string, Preset>>(
    {},
  );
  const [gmNote, setGmNote] = useState("");
  const [timerTurns, setTimerTurns] = useState(3);
  const [timerLabel, setTimerLabel] = useState("");
  const [scopeBoard, setScopeBoard] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/content");
      if (!res.ok) return;
      const c = await res.json();
      setConsequences(c.consequences || {});
      setSystemPresets(c.system_presets || {});
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const ids =
    selectedSystemIds.length > 0
      ? selectedSystemIds
      : selectedSystemId
        ? [selectedSystemId]
        : [];

  const currentTurn = world.meta?.turn ?? 0;
  const timerRows = useMemo(
    () =>
      collectUpcomingTimers(
        world.systems,
        currentTurn,
        scopeBoard || !ids.length ? null : ids,
      ),
    [world.systems, currentTurn, scopeBoard, ids],
  );

  const sys = world.systems.find((s) => s.id === selectedSystemId);

  useEffect(() => {
    if (ids.length !== 1) {
      setGmNote("");
      return;
    }
    setGmNote(sys?.gmNotes ?? "");
  }, [ids.length, sys?.id, sys?.gmNotes]);

  const paintPreset = async (id: string) => {
    if (!ids.length) {
      setSyncMsg("Выберите систему(ы) на карте");
      return;
    }
    try {
      const res = await fetch("/api/narrative/paint", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Token": masterToken,
        },
        body: JSON.stringify({ presetId: id, systemIds: ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setSyncMsg(`Пресет ${id} → ${data.touched ?? ids.length} систем`);
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const saveGmNote = async () => {
    if (!ids.length) {
      setSyncMsg("Выберите систему");
      return;
    }
    try {
      const res = await fetch("/api/narrative/gm-note", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Token": masterToken,
        },
        body: JSON.stringify({ systemIds: ids, gmNotes: gmNote }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      useWorldStore.setState((s) => ({
        world: {
          ...s.world,
          systems: s.world.systems.map((row) =>
            ids.includes(row.id) ? { ...row, gmNotes: gmNote } : row,
          ),
        },
      }));
      setSyncMsg(`GM-заметка на ${data.count} систем(ы)`);
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const addTimer = async () => {
    if (!ids.length) {
      setSyncMsg("Выберите систему(ы)");
      return;
    }
    const label = timerLabel.trim() || "GM-таймер";
    try {
      const res = await fetch("/api/narrative/timer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Token": masterToken,
        },
        body: JSON.stringify({
          systemIds: ids,
          turns: timerTurns,
          action: { kind: "clear_activity" },
          label,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        systems?: { id: string; timers: StarSystem["timers"] }[];
        count?: number;
      };
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (data.systems?.length) patchSystemTimers(data.systems);
      setSyncMsg(
        `Таймер «${label}» через ${timerTurns} ход(ов) · ${data.count ?? ids.length} систем`,
      );
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="gm-ops-panel">
      <GmSeedPanel />

      <hr className="gm-ops-divider" />

      <h3>GM · нарратив</h3>
      <p className="hint">
        Consequence brush, пресеты, скрытые заметки, таймеры узлов. Игроки не
        видят notes/gmNotes/timers.
      </p>

      <label className="field">
        <span>Пресет кисти «Последствие»</span>
        <select
          value={presetId ?? ""}
          onChange={(e) => {
            setPresetId(e.target.value || null);
            setTool("consequence_paint");
          }}
        >
          <optgroup label="Последствия">
            {Object.values(consequences).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Шаблоны систем">
            {Object.values(systemPresets).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <button
        type="button"
        className="btn ghost"
        onClick={() => setTool("consequence_paint")}
      >
        Кисть последствия
      </button>
      <button
        type="button"
        className="btn ghost"
        disabled={!ids.length || !presetId}
        onClick={() => void paintPreset(presetId!)}
      >
        Применить к выделенным
      </button>

      {sys && (
        <div className="order-card" style={{ marginTop: 8 }}>
          <strong>{sys.name}</strong>
          <br />
          <span className="hint">
            таймеры: {(sys.timers || []).length} · gmNotes:{" "}
            {sys.gmNotes ? "есть" : "—"}
          </span>
        </div>
      )}

      <div className="gm-timer-block" style={{ marginTop: 8 }}>
        <div className="gm-timer-head">
          <strong>Таймлайн</strong>
          <label className="hint gm-timer-scope">
            <input
              type="checkbox"
              checked={scopeBoard}
              onChange={(e) => setScopeBoard(e.target.checked)}
            />
            вся карта
          </label>
        </div>
        {timerRows.length === 0 ? (
          <p className="hint">Нет активных таймеров</p>
        ) : (
          <ul className="gm-timer-list">
            {timerRows.map((row) => (
              <li key={row.id} className="gm-timer-row">
                <span className="gm-timer-due" title={`Ход ${row.expiresTurn}`}>
                  {row.turnsLeft === 0 ? "сейчас" : `+${row.turnsLeft}`}
                </span>
                <span className="gm-timer-label">{row.label}</span>
                <span className="gm-timer-sys hint">{row.systemName}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <label className="field" style={{ marginTop: 8 }}>
        <span>GM-заметка (скрыта от игроков)</span>
        <textarea
          rows={2}
          value={gmNote}
          onChange={(e) => setGmNote(e.target.value)}
          placeholder="только мастер…"
        />
      </label>
      <button type="button" className="btn ghost" onClick={() => void saveGmNote()}>
        Сохранить заметку
      </button>

      <label className="field" style={{ marginTop: 8 }}>
        <span>Новый таймер — подпись</span>
        <input
          type="text"
          value={timerLabel}
          onChange={(e) => setTimerLabel(e.target.value)}
          placeholder="например: конец блокады"
        />
      </label>
      <label className="field">
        <span>Через N ходов</span>
        <input
          type="number"
          min={1}
          max={20}
          value={timerTurns}
          onChange={(e) => setTimerTurns(Number(e.target.value) || 1)}
        />
      </label>
      <button
        type="button"
        className="btn ghost"
        disabled={!ids.length}
        onClick={() => void addTimer()}
      >
        Добавить таймер к выделенным
      </button>
    </section>
  );
}
