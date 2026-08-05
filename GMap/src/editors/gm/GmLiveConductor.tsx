import { useState } from "react";
import { useWorldStore } from "../../state/worldStore";
import { useCampaignSessionCtx } from "../CampaignSessionContext";
import { DICE_PRESETS } from "./gmDice";
import { GmBeatSheet } from "./GmBeatSheet";
import { GmPlayerVision } from "./GmPlayerVision";
import type { GmLiveDomainId } from "../../state/types";
import type { EditorTool } from "../../state/types";

const LIVE_BRUSHES: { id: EditorTool; label: string; hint: string }[] = [
  { id: "select", label: "Выбор", hint: "Клик — выбрать систему" },
  {
    id: "fog_paint",
    label: "Туман+",
    hint: "Скрыть систему для активной фракции",
  },
  {
    id: "fog_erase",
    label: "Туман−",
    hint: "Открыть систему для активной фракции",
  },
  {
    id: "consequence_paint",
    label: "Последствие",
    hint: "Кисть consequence на систему",
  },
];

function rollDie(sides: number): number {
  return 1 + Math.floor(Math.random() * sides);
}

/**
 * Live left-rail conductor: focus · table actions · brushes · apply-build.
 * Domains stay on the map verb deck / F-keys — not dumped here.
 */
export function GmLiveConductor({
  onOpenDomain,
  onRequestTick,
}: {
  onOpenDomain?: (id: GmLiveDomainId) => void;
  onRequestTick?: () => void;
}) {
  const world = useWorldStore((s) => s.world);
  const activeFactionId = useWorldStore((s) => s.activeFactionId);
  const setActiveFaction = useWorldStore((s) => s.setActiveFaction);
  const selectedSystemId = useWorldStore((s) => s.selectedSystemId);
  const focusCameraOnSystem = useWorldStore((s) => s.focusCameraOnSystem);
  const openRpForFaction = useWorldStore((s) => s.openRpForFaction);
  const tool = useWorldStore((s) => s.tool);
  const setTool = useWorldStore((s) => s.setTool);
  const setActiveConsequencePresetId = useWorldStore(
    (s) => s.setActiveConsequencePresetId,
  );
  const setShowFogPreview = useWorldStore((s) => s.setShowFogPreview);
  const setGmOmniscientView = useWorldStore((s) => s.setGmOmniscientView);

  const { setSyncMsg, onApplyBuild } = useCampaignSessionCtx();
  const gmGesturesEnabled = useWorldStore((s) => s.gmGesturesEnabled);
  const setGmGesturesEnabled = useWorldStore((s) => s.setGmGesturesEnabled);
  const [applyBusy, setApplyBusy] = useState(false);
  const [lastRoll, setLastRoll] = useState<string | null>(null);
  const [brushesOpen, setBrushesOpen] = useState(false);

  const faction =
    world.factions.find((f) => f.id === activeFactionId) ?? null;
  const system =
    world.systems.find((s) => s.id === selectedSystemId) ?? null;

  const applyBuild = async () => {
    setApplyBusy(true);
    try {
      await onApplyBuild();
    } finally {
      setApplyBusy(false);
    }
  };

  return (
    <div className="gm-conductor">
      <section className="gm-conductor-block">
        <h3>Фокус</h3>
        <label className="field">
          <span>Держава</span>
          <select
            value={activeFactionId ?? ""}
            onChange={(e) => setActiveFaction(e.target.value || null)}
          >
            {world.factions.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        {faction && (
          <p className="hint gm-conductor-focus-line">
            <span
              className="gm-command-swatch"
              style={{ background: faction.color }}
            />
            {faction.name}
            {system ? ` · ${system.name}` : " · система не выбрана"}
          </p>
        )}
        <div className="btn-col">
          <button
            type="button"
            className="btn ghost block"
            disabled={!system}
            onClick={() => system && focusCameraOnSystem(system.id)}
          >
            Центр на системе
          </button>
          <button
            type="button"
            className="btn ghost block"
            disabled={!faction}
            onClick={() => openRpForFaction(faction?.id ?? null)}
          >
            Сцена · держава
          </button>
        </div>
      </section>

      <section className="gm-conductor-block">
        <h3>Линза игрока</h3>
        <GmPlayerVision compact />
      </section>

      <section className="gm-conductor-block">
        <h3>Сценарий хода</h3>
        <GmBeatSheet
          onRequestTick={onRequestTick}
          onOpenInbox={() => onOpenDomain?.("inbox")}
        />
      </section>

      <section className="gm-conductor-block">
        <h3>Сессия</h3>
        <label className="field">
          <span>Номер хода</span>
          <input
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={world.meta.turn}
            title="Календарный ход без симуляции тика"
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) {
                useWorldStore.getState().setCampaignTurn(n);
              }
            }}
          />
        </label>
        <div className="btn-col">
          <button
            type="button"
            className="btn primary block"
            disabled={applyBusy}
            onClick={() => void applyBuild()}
            title="Сохранить мир + перечитать content + bump rev для игроков"
          >
            {applyBusy ? "Применяю…" : "Применить билд"}
          </button>
          <p className="hint">
            Сохраняет стол и обновляет каталоги. Игроки в /view подхватят rev.
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={gmGesturesEnabled}
              onChange={(e) => setGmGesturesEnabled(e.target.checked)}
            />
            Жесты на карте (wells / drag)
          </label>
          <button
            type="button"
            className="btn ghost block"
            onClick={() => onRequestTick?.()}
          >
            Закрыть ход · превью
          </button>
          <button
            type="button"
            className="btn ghost block"
            onClick={() => useWorldStore.getState().setRpFloatOpen(true)}
          >
            Открыть связь
          </button>
          {onOpenDomain && (
            <button
              type="button"
              className="btn ghost block"
              onClick={() => onOpenDomain("inbox")}
            >
              Очередь (F1)
            </button>
          )}
        </div>

        <div className="gm-conductor-dice">
          <span className="hint">Кубик</span>
          <div className="gm-conductor-dice-row">
            {DICE_PRESETS.map((d) => (
              <button
                key={d.sides}
                type="button"
                className="btn ghost"
                onClick={() => {
                  const n = rollDie(d.sides);
                  setLastRoll(`${d.label}: ${n}`);
                  setSyncMsg(`Бросок ${d.label} → ${n}`);
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
          {lastRoll && <p className="hint tabular">{lastRoll}</p>}
        </div>
      </section>

      <section className="gm-conductor-block">
        <button
          type="button"
          className="tool-section-toggle"
          aria-expanded={brushesOpen}
          onClick={() => setBrushesOpen((v) => !v)}
        >
          <h3>Кисти карты</h3>
          <span className="hint">{brushesOpen ? "▾" : "▸"}</span>
        </button>
        {brushesOpen && (
          <div className="tool-grid" style={{ marginTop: 8 }}>
            {LIVE_BRUSHES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={tool === t.id ? "tool active" : "tool"}
                title={t.hint}
                onClick={() => {
                  setTool(t.id);
                  if (t.id === "consequence_paint") {
                    setActiveConsequencePresetId("after_battle");
                  }
                  if (t.id === "fog_paint" || t.id === "fog_erase") {
                    setShowFogPreview(true);
                    setGmOmniscientView(true);
                    setSyncMsg(
                      `${t.label}: клик по системе · держава «${faction?.name ?? "—"}». Свои миры туман не скрывает.`,
                    );
                  }
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        <p className="hint" style={{ marginTop: 6 }}>
          Домены — колода снизу карты или F2–F9.
        </p>
      </section>
    </div>
  );
}
