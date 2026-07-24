import { useMemo, useState } from "react";
import { useWorldStore } from "../state/worldStore";
import type {
  Climate,
  ColonyType,
  Planet,
  PlanetBuilding,
  PlanetBuildingKind,
  PlanetBuildingZone,
  PlanetType,
  StarSystem,
} from "../state/types";
import {
  classifyPlanet,
  HABIT_LABELS,
  isCorridorSystem,
  planetsByOrbit,
} from "../state/planets";
import {
  CLIMATE_LABELS,
  COLONY_TYPE_LABELS,
  PLANET_BUILDING_KIND_LABELS,
  PLANET_TYPE_LABELS,
  RESOURCE_POOL,
  SYSTEM_ACTIVITY_LABELS,
} from "../state/defaults";
import { SystemSchematic } from "./SystemSchematic";
import { SystemEditor } from "./SystemEditor";
import { v4 as uuid } from "uuid";

/** Full drill-down: Galaxy → System schematic → Planet card. */
export function SystemView({ system }: { system: StarSystem }) {
  const world = useWorldStore((s) => s.world);
  const mapFocus = useWorldStore((s) => s.mapFocus);
  const openPlanetView = useWorldStore((s) => s.openPlanetView);
  const openSystemView = useWorldStore((s) => s.openSystemView);
  const closeSystemView = useWorldStore((s) => s.closeSystemView);
  const updatePlanet = useWorldStore((s) => s.updatePlanet);
  const addPlanet = useWorldStore((s) => s.addPlanet);
  const removePlanet = useWorldStore((s) => s.removePlanet);
  const tool = useWorldStore((s) => s.tool);
  const activeResource = useWorldStore((s) => s.activeResource);
  const paintResourceOnSystem = useWorldStore((s) => s.paintResourceOnSystem);
  const paintResourceOnPlanet = useWorldStore((s) => s.paintResourceOnPlanet);
  const paintPlanetOwner = useWorldStore((s) => s.paintPlanetOwner);
  const paintPlanetCoOwner = useWorldStore((s) => s.paintPlanetCoOwner);
  const togglePlanetContested = useWorldStore((s) => s.togglePlanetContested);
  const paintingRes = tool === "paint_resource";
  const paintingOwner = tool === "paint_faction";
  const paintingCo = tool === "paint_coowner";
  const paintingContest = tool === "mark_contested";
  const paintingClaim =
    paintingRes || paintingOwner || paintingCo || paintingContest;

  const applyPlanetTool = (planetId: string) => {
    if (paintingRes) {
      paintResourceOnPlanet(system.id, planetId);
      return true;
    }
    if (paintingOwner) {
      paintPlanetOwner(system.id, planetId);
      return true;
    }
    if (paintingCo) {
      paintPlanetCoOwner(system.id, planetId);
      return true;
    }
    if (paintingContest) {
      togglePlanetContested(system.id, planetId);
      return true;
    }
    return false;
  };

  const selectedPlanetId =
    mapFocus.level === "planet" && mapFocus.systemId === system.id
      ? mapFocus.planetId
      : null;

  const planet = useMemo(
    () => system.planets.find((p) => p.id === selectedPlanetId) ?? null,
    [system.planets, selectedPlanetId],
  );

  const ordered = planetsByOrbit(system.planets);
  const fleetsHere = world.fleets.filter((f) => f.systemId === system.id);
  const legionsHere = world.legions.filter((l) => l.systemId === system.id);
  const owner = world.factions.find((f) => f.id === system.ownerFactionId);

  return (
    <div className="system-view">
      <nav className="sys-crumb" aria-label="Иерархия">
        <button type="button" className="crumb-link" onClick={closeSystemView}>
          Галактика
        </button>
        <span className="crumb-sep">›</span>
        <button
          type="button"
          className={
            mapFocus.level === "system" ? "crumb-link active" : "crumb-link"
          }
          onClick={() => openSystemView(system.id)}
        >
          {system.name}
        </button>
        {planet && (
          <>
            <span className="crumb-sep">›</span>
            <span className="crumb-current">{planet.name}</span>
          </>
        )}
      </nav>

      <div className="system-view-grid">
        <div className="system-view-map">
          {!isCorridorSystem(system) ? (
            <SystemSchematic
              system={system}
              selectedPlanetId={selectedPlanetId}
              onSelectPlanet={(id) => {
                if (id && applyPlanetTool(id)) return;
                if (id) openPlanetView(system.id, id);
                else openSystemView(system.id);
              }}
            />
          ) : (
            <div className="sys-corridor-note">
              <p>Узел коридора / врат — без орбитальной схемы.</p>
              <p className="hint">Координаты галактики не меняются.</p>
            </div>
          )}
        </div>

        <div className="system-view-side">
          <div className="sys-meta">
            <div className="sys-meta-row">
              <span>Владелец</span>
              <strong className="sys-owner-line" style={{ color: owner?.color }}>
                {owner?.emblemPath && (
                  <img
                    className="faction-emblem-thumb"
                    src={owner.emblemPath}
                    alt=""
                  />
                )}
                {owner?.name ?? "—"}
              </strong>
            </div>
            <div className="sys-meta-row">
              <span>Ситуация</span>
              <strong>
                {SYSTEM_ACTIVITY_LABELS[system.activity ?? "none"]}
              </strong>
            </div>
            <div className="sys-meta-row">
              <span>Флоты / легионы</span>
              <strong>
                {fleetsHere.length} / {legionsHere.length}
              </strong>
            </div>
            {paintingRes && (
              <div className="sys-paint-res">
                <p className="hint">
                  Режим ресурсов
                  {activeResource ? `: «${activeResource}»` : ""}. Клик по
                  планете — на неё; кнопка — в систему вне планет.
                </p>
                <button
                  type="button"
                  className="btn primary block"
                  onClick={() => paintResourceOnSystem(system.id)}
                >
                  Сыпать в систему
                </button>
              </div>
            )}
            {(paintingOwner || paintingCo || paintingContest) && (
              <div className="sys-paint-res">
                <p className="hint">
                  {paintingOwner &&
                    "Владение: клик по планете — назначить активную державу владельцем."}
                  {paintingCo &&
                    "Совладелец: клик — добавить/снять активную державу как совладельца планеты."}
                  {paintingContest &&
                    "Спорная: клик — переключить спорный статус планеты."}
                </p>
              </div>
            )}
            {(fleetsHere.length > 0 || legionsHere.length > 0) && (
              <ul className="sys-force-list">
                {fleetsHere.map((f) => (
                  <li key={f.id}>
                    ✦ {f.name}{" "}
                    <span className="hint">
                      (
                      {world.factions.find((x) => x.id === f.factionId)?.name ??
                        "?"}
                      )
                    </span>
                  </li>
                ))}
                {legionsHere.map((l) => (
                  <li key={l.id}>
                    ⚑ {l.name}{" "}
                    <span className="hint">
                      (
                      {world.factions.find((x) => x.id === l.factionId)?.name ??
                        "?"}
                      )
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {planet ? (
            <PlanetDetail
              planet={planet}
              onBack={() => openSystemView(system.id)}
              onChange={(patch) => updatePlanet(planet.id, patch)}
              onRemove={() => {
                removePlanet(planet.id);
                openSystemView(system.id);
              }}
              races={world.races}
            />
          ) : (
            <>
              <div className="block-title">
                Планеты ({ordered.length})
                <button
                  type="button"
                  className="btn ghost"
                  style={{ marginLeft: "auto" }}
                  onClick={() => addPlanet()}
                  disabled={isCorridorSystem(system)}
                >
                  + Планета
                </button>
              </div>
              <div className="planet-card-grid">
                {ordered.length === 0 && (
                  <p className="hint">Нет планет — добавьте или сгенерируйте.</p>
                )}
                {ordered.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`planet-tile ${classifyPlanet(p)}${
                      paintingClaim ? " paint-target" : ""
                    }${p.contested ? " contested" : ""}${
                      (p.coOwnerFactionIds?.length ?? 0) > 0 ? " co-owned" : ""
                    }`}
                    onClick={() => {
                      if (applyPlanetTool(p.id)) return;
                      openPlanetView(system.id, p.id);
                    }}
                  >
                    <span className="planet-tile-orbit">
                      Орбита {p.orbitIndex ?? "—"}
                      {p.contested ? " · спор" : ""}
                    </span>
                    <strong>{p.name}</strong>
                    <span className="hint">
                      {PLANET_TYPE_LABELS[p.type]} ·{" "}
                      {HABIT_LABELS[classifyPlanet(p)]}
                      {p.ownerFactionId
                        ? ` · ${
                            world.factions.find((f) => f.id === p.ownerFactionId)
                              ?.name ?? "?"
                          }`
                        : ""}
                    </span>
                    <span className="planet-tile-pop">
                      {p.population > 0
                        ? `нас. ${formatPop(p.population)}`
                        : COLONY_TYPE_LABELS[p.colonyType ?? "none"]}
                    </span>
                    <span className="planet-tile-build">
                      пов. {(p.surfaceBuildings ?? []).length}/
                      {p.surfaceSlots ?? 8} · орб.{" "}
                      {(p.orbitalBuildings ?? []).length}/
                      {p.orbitalSlots ?? 4}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <details className="sys-editor-fold">
        <summary>Полная правка системы (звёзды, станции, владение…)</summary>
        <SystemEditor system={system} />
      </details>
    </div>
  );
}

function kindsForZone(zone: PlanetBuildingZone): PlanetBuildingKind[] {
  if (zone === "orbital") {
    return ["spaceport", "shipyard", "habitat", "defense", "lab", "custom"];
  }
  return [
    "residential",
    "farm",
    "mine",
    "factory",
    "lab",
    "barracks",
    "capitol",
    "defense",
    "custom",
  ];
}

function formatPop(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return String(n);
}

function PlanetDetail({
  planet,
  onBack,
  onChange,
  onRemove,
  races,
}: {
  planet: Planet;
  onBack: () => void;
  onChange: (patch: Partial<Planet>) => void;
  onRemove: () => void;
  races: { id: string; name: string }[];
}) {
  const world = useWorldStore((s) => s.world);
  const habit = classifyPlanet(planet);
  const [zone, setZone] = useState<PlanetBuildingZone>("surface");

  const surface = planet.surfaceBuildings ?? [];
  const orbital = planet.orbitalBuildings ?? [];
  const surfaceMax = planet.surfaceSlots ?? 8;
  const orbitalMax = planet.orbitalSlots ?? 4;

  const setBuildings = (z: PlanetBuildingZone, list: PlanetBuilding[]) => {
    if (z === "surface") onChange({ surfaceBuildings: list });
    else onChange({ orbitalBuildings: list });
  };

  const addBuilding = (z: PlanetBuildingZone) => {
    const list = z === "surface" ? surface : orbital;
    const max = z === "surface" ? surfaceMax : orbitalMax;
    if (list.length >= max) return;
    const kind: PlanetBuildingKind =
      z === "orbital" ? "spaceport" : "residential";
    setBuildings(z, [
      ...list,
      {
        id: uuid(),
        name: PLANET_BUILDING_KIND_LABELS[kind],
        kind,
        zone: z,
      },
    ]);
  };

  return (
    <div className="planet-detail">
      <div className="planet-detail-head">
        <button type="button" className="btn ghost" onClick={onBack}>
          ← К системе
        </button>
        <span className={`habit-badge ${habit}`}>{HABIT_LABELS[habit]}</span>
      </div>
      <h3 className="planet-detail-title">{planet.name}</h3>

      <label className="field">
        <span>Название</span>
        <input
          value={planet.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </label>

      <div className="block-title">Владение / спор</div>
      <label className="field">
        <span>Владелец планеты</span>
        <select
          value={planet.ownerFactionId ?? ""}
          onChange={(e) =>
            onChange({
              ownerFactionId: e.target.value || null,
              coOwnerFactionIds: (planet.coOwnerFactionIds ?? []).filter(
                (id) => id !== e.target.value,
              ),
            })
          }
        >
          <option value="">— как у системы / нет —</option>
          {world.factions.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Совладелец</span>
        <select
          value={(planet.coOwnerFactionIds ?? [])[0] ?? ""}
          onChange={(e) =>
            onChange({
              coOwnerFactionIds: e.target.value ? [e.target.value] : [],
            })
          }
        >
          <option value="">— нет —</option>
          {world.factions
            .filter((f) => f.id !== planet.ownerFactionId)
            .map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
        </select>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={!!planet.contested}
          onChange={(e) => onChange({ contested: e.target.checked })}
        />
        Спорная планета
      </label>

      <div className="planet-detail-2col">
        <label className="field">
          <span>Орбита №</span>
          <input
            type="number"
            min={1}
            value={planet.orbitIndex ?? 1}
            onChange={(e) =>
              onChange({ orbitIndex: Math.max(1, Number(e.target.value) || 1) })
            }
          />
        </label>
        <label className="field">
          <span>Размер схемы</span>
          <input
            type="number"
            min={0.4}
            max={2.5}
            step={0.1}
            value={planet.size ?? 1}
            onChange={(e) =>
              onChange({ size: Number(e.target.value) || 1 })
            }
          />
        </label>
      </div>
      <div className="planet-detail-2col">
        <label className="field">
          <span>Тип</span>
          <select
            value={planet.type}
            onChange={(e) =>
              onChange({ type: e.target.value as PlanetType })
            }
          >
            {(Object.keys(PLANET_TYPE_LABELS) as PlanetType[]).map((t) => (
              <option key={t} value={t}>
                {PLANET_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Климат</span>
          <select
            value={planet.climate}
            onChange={(e) =>
              onChange({ climate: e.target.value as Climate })
            }
          >
            {(Object.keys(CLIMATE_LABELS) as Climate[]).map((c) => (
              <option key={c} value={c}>
                {CLIMATE_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span>Тип колонии</span>
        <select
          value={planet.colonyType ?? "none"}
          onChange={(e) =>
            onChange({ colonyType: e.target.value as ColonyType })
          }
        >
          {(Object.keys(COLONY_TYPE_LABELS) as ColonyType[]).map((c) => (
            <option key={c} value={c}>
              {COLONY_TYPE_LABELS[c]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Население</span>
        <input
          type="number"
          min={0}
          value={planet.population}
          onChange={(e) =>
            onChange({ population: Math.max(0, Number(e.target.value) || 0) })
          }
        />
      </label>
      <div className="planet-flags">
        <label className="check">
          <input
            type="checkbox"
            checked={planet.habitable !== false}
            onChange={(e) => onChange({ habitable: e.target.checked })}
          />
          Обитаема
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={planet.colonizable !== false}
            onChange={(e) => onChange({ colonizable: e.target.checked })}
          />
          Колонизируема
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={planet.surveyed !== false}
            onChange={(e) => onChange({ surveyed: e.target.checked })}
          />
          Разведана
        </label>
      </div>

      <div className="planet-zone-tabs">
        <button
          type="button"
          className={zone === "surface" ? "tab active" : "tab"}
          onClick={() => setZone("surface")}
        >
          Поверхность ({surface.length}/{surfaceMax})
        </button>
        <button
          type="button"
          className={zone === "orbital" ? "tab active" : "tab"}
          onClick={() => setZone("orbital")}
        >
          Орбита ({orbital.length}/{orbitalMax})
        </button>
      </div>
      <div className="planet-detail-2col">
        <label className="field">
          <span>Слоты поверхности</span>
          <input
            type="number"
            min={0}
            value={surfaceMax}
            onChange={(e) =>
              onChange({
                surfaceSlots: Math.max(0, Number(e.target.value) || 0),
              })
            }
          />
        </label>
        <label className="field">
          <span>Слоты орбиты</span>
          <input
            type="number"
            min={0}
            value={orbitalMax}
            onChange={(e) =>
              onChange({
                orbitalSlots: Math.max(0, Number(e.target.value) || 0),
              })
            }
          />
        </label>
      </div>

      <BuildingZoneEditor
        zone={zone}
        buildings={zone === "surface" ? surface : orbital}
        max={zone === "surface" ? surfaceMax : orbitalMax}
        onChange={(list) => setBuildings(zone, list)}
        onAdd={() => addBuilding(zone)}
      />

      <div className="block-title">Ресурсы</div>
      <div className="tag-row">
        {RESOURCE_POOL.map((r) => {
          const on = (planet.resources ?? []).includes(r);
          return (
            <button
              key={r}
              type="button"
              className={on ? "tag on" : "tag"}
              onClick={() => {
                const cur = planet.resources ?? [];
                onChange({
                  resources: on ? cur.filter((x) => x !== r) : [...cur, r],
                });
              }}
            >
              {r}
            </button>
          );
        })}
      </div>
      {races.length > 0 && (
        <>
          <div className="block-title">Состав населения</div>
          <p className="hint">
            {(planet.raceComposition ?? [])
              .map((rc) => {
                const name =
                  races.find((r) => r.id === rc.raceId)?.name ?? rc.raceId;
                return `${name} ${rc.percent}%`;
              })
              .join(" · ") || "не задан — правьте в полной форме ниже"}
          </p>
        </>
      )}
      <label className="field">
        <span>Заметки о мире</span>
        <textarea
          rows={3}
          value={planet.notes ?? ""}
          onChange={(e) => onChange({ notes: e.target.value })}
        />
      </label>
      <button type="button" className="btn danger block" onClick={onRemove}>
        Удалить планету
      </button>
    </div>
  );
}

function BuildingZoneEditor({
  zone,
  buildings,
  max,
  onChange,
  onAdd,
}: {
  zone: PlanetBuildingZone;
  buildings: PlanetBuilding[];
  max: number;
  onChange: (list: PlanetBuilding[]) => void;
  onAdd: () => void;
}) {
  return (
    <div className="building-zone">
      <p className="hint">
        {zone === "surface"
          ? "Поверхность: районы, шахты, казармы…"
          : "Орбита: космопорт, верфь, хабитат…"}
      </p>
      {buildings.map((b) => (
        <div
          key={b.id}
          className={b.disabled ? "building-row disabled" : "building-row"}
        >
          <label className="field">
            <span>Имя</span>
            <input
              value={b.name}
              onChange={(e) =>
                onChange(
                  buildings.map((x) =>
                    x.id === b.id ? { ...x, name: e.target.value } : x,
                  ),
                )
              }
            />
          </label>
          <label className="field">
            <span>Тип</span>
            <select
              value={b.kind}
              onChange={(e) => {
                const kind = e.target.value as PlanetBuildingKind;
                onChange(
                  buildings.map((x) =>
                    x.id === b.id
                      ? {
                          ...x,
                          kind,
                          name: PLANET_BUILDING_KIND_LABELS[kind],
                        }
                      : x,
                  ),
                );
              }}
            >
              {kindsForZone(zone).map((k) => (
                <option key={k} value={k}>
                  {PLANET_BUILDING_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={!!b.disabled}
              onChange={(e) =>
                onChange(
                  buildings.map((x) =>
                    x.id === b.id ? { ...x, disabled: e.target.checked } : x,
                  ),
                )
              }
            />
            Откл.
          </label>
          <button
            type="button"
            className="btn danger"
            onClick={() => onChange(buildings.filter((x) => x.id !== b.id))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn ghost block"
        disabled={buildings.length >= max}
        onClick={onAdd}
      >
        +{" "}
        {zone === "surface" ? "Постройка на поверхности" : "Орбитальный объект"}
      </button>
    </div>
  );
}
