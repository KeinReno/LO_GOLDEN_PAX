import { useState } from "react";
import { useWorldStore } from "../../state/worldStore";
import { useCampaignSessionCtx } from "../CampaignSessionContext";
import { DICE_PRESETS } from "./gmDice";
import { GmPlayerVision } from "./GmPlayerVision";
import type { GmLiveDomainId } from "../../state/types";

function rollDie(sides: number): number {
  return 1 + Math.floor(Math.random() * sides);
}

/**
 * Session rail: player lens, beat sheet, gestures, dice.
 * Faction / save / tick / RP live in TopBar. Brushes live in Инструменты.
 */
export function GmLiveConductor({
  onOpenDomain,
}: {
  onOpenDomain?: (id: GmLiveDomainId) => void;
}) {
  const selectedSystemId = useWorldStore((s) => s.selectedSystemId);
  const focusCameraOnSystem = useWorldStore((s) => s.focusCameraOnSystem);
  const gmGesturesEnabled = useWorldStore((s) => s.gmGesturesEnabled);
  const setGmGesturesEnabled = useWorldStore((s) => s.setGmGesturesEnabled);
  const system = useWorldStore((s) =>
    s.world.systems.find((sys) => sys.id === s.selectedSystemId),
  );
  const { setSyncMsg } = useCampaignSessionCtx();
  const [lastRoll, setLastRoll] = useState<string | null>(null);

  return (
    <div className="gm-conductor">
      {system && (
        <section className="gm-conductor-block">
          <h3>Фокус</h3>
          <p className="hint gm-conductor-focus-line">{system.name}</p>
          <button
            type="button"
            className="btn ghost block"
            disabled={!selectedSystemId}
            onClick={() => selectedSystemId && focusCameraOnSystem(selectedSystemId)}
          >
            Центр на системе
          </button>
        </section>
      )}

      <section className="gm-conductor-block">
        <h3>Линза игрока</h3>
        <GmPlayerVision compact />
      </section>

      <section className="gm-conductor-block">
        <h3>Сценарий хода</h3>
        <p className="hint">
          Чеклист — чип «сценарий» в полоске сверху.
        </p>
        <button
          type="button"
          className="btn ghost block"
          onClick={() => onOpenDomain?.("inbox")}
        >
          Очередь приказов (F1)
        </button>
      </section>

      <section className="gm-conductor-block">
        <label className="check">
          <input
            type="checkbox"
            checked={gmGesturesEnabled}
            onChange={(e) => setGmGesturesEnabled(e.target.checked)}
          />
          Жесты на карте
        </label>
        <div className="gm-conductor-dice">
          <span className="hint">Кубик</span>
          <div className="gm-conductor-dice-row">
            {DICE_PRESETS.map((d) => (
              <button
                key={d.sides}
                type="button"
                className="gm-mode-btn"
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
    </div>
  );
}
