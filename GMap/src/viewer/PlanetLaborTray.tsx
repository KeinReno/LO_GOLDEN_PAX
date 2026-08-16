import { GESTURE } from "../ui/gestureMap";
import { planetLaborSummary } from "../state/planetLabor";
import type { Planet } from "../state/types";
import type { BuildingDef } from "./PlayerPlanetManage";

export type LaborDragFrom = "idle" | string;

type Props = {
  planet: Planet;
  catalog: Record<string, BuildingDef>;
  busy?: boolean;
  pickFrom: LaborDragFrom | null;
  dragging?: boolean;
  onPickIdle: () => void;
  onDragIdle: (clientX: number, clientY: number, amount: number) => void;
};

const TOKEN_CAP = 12;

/**
 * Idle labor tray — Endless-style pop bar. Tokens are job-slot units.
 */
export function PlanetLaborTray({
  planet,
  catalog,
  busy,
  pickFrom,
  dragging,
  onPickIdle,
  onDragIdle,
}: Props) {
  const sum = planetLaborSummary(planet, catalog);
  const shown = Math.min(TOKEN_CAP, Math.floor(sum.free));
  const extra = Math.max(0, Math.floor(sum.free) - shown);
  const armed = pickFrom === "idle";

  return (
    <div
      className={`planet-labor-tray${sum.pulse ? " is-pulse" : ""}${armed || dragging ? " is-armed" : ""}`}
      data-labor-tray="1"
      aria-label="Свободные рабочие"
    >
      <div className="planet-labor-tray__meta">
        <span className="planet-labor-tray__label">Свободные</span>
        <span className="planet-labor-tray__count tabular">
          {Math.round(sum.free)}
        </span>
      </div>
      <div className="planet-labor-tray__tokens">
        {shown === 0 ? (
          <span className="hint">Все у станков</span>
        ) : (
          Array.from({ length: shown }, (_, i) => (
            <button
              key={i}
              type="button"
              className="labor-token"
              disabled={busy || sum.free <= 0}
              aria-label="Свободный рабочий"
              onPointerDown={(e) => {
                if (busy || e.button !== 0) return;
                const amount = e.shiftKey ? 5 : 1;
                const startX = e.clientX;
                const startY = e.clientY;
                const onMove = (ev: PointerEvent) => {
                  const dx = ev.clientX - startX;
                  const dy = ev.clientY - startY;
                  if (Math.hypot(dx, dy) < GESTURE.dragThresholdPx) return;
                  window.removeEventListener("pointermove", onMove);
                  window.removeEventListener("pointerup", onUp);
                  onDragIdle(ev.clientX, ev.clientY, amount);
                };
                const onUp = () => {
                  window.removeEventListener("pointermove", onMove);
                  window.removeEventListener("pointerup", onUp);
                  onPickIdle();
                };
                window.addEventListener("pointermove", onMove);
                window.addEventListener("pointerup", onUp);
              }}
            />
          ))
        )}
        {extra > 0 ? (
          <span className="planet-labor-tray__extra tabular">+{extra}</span>
        ) : null}
      </div>
      <p className="hint planet-labor-tray__hint">
        Перетащи на здание · Shift — по 5 · [ / ] на карточке
      </p>
    </div>
  );
}
