import { useMemo } from "react";
import type {
  Fleet,
  Legion,
  Planet,
  StarSystem,
} from "../../../state/types";
import { COLONY_TYPE_LABELS } from "../../../state/defaults";
import { HABIT_LABELS, classifyPlanet, planetsByOrbit } from "../../../state/planets";
import { groupStationsByRole, isOwnSettledPlanet } from "./diveChrome";

type Props = {
  system: StarSystem;
  factionId: string;
  fleets: Fleet[];
  legions: Legion[];
  previewPlanetId?: string | null;
  selectedStationId?: string | null;
  selectedFleetId?: string | null;
  selectedLegionId?: string | null;
  onSelectSystem: () => void;
  onDrillPlanet: (planetId: string) => void;
  onPreviewPlanet: (planetId: string) => void;
  onSelectStation: (stationId: string) => void;
  onSelectFleet?: (fleetId: string) => void;
  onSelectLegion?: (legionId: string) => void;
};

function formatPop(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

export function SystemDiveOutliner({
  system,
  factionId,
  fleets,
  legions,
  previewPlanetId,
  selectedStationId,
  selectedFleetId,
  selectedLegionId,
  onSelectSystem,
  onDrillPlanet,
  onPreviewPlanet,
  onSelectStation,
  onSelectFleet,
  onSelectLegion,
}: Props) {
  const ordered = useMemo(() => planetsByOrbit(system.planets), [system.planets]);
  const stations = useMemo(
    () => groupStationsByRole(system.stations, factionId),
    [system.stations, factionId],
  );
  const ownFleets = fleets.filter((f) => f.factionId === factionId);
  const ownLegions = legions.filter((l) => l.factionId === factionId);

  return (
    <aside className="dive-outliner" aria-label="Объекты системы">
      <div className="dive-outliner__scroll">
      <button
        type="button"
        className="dive-outliner__system"
        onClick={onSelectSystem}
      >
        <strong>{system.name}</strong>
        <span className="hint">звезда · сводка справа</span>
      </button>

      <section className="dive-outliner__section">
        <h3>Миры</h3>
        <ul className="dive-outliner__list">
          {ordered.map((p) => {
            const own = isOwnSettledPlanet(p, system, factionId);
            return (
              <PlanetRow
                key={p.id}
                planet={p}
                own={own}
                selected={p.id === previewPlanetId}
                onClick={() => (own ? onDrillPlanet(p.id) : onPreviewPlanet(p.id))}
              />
            );
          })}
        </ul>
      </section>

      {stations.length > 0 && (
        <section className="dive-outliner__section">
          <h3>Станции</h3>
          {stations.map((g) => (
            <div key={g.kind} className="dive-outliner__role">
              <span className="hint">{g.label}</span>
              <ul className="dive-outliner__list">
                {g.own.map((st) => (
                  <li key={st.id}>
                    <button
                      type="button"
                      className={
                        st.id === selectedStationId
                          ? "dive-outliner__row is-on"
                          : "dive-outliner__row"
                      }
                      onClick={() => onSelectStation(st.id)}
                    >
                      <strong>{st.name}</strong>
                      <span className="hint">ваша</span>
                    </button>
                  </li>
                ))}
                {g.other.map((st) => (
                  <li key={st.id}>
                    <button
                      type="button"
                      className="dive-outliner__row is-foreign"
                      onClick={() => onSelectStation(st.id)}
                    >
                      <strong>{st.name}</strong>
                      <span className="hint">чужая</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {(ownFleets.length > 0 || ownLegions.length > 0) && (
        <section className="dive-outliner__section">
          <h3>Силы</h3>
          <ul className="dive-outliner__list">
            {ownFleets.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  className={
                    f.id === selectedFleetId
                      ? "dive-outliner__row is-on"
                      : "dive-outliner__row"
                  }
                  onClick={() => onSelectFleet?.(f.id)}
                >
                  <strong>{f.name}</strong>
                  <span className="hint">флот</span>
                </button>
              </li>
            ))}
            {ownLegions.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  className={
                    l.id === selectedLegionId
                      ? "dive-outliner__row is-on"
                      : "dive-outliner__row"
                  }
                  onClick={() => onSelectLegion?.(l.id)}
                >
                  <strong>{l.name}</strong>
                  <span className="hint">легион</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      </div>
    </aside>
  );
}

function PlanetRow({
  planet,
  own,
  selected,
  onClick,
}: {
  planet: Planet;
  own: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const habit = classifyPlanet(planet);
  const ct = planet.colonyType && planet.colonyType !== "none"
    ? (COLONY_TYPE_LABELS[planet.colonyType] ?? planet.colonyType)
    : HABIT_LABELS[habit];
  return (
    <li>
      <button
        type="button"
        className={`dive-outliner__row${own ? " is-own" : ""}${selected ? " is-on" : ""}`}
        onClick={onClick}
      >
        <span className="dive-outliner__orbit">{planet.orbitIndex ?? "—"}</span>
        <span className="dive-outliner__body">
          <strong>{planet.name}</strong>
          <span className="hint">
            {ct}
            {planet.population > 0 ? ` · ${formatPop(planet.population)}` : ""}
            {own ? "" : " · осмотр"}
          </span>
        </span>
      </button>
    </li>
  );
}
