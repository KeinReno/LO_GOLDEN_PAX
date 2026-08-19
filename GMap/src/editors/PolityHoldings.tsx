import { useState } from "react";
import { useWorldStore } from "../state/worldStore";
import type { ColonyType, Faction } from "../state/types";
import {
  CLIMATE_LABELS,
  COLONY_TYPE_LABELS,
  PLANET_TYPE_LABELS,
} from "../state/defaults";
import { CatalogIdSelect } from "./gm/CatalogIdSelect";
import { PolityPlanetBuildings } from "./PolityMasterTools";

export function PolitySystemsTab({ faction }: { faction: Faction }) {
  const world = useWorldStore((s) => s.world);
  const jumpToGmMap = useWorldStore((s) => s.jumpToGmMap);
  const beginAssignCapital = useWorldStore((s) => s.beginAssignCapital);
  const clearFactionOwnership = useWorldStore((s) => s.clearFactionOwnership);
  const assignSystemOwner = useWorldStore((s) => s.assignSystemOwner);
  const setFactionCapital = useWorldStore((s) => s.setFactionCapital);
  const updatePlanet = useWorldStore((s) => s.updatePlanet);
  const addPlanet = useWorldStore((s) => s.addPlanet);
  const selectSystem = useWorldStore((s) => s.selectSystem);

  const [openId, setOpenId] = useState<string | null>(null);
  const [claimId, setClaimId] = useState("");

  const owned = world.systems.filter((s) => s.ownerFactionId === faction.id);
  const others = world.systems.filter((s) => s.ownerFactionId !== faction.id);
  const capital = owned.find((s) => s.isCapital) ?? null;

  return (
    <div className="polity-hold">
      <p className="meta-line">
        Систем во владении: <strong>{owned.length}</strong>
        {capital ? ` · столица «${capital.name}»` : " · столица не назначена"}
      </p>

      <div className="polity-hold-toolbar">
        <CatalogIdSelect
          value={claimId}
          onChange={setClaimId}
          options={others.map((s) => ({ id: s.id, name: s.name }))}
          emptyLabel="— передать систему —"
        />
        <button
          type="button"
          className="btn primary"
          disabled={!claimId}
          onClick={() => {
            assignSystemOwner(claimId, faction.id);
            setClaimId("");
          }}
        >
          Передать державе
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => beginAssignCapital(faction.id)}
        >
          Столица кликом
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            jumpToGmMap({
              factionId: faction.id,
              tool: "paint_faction",
              dive: "galaxy",
              systemId: capital?.id ?? owned[0]?.id ?? null,
            });
          }}
        >
          Кисть на карте
        </button>
        <button
          type="button"
          className="btn danger"
          disabled={owned.length === 0}
          onClick={() => {
            if (
              confirm(
                `Снять владение со всех систем «${faction.name}» (${owned.length})?`,
              )
            ) {
              clearFactionOwnership(faction.id);
            }
          }}
        >
          Снять всё
        </button>
      </div>

      {owned.length === 0 ? (
        <p className="hint">Нет систем — передайте из списка выше или кистью на карте.</p>
      ) : (
        <ul className="polity-sys-list">
          {owned
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name, "ru"))
            .map((sys) => {
              const open = openId === sys.id;
              return (
                <li key={sys.id} className="polity-sys-card">
                  <header className="polity-sys-head">
                    <button
                      type="button"
                      className="linkish"
                      onClick={() => setOpenId(open ? null : sys.id)}
                    >
                      {sys.isCapital ? "★ " : ""}
                      {sys.name}
                      <span className="hint">
                        {" "}
                        · {sys.planets.length} планет
                      </span>
                    </button>
                    <div className="polity-sys-actions">
                      {!sys.isCapital && (
                        <button
                          type="button"
                          className="btn tiny ghost"
                          onClick={() => setFactionCapital(faction.id, sys.id)}
                        >
                          Столица
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn tiny ghost"
                        onClick={() =>
                          jumpToGmMap({
                            factionId: faction.id,
                            systemId: sys.id,
                            dive: "galaxy",
                          })
                        }
                      >
                        На карте
                      </button>
                      <button
                        type="button"
                        className="btn tiny ghost"
                        onClick={() =>
                          jumpToGmMap({
                            factionId: faction.id,
                            systemId: sys.id,
                            dive: "system",
                          })
                        }
                      >
                        Система
                      </button>
                      <button
                        type="button"
                        className="btn tiny danger ghost"
                        onClick={() => assignSystemOwner(sys.id, null)}
                      >
                        Снять
                      </button>
                    </div>
                  </header>
                  {open && (
                    <div className="polity-planet-grid">
                      {sys.planets.map((p) => (
                        <article key={p.id} className="polity-planet-card">
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
                                  type: e.target.value as typeof p.type,
                                })
                              }
                            >
                              {Object.entries(PLANET_TYPE_LABELS).map(
                                ([id, label]) => (
                                  <option key={id} value={id}>
                                    {label}
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
                                  climate: e.target.value as typeof p.climate,
                                })
                              }
                            >
                              {Object.entries(CLIMATE_LABELS).map(
                                ([id, label]) => (
                                  <option key={id} value={id}>
                                    {label}
                                  </option>
                                ),
                              )}
                            </select>
                          </label>
                          <label className="field">
                            <span>Колония</span>
                            <select
                              value={p.colonyType ?? "none"}
                              onChange={(e) =>
                                updatePlanet(p.id, {
                                  colonyType: e.target.value as ColonyType,
                                })
                              }
                            >
                              {Object.entries(COLONY_TYPE_LABELS).map(
                                ([id, label]) => (
                                  <option key={id} value={id}>
                                    {label}
                                  </option>
                                ),
                              )}
                            </select>
                          </label>
                          <label className="field">
                            <span>Население</span>
                            <input
                              type="number"
                              value={p.population ?? 0}
                              onChange={(e) =>
                                updatePlanet(p.id, {
                                  population: Number(e.target.value) || 0,
                                })
                              }
                            />
                          </label>
                          <label className="field">
                            <span>Лояльность</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={p.loyalty ?? 50}
                              onChange={(e) =>
                                updatePlanet(p.id, {
                                  loyalty: Number(e.target.value) || 0,
                                })
                              }
                            />
                          </label>
                          <label className="field">
                            <span>Стабильность</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={p.stability ?? 50}
                              onChange={(e) =>
                                updatePlanet(p.id, {
                                  stability: Number(e.target.value) || 0,
                                })
                              }
                            />
                          </label>
                          <p className="hint">
                            Зданий:{" "}
                            {(p.surfaceBuildings?.length ?? 0) +
                              (p.orbitalBuildings?.length ?? 0)}
                            . Ниже — поставить или снести без проверки технологий.
                          </p>
                          <PolityPlanetBuildings planet={p} />
                          <button
                            type="button"
                            className="btn tiny ghost"
                            onClick={() =>
                              jumpToGmMap({
                                factionId: faction.id,
                                systemId: sys.id,
                                planetId: p.id,
                                dive: "planet",
                              })
                            }
                          >
                            Планета на карте
                          </button>
                        </article>
                      ))}
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => {
                          selectSystem(sys.id);
                          addPlanet(sys.id);
                        }}
                      >
                        + Планета
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}
