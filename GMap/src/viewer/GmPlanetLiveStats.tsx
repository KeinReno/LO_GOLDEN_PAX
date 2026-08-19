import type { Planet } from "../state/types";
import { useWorldStore } from "../state/worldStore";
import { paintTagList, toggleDeposit } from "../state/depositPaint";
import { resolveResourceOrCurrencyLabel } from "../state/displayLabels";
import { COLONY_TYPE_LABELS } from "../state/defaults";

function clamp100(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function colonyLabel(t?: string | null) {
  if (!t || t === "none") return "—";
  if (t === "capital") return COLONY_TYPE_LABELS.core ?? t;
  return COLONY_TYPE_LABELS[t] ?? t;
}

type Props = {
  planet: Planet;
  laborUsed: number;
  laborSlots: number;
  surfaceUsed: number;
  surfaceMax: number;
  orbitalUsed: number;
  orbitalMax: number;
};

/** GM stats live in the player metric bar — no extra chrome strip. */
export function GmPlanetLiveStats({
  planet,
  laborUsed,
  laborSlots,
  surfaceUsed,
  surfaceMax,
  orbitalUsed,
  orbitalMax,
}: Props) {
  const updatePlanet = useWorldStore((s) => s.updatePlanet);
  const ores = paintTagList(planet.resources);

  const setPop = (n: number) => {
    updatePlanet(planet.id, { population: Math.max(0, Math.round(n)) });
  };

  return (
    <>
      <div>
        <dt>Население</dt>
        <dd className="gm-stat">
          <input
            type="number"
            min={0}
            className="tabular"
            aria-label="Население"
            value={planet.population ?? 0}
            onChange={(e) => setPop(Number(e.target.value) || 0)}
          />
          <button
            type="button"
            className="btn ghost"
            onClick={() => setPop((planet.population ?? 0) - 1000)}
          >
            −1k
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => setPop((planet.population ?? 0) + 1000)}
          >
            +1k
          </button>
        </dd>
      </div>
      <div>
        <dt>Труд</dt>
        <dd className="tabular">
          {Math.round(laborUsed)}/{Math.round(laborSlots)}
        </dd>
      </div>
      <div>
        <dt>Лояльность</dt>
        <dd className="gm-stat">
          <input
            type="number"
            min={0}
            max={100}
            className="tabular"
            aria-label="Лояльность"
            value={planet.loyalty ?? 50}
            onChange={(e) =>
              updatePlanet(planet.id, {
                loyalty: clamp100(Number(e.target.value)),
              })
            }
          />
        </dd>
      </div>
      <div>
        <dt>Стабильность</dt>
        <dd className="gm-stat">
          <input
            type="number"
            min={0}
            max={100}
            className="tabular"
            aria-label="Стабильность"
            value={planet.stability ?? 50}
            onChange={(e) =>
              updatePlanet(planet.id, {
                stability: clamp100(Number(e.target.value)),
              })
            }
          />
        </dd>
      </div>
      <div>
        <dt>Колония</dt>
        <dd>{colonyLabel(planet.colonyType)}</dd>
      </div>
      <div>
        <dt>Слоты</dt>
        <dd>
          пов. {surfaceUsed}/{surfaceMax} · орб. {orbitalUsed}/{orbitalMax}
        </dd>
      </div>
      <div className="gm-stat-ores">
        <dt>Руды</dt>
        <dd className="gm-stat">
          {(planet.resources ?? []).map((id) => (
            <button
              key={id}
              type="button"
              className="btn ghost"
              title="Убрать"
              onClick={() =>
                updatePlanet(planet.id, {
                  resources: toggleDeposit(planet.resources, id),
                })
              }
            >
              {resolveResourceOrCurrencyLabel(id)} ×
            </button>
          ))}
          <select
            aria-label="Добавить руду"
            value=""
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return;
              updatePlanet(planet.id, {
                resources: toggleDeposit(planet.resources, id),
              });
            }}
          >
            <option value="">+ руда</option>
            {ores.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </dd>
      </div>
    </>
  );
}
