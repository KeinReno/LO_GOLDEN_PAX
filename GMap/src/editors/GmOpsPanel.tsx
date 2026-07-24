import { useCallback, useEffect, useState } from "react";
import { useWorldStore } from "../state/worldStore";
import { useCampaignSessionCtx } from "./CampaignSessionContext";

type Preset = { id: string; name: string };

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
      setSyncMsg(`GM-заметка на ${data.count} систем(ы)`);
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const addTimer = async () => {
    const systemId = ids[0];
    if (!systemId) {
      setSyncMsg("Выберите систему");
      return;
    }
    try {
      const res = await fetch("/api/narrative/timer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Token": masterToken,
        },
        body: JSON.stringify({
          systemId,
          turns: timerTurns,
          action: { kind: "clear_activity" },
          label: "GM timer",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setSyncMsg(`Таймер +${timerTurns} хода на систему`);
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const sys = world.systems.find((s) => s.id === selectedSystemId);

  return (
    <section>
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
        <span>Таймер (ходы)</span>
        <input
          type="number"
          min={1}
          max={20}
          value={timerTurns}
          onChange={(e) => setTimerTurns(Number(e.target.value) || 1)}
        />
      </label>
      <button type="button" className="btn ghost" onClick={() => void addTimer()}>
        Закрыть активность через N ходов
      </button>
    </section>
  );
}
