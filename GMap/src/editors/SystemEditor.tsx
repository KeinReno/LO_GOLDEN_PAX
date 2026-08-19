import { useWorldStore } from "../state/worldStore";
import type {
  Climate,
  OrbitalStation,
  PlanetType,
  RaceShare,
  StarClass,
  StarSystem,
  StationKind,
  SystemActivity,
  SystemKind,
} from "../state/types";
import {
  censusPlanets,
  classifyPlanet,
  HABIT_LABELS,
  isCorridorSystem,
} from "../state/planets";
import {
  CLIMATE_LABELS,
  PLANET_TYPE_LABELS,
  STAR_CLASS_LABELS,
  STATION_KIND_LABELS,
  SYSTEM_ACTIVITY_LABELS,
  SYSTEM_POI_LABELS,
} from "../state/defaults";
import {
  depositPaintPool,
  resourcesHas,
  toggleDeposit,
  uniqueDepositTokens,
} from "../state/depositPaint";
import { resourceDisplayName } from "../state/economyLabels";
import { v4 as uuid } from "uuid";
import type { SystemPoiType } from "../state/types";

interface SystemEditorProps {
  system: StarSystem;
}

export function SystemEditor({ system }: SystemEditorProps) {
  const world = useWorldStore((s) => s.world);
  const activeFactionId = useWorldStore((s) => s.activeFactionId);
  const updateSelectedSystem = useWorldStore((s) => s.updateSelectedSystem);
  const updatePlanet = useWorldStore((s) => s.updatePlanet);
  const addPlanet = useWorldStore((s) => s.addPlanet);
  const removePlanet = useWorldStore((s) => s.removePlanet);
  const paintFaction = useWorldStore((s) => s.paintFaction);
  const placeFleetOnSystem = useWorldStore((s) => s.placeFleetOnSystem);
  const placeLegionOnSystem = useWorldStore((s) => s.placeLegionOnSystem);
  const selectedFleetId = useWorldStore((s) => s.selectedFleetId);
  const selectedLegionId = useWorldStore((s) => s.selectedLegionId);

  const census = censusPlanets(system.planets);
  const fleetsHere = world.fleets.filter((f) => f.systemId === system.id);
  const legionsHere = world.legions.filter((l) => l.systemId === system.id);
  const contested = new Set(fleetsHere.map((f) => f.factionId)).size > 1;
  const stations = system.stations ?? [];

  const setStars = (
    stars: StarSystem["stars"],
  ) => updateSelectedSystem({ stars });

  const setStations = (next: OrbitalStation[]) =>
    updateSelectedSystem({ stations: next });

  return (
    <div className="inspector-body system-editor">
      <label className="field">
        <span>Название</span>
        <input
          value={system.name}
          onChange={(e) => updateSelectedSystem({ name: e.target.value })}
        />
      </label>

      <label className="field">
        <span>Тип узла</span>
        <select
          value={isCorridorSystem(system) ? "corridor" : "stellar"}
          onChange={(e) => {
            const kind = e.target.value as SystemKind;
            if (kind === "corridor") {
              updateSelectedSystem({
                kind: "corridor",
                stars: [],
                planets: [],
                stations: [],
              });
            } else {
              updateSelectedSystem({
                kind: "stellar",
                stars:
                  system.stars.length > 0
                    ? system.stars
                    : [{ class: "G", luminosity: 1 }],
              });
            }
          }}
        >
          <option value="stellar">Звёздная система</option>
          <option value="corridor">Коридор / врата (без звезды)</option>
        </select>
      </label>

      {census.total > 0 && (
        <div className="census-box">
          <div className="census-title">Сводка планет</div>
          <div className="census-row">
            <span className="pip inhabited" />
            {HABIT_LABELS.inhabited}: <strong>{census.inhabited}</strong>
          </div>
          <div className="census-row">
            <span className="pip habitable" />
            {HABIT_LABELS.habitable}: <strong>{census.habitable}</strong>
          </div>
          <div className="census-row">
            <span className="pip uninhabitable" />
            {HABIT_LABELS.uninhabitable}:{" "}
            <strong>{census.uninhabitable}</strong>
          </div>
        </div>
      )}

      <label className="field">
        <span>Ситуация</span>
        <select
          value={system.activity ?? "none"}
          onChange={(e) =>
            updateSelectedSystem({
              activity: e.target.value as SystemActivity,
            })
          }
        >
          {(Object.keys(SYSTEM_ACTIVITY_LABELS) as SystemActivity[]).map(
            (a) => (
              <option key={a} value={a}>
                {SYSTEM_ACTIVITY_LABELS[a]}
              </option>
            ),
          )}
        </select>
      </label>

      <label className="field">
        <span>Точка интереса (иконка)</span>
        <select
          value={system.poiType ?? "none"}
          onChange={(e) =>
            updateSelectedSystem({
              poiType: e.target.value as SystemPoiType,
            })
          }
        >
          {(Object.keys(SYSTEM_POI_LABELS) as SystemPoiType[]).map((p) => (
            <option key={p} value={p}>
              {SYSTEM_POI_LABELS[p]}
            </option>
          ))}
        </select>
      </label>

      {(system.activity === "trade" || system.activity === "none") && (
        <label className="field">
          <span>Торговля с</span>
          <select
            value={system.tradeWithSystemId ?? ""}
            onChange={(e) =>
              updateSelectedSystem({
                tradeWithSystemId: e.target.value || null,
                activity: e.target.value ? "trade" : system.activity,
              })
            }
          >
            <option value="">— нет —</option>
            {world.systems
              .filter((s) => s.id !== system.id)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
      )}

      <label className="field">
        <span>Владелец</span>
        <select
          value={system.ownerFactionId ?? ""}
          onChange={(e) =>
            updateSelectedSystem({
              ownerFactionId: e.target.value || null,
            })
          }
        >
          <option value="">— нет / нейтрал —</option>
          <optgroup label="Государства">
            {world.factions
              .filter((f) => (f.kind ?? "state") === "state")
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
          </optgroup>
          <optgroup label="Фракции">
            {world.factions
              .filter((f) => f.kind === "faction")
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
          </optgroup>
        </select>
      </label>

      <label className="field">
        <span>Сектор</span>
        <select
          value={system.sectorId ?? ""}
          onChange={(e) =>
            updateSelectedSystem({
              sectorId: e.target.value || null,
            })
          }
        >
          <option value="">— нет —</option>
          {world.sectors.map((sec) => (
            <option key={sec.id} value={sec.id}>
              {sec.name}
            </option>
          ))}
        </select>
      </label>

      {activeFactionId && (
        <p className="hint">
          Разведка:{" "}
          {(system.visibleToFactionIds ?? []).includes(activeFactionId)
            ? "видна активной фракции"
            : "скрыта от активной"}
          {(system.visibleToFactionIds ?? []).length > 0 && (
            <>
              <br />
              Видят:{" "}
              {(system.visibleToFactionIds ?? [])
                .map(
                  (id) => world.factions.find((f) => f.id === id)?.name ?? id,
                )
                .join(", ")}
            </>
          )}
        </p>
      )}

      <label className="check">
        <input
          type="checkbox"
          checked={system.locked}
          onChange={(e) =>
            updateSelectedSystem({ locked: e.target.checked })
          }
        />
        Закрепить (lock)
      </label>

      <label className="check">
        <input
          type="checkbox"
          checked={!!system.isCapital}
          onChange={(e) =>
            updateSelectedSystem({ isCapital: e.target.checked })
          }
        />
        Столица (★ на карте)
      </label>

      <div className="block-title">Ресурсы системы</div>
      <TagEditor
        values={system.resources}
        pool={[...depositPaintPool()]}
        onChange={(resources) => updateSelectedSystem({ resources })}
      />

      {!isCorridorSystem(system) && (
        <>
          <div className="block-title">
            Звёзды ({system.stars.length}/3)
          </div>
          {system.stars.map((star, i) => (
            <div key={i} className="star-card">
              <label className="field">
                <span>Класс</span>
                <select
                  value={star.class}
                  onChange={(e) => {
                    const stars = system.stars.map((st, idx) =>
                      idx === i
                        ? { ...st, class: e.target.value as StarClass }
                        : st,
                    );
                    setStars(stars);
                  }}
                >
                  {(Object.keys(STAR_CLASS_LABELS) as StarClass[]).map((c) => (
                    <option key={c} value={c}>
                      {STAR_CLASS_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Светимость</span>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={star.luminosity}
                  onChange={(e) => {
                    const stars = system.stars.map((st, idx) =>
                      idx === i
                        ? {
                            ...st,
                            luminosity: Number(e.target.value) || 0.1,
                          }
                        : st,
                    );
                    setStars(stars);
                  }}
                />
              </label>
              <button
                type="button"
                className="btn danger block"
                disabled={system.stars.length <= 1}
                onClick={() =>
                  setStars(system.stars.filter((_, idx) => idx !== i))
                }
              >
                Убрать звезду
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn ghost block"
            disabled={system.stars.length >= 3}
            onClick={() =>
              setStars([
                ...system.stars,
                { class: "K", luminosity: 0.6 },
              ])
            }
          >
            + Звезда
          </button>
        </>
      )}

      <div className="block-title">Станции ({stations.length})</div>
      {stations.length === 0 && (
        <p className="hint">Нет орбитальных конструкций</p>
      )}
      {stations.map((st) => (
        <div key={st.id} className="station-card">
          <label className="field">
            <span>Название</span>
            <input
              value={st.name}
              onChange={(e) =>
                setStations(
                  stations.map((x) =>
                    x.id === st.id ? { ...x, name: e.target.value } : x,
                  ),
                )
              }
            />
          </label>
          <label className="field">
            <span>Тип</span>
            <select
              value={st.kind}
              onChange={(e) =>
                setStations(
                  stations.map((x) =>
                    x.id === st.id
                      ? { ...x, kind: e.target.value as StationKind }
                      : x,
                  ),
                )
              }
            >
              {(Object.keys(STATION_KIND_LABELS) as StationKind[]).map((k) => (
                <option key={k} value={k}>
                  {STATION_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Фракция</span>
            <select
              value={st.factionId ?? ""}
              onChange={(e) =>
                setStations(
                  stations.map((x) =>
                    x.id === st.id
                      ? { ...x, factionId: e.target.value || null }
                      : x,
                  ),
                )
              }
            >
              <option value="">— нет —</option>
              {world.factions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn danger block"
            onClick={() =>
              setStations(stations.filter((x) => x.id !== st.id))
            }
          >
            Удалить станцию
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn ghost block"
        onClick={() =>
          setStations([
            ...stations,
            {
              id: uuid(),
              name: "Новая станция",
              kind: "science",
              factionId: activeFactionId,
            },
          ])
        }
      >
        + Станция
      </button>

      {!isCorridorSystem(system) && (
        <>
          <div className="block-title">Планеты ({system.planets.length})</div>
          {system.planets.length === 0 && <p className="hint">Нет планет</p>}
          {system.planets.map((p) => (
            <div key={p.id} className="planet-card">
              <div className={`habit-badge ${classifyPlanet(p)}`}>
                {HABIT_LABELS[classifyPlanet(p)]}
              </div>
              <label className="field">
                <span>Название</span>
                <input
                  value={p.name}
                  onChange={(e) =>
                    updatePlanet(p.id, { name: e.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Тип</span>
                <select
                  value={p.type}
                  onChange={(e) =>
                    updatePlanet(p.id, {
                      type: e.target.value as PlanetType,
                    })
                  }
                >
                  {(Object.keys(PLANET_TYPE_LABELS) as PlanetType[]).map(
                    (t) => (
                      <option key={t} value={t}>
                        {PLANET_TYPE_LABELS[t]}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label className="field">
                <span>Климат</span>
                <select
                  value={p.climate}
                  onChange={(e) =>
                    updatePlanet(p.id, {
                      climate: e.target.value as Climate,
                    })
                  }
                >
                  {(Object.keys(CLIMATE_LABELS) as Climate[]).map((c) => (
                    <option key={c} value={c}>
                      {CLIMATE_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Население</span>
                <input
                  type="number"
                  value={p.population}
                  onChange={(e) =>
                    updatePlanet(p.id, {
                      population: Number(e.target.value) || 0,
                    })
                  }
                />
              </label>
              <div className="block-title">Ресурсы планеты</div>
              <TagEditor
                values={p.resources ?? []}
                pool={[...depositPaintPool()]}
                onChange={(resources) => updatePlanet(p.id, { resources })}
              />
              <div className="block-title">Расы %</div>
              <RaceBars
                composition={p.raceComposition ?? []}
                races={world.races}
                onChange={(raceComposition) =>
                  updatePlanet(p.id, { raceComposition })
                }
              />
              <button
                type="button"
                className="btn danger block"
                onClick={() => removePlanet(p.id)}
              >
                Удалить планету
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn ghost block"
            onClick={() => addPlanet()}
          >
            + Планета
          </button>
        </>
      )}

      <label className="field">
        <span>Заметки мастера</span>
        <textarea
          rows={3}
          value={system.notes ?? ""}
          onChange={(e) => updateSelectedSystem({ notes: e.target.value })}
        />
      </label>

        <button
          type="button"
          className="btn block"
          onClick={() =>
            useWorldStore.getState().setDossierSystem(system.id)
          }
        >
          Открыть карточку системы
        </button>

      {activeFactionId && (
        <button
          type="button"
          className="btn block"
          onClick={() => paintFaction(system.id)}
        >
          Назначить активное государство
        </button>
      )}

      <div className="block-title">
        Флоты ({fleetsHere.length})
        {contested && <span className="battle-tag"> · столкновение</span>}
      </div>
      {fleetsHere.map((f) => {
        const fac = world.factions.find((x) => x.id === f.factionId);
        return (
          <button
            key={f.id}
            type="button"
            className={
              selectedFleetId === f.id ? "fleet-pick active" : "fleet-pick"
            }
            onClick={() => useWorldStore.getState().selectFleet(f.id)}
          >
            <span
              className="swatch"
              style={{ background: fac?.color ?? "#888" }}
            />
            <span>
              {f.name}
              <span className="hint">
                {" "}
                · {fac?.name} · {f.stance}
              </span>
            </span>
          </button>
        );
      })}
      {activeFactionId && (
        <button
          type="button"
          className="btn ghost block"
          onClick={() => placeFleetOnSystem(system.id)}
        >
          + Флот активной фракции
        </button>
      )}

      <div className="block-title">Легионы ({legionsHere.length})</div>
      {legionsHere.map((l) => {
        const fac = world.factions.find((x) => x.id === l.factionId);
        return (
          <button
            key={l.id}
            type="button"
            className={
              selectedLegionId === l.id ? "fleet-pick active" : "fleet-pick"
            }
            onClick={() => useWorldStore.getState().selectLegion(l.id)}
          >
            <span
              className="swatch"
              style={{ background: fac?.color ?? "#888" }}
            />
            <span>
              {l.name}
              <span className="hint">
                {" "}
                · {fac?.name} · {l.strength}
              </span>
            </span>
          </button>
        );
      })}
      {activeFactionId && (
        <button
          type="button"
          className="btn ghost block"
          onClick={() => placeLegionOnSystem(system.id)}
        >
          + Легион активной фракции
        </button>
      )}
    </div>
  );
}

function TagEditor({
  values,
  pool,
  onChange,
}: {
  values: string[];
  pool: string[];
  onChange: (next: string[]) => void;
}) {
  const chips = uniqueDepositTokens(values);
  const available = pool.filter((r) => !resourcesHas(values, r));
  return (
    <div className="tag-editor">
      <div className="tag-list">
        {chips.length === 0 && <span className="hint">— нет —</span>}
        {chips.map((v) => (
          <button
            key={v}
            type="button"
            className="tag"
            title="Убрать"
            onClick={() => onChange(toggleDeposit(values, v))}
          >
            {resourceDisplayName(v)} ×
          </button>
        ))}
      </div>
      {available.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (v) onChange(toggleDeposit(values, v));
          }}
        >
          <option value="">+ ресурс…</option>
          {available.map((r) => (
            <option key={r} value={r}>
              {resourceDisplayName(r)}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function RaceBars({
  composition,
  races,
  onChange,
}: {
  composition: RaceShare[];
  races: { id: string; name: string }[];
  onChange: (next: RaceShare[]) => void;
}) {
  const byId = new Map(composition.map((c) => [c.raceId, c.percent]));
  const total = races.reduce((s, r) => s + (byId.get(r.id) ?? 0), 0);

  return (
    <div className="race-bars">
      {races.map((r) => {
        const pct = byId.get(r.id) ?? 0;
        return (
          <label key={r.id} className="race-row">
            <span>{r.name}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={pct}
              onChange={(e) => {
                const nextPct = Number(e.target.value);
                onChange(
                  races
                    .map((race) => ({
                      raceId: race.id,
                      percent:
                        race.id === r.id ? nextPct : (byId.get(race.id) ?? 0),
                    }))
                    .filter((x) => x.percent > 0),
                );
              }}
            />
            <span className="race-pct">{pct}%</span>
          </label>
        );
      })}
      <p className={`hint ${total === 100 ? "ok" : ""}`}>
        Сумма: {total}%{total !== 100 ? " (желательно 100)" : ""}
      </p>
    </div>
  );
}
