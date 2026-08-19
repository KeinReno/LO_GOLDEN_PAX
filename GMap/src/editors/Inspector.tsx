import { useState } from "react";
import { useWorldStore } from "../state/worldStore";
import type {
  FleetKind,
  FleetStance,
  LegionStatus,
  LinkType,
  StarSystem,
  SystemActivity,
} from "../state/types";
import {
  FLEET_KIND_LABELS,
  FLEET_STANCE_LABELS,
  LEGION_STATUS_LABELS,
  LINK_TYPE_LABELS,
  SHIP_TYPES,
  SYSTEM_ACTIVITY_LABELS,
  SYSTEM_POI_LABELS,
} from "../state/defaults";
import { paintTagList, resourcesHas, toggleDeposit } from "../state/depositPaint";
import { resourceDisplayName } from "../state/economyLabels";
import { resolvePolityKind } from "../state/territory";
import { SPACE_OBJECT_TYPES } from "../state/types";
import { hasSpaceObject } from "../state/spaceObjects";
import { v4 as uuid } from "uuid";

export function Inspector() {
  const world = useWorldStore((s) => s.world);
  const selectedSystemId = useWorldStore((s) => s.selectedSystemId);
  const pendingCapitalFactionId = useWorldStore(
    (s) => s.pendingCapitalFactionId,
  );

  const selectedFleetId = useWorldStore((s) => s.selectedFleetId);
  const selectedLegionId = useWorldStore((s) => s.selectedLegionId);
  const selectedLinkId = useWorldStore((s) => s.selectedLinkId);
  const selectedSectorId = useWorldStore((s) => s.selectedSectorId);
  const updateFleet = useWorldStore((s) => s.updateFleet);
  const deleteFleet = useWorldStore((s) => s.deleteFleet);
  const updateLegion = useWorldStore((s) => s.updateLegion);
  const deleteLegion = useWorldStore((s) => s.deleteLegion);
  const updateLink = useWorldStore((s) => s.updateLink);
  const deleteLink = useWorldStore((s) => s.deleteLink);
  const updateSector = useWorldStore((s) => s.updateSector);
  const deleteSector = useWorldStore((s) => s.deleteSector);
  const reassignSectorSystems = useWorldStore((s) => s.reassignSectorSystems);
  const selectSector = useWorldStore((s) => s.selectSector);
  const openSystemView = useWorldStore((s) => s.openSystemView);

  const system = world.systems.find((s) => s.id === selectedSystemId) ?? null;
  const fleet = world.fleets.find((f) => f.id === selectedFleetId) ?? null;
  const legion = world.legions.find((l) => l.id === selectedLegionId) ?? null;
  const link = world.links.find((l) => l.id === selectedLinkId) ?? null;
  const sector = world.sectors.find((s) => s.id === selectedSectorId) ?? null;
  const pendingCapitalFaction =
    world.factions.find((f) => f.id === pendingCapitalFactionId) ?? null;

  const hasSelection = !!(system || fleet || legion || link || sector);

  return (
    <aside className="panel panel-right insp">
      <header className="insp-head">
        <p className="insp-kicker">На карте</p>
        <h3>
          {fleet
            ? fleet.name
            : legion
              ? legion.name
              : link
                ? "Связь"
                : sector
                  ? sector.name
                  : system
                    ? system.name
                    : "Не выбрано"}
        </h3>
        <p className="insp-kind">
          {fleet
            ? "Флот"
            : legion
              ? "Легион"
              : link
                ? "Коридор"
                : sector
                  ? "Сектор"
                  : system
                    ? "Система"
                    : "Клик по системе / флоту"}
        </p>
      </header>

      {pendingCapitalFaction && (
        <div className="polity-pending-box">
          <p className="hint polity-pending-hint">
            Клик по системе → столица «{pendingCapitalFaction.name}»
          </p>
          <button
            type="button"
            className="btn ghost block"
            onClick={() =>
              useWorldStore.setState({ pendingCapitalFactionId: null })
            }
          >
            Отмена
          </button>
        </div>
      )}

      {!hasSelection && (
        <section className="insp-empty">
          <p className="insp-empty-lead">
            Карточка выбранного объекта, не каталог. Клик по системе, флоту или
            легиону. F1 — очередь, F2 — казна, F7 — доска квестов. На выбранной
            системе — «На системе». Дипломатия — меню «Стол…». Конструкторы —
            «Мастерская».
          </p>
          {world.sectors.length > 0 && (
            <details className="insp-fold">
              <summary>Секторы · {world.sectors.length}</summary>
              <div className="faction-list">
                {world.sectors.map((sec) => (
                  <button
                    key={sec.id}
                    type="button"
                    className="faction-row"
                    onClick={() => selectSector(sec.id)}
                  >
                    <span
                      className="swatch"
                      style={{ background: sec.color ?? "#6a7a90" }}
                    />
                    <span className="faction-name">{sec.name}</span>
                  </button>
                ))}
              </div>
            </details>
          )}
        </section>
      )}

      {/* Only one focus: fleet > legion > link > sector > system */}
      {fleet ? (
        <FleetPanel
          fleet={fleet}
          world={world}
          updateFleet={updateFleet}
          deleteFleet={deleteFleet}
        />
      ) : legion ? (
        <LegionPanel
          legion={legion}
          world={world}
          updateLegion={updateLegion}
          deleteLegion={deleteLegion}
        />
      ) : link ? (
        <LinkPanel
          link={link}
          world={world}
          updateLink={updateLink}
          deleteLink={deleteLink}
        />
      ) : sector ? (
    <section className="insp-sheet">
          <h3>Сектор</h3>
          <label className="field">
            <span>Название</span>
            <input
              value={sector.name}
              onChange={(e) => updateSector(sector.id, { name: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Цвет контура</span>
            <input
              type="color"
              value={
                sector.color?.startsWith("#") ? sector.color : "#6a7a90"
              }
              onChange={(e) =>
                updateSector(sector.id, { color: e.target.value })
              }
            />
          </label>
          <p className="hint">
            Систем внутри:{" "}
            {world.systems.filter((s) => s.sectorId === sector.id).length}
          </p>
          <button
            type="button"
            className="btn ghost block"
            onClick={() => reassignSectorSystems(sector.id)}
          >
            Пересчитать системы по полигону
          </button>
          <button
            type="button"
            className="btn danger block"
            onClick={() => deleteSector(sector.id)}
          >
            Удалить сектор
          </button>
        </section>
      ) : system ? (
        <SystemCard
          system={system}
          onOpenDossier={() => openSystemView(system.id)}
        />
      ) : null}
    </aside>
  );
}

function FleetPanel({
  fleet,
  world,
  updateFleet,
  deleteFleet,
}: {
  fleet: NonNullable<ReturnType<typeof useWorldStore.getState>["world"]["fleets"][number]>;
  world: ReturnType<typeof useWorldStore.getState>["world"];
  updateFleet: (id: string, patch: Partial<typeof fleet>) => void;
  deleteFleet: (id: string) => void;
}) {
  const fleetComposition = fleet.composition ?? [];
  return (
    <section className="insp-sheet">
      <h3>Флот</h3>
      <label className="field">
        <span>Название</span>
        <input
          value={fleet.name}
          onChange={(e) => updateFleet(fleet.id, { name: e.target.value })}
        />
      </label>
      <p className="hint">
        Система:{" "}
        <strong>
          {world.systems.find((s) => s.id === fleet.systemId)?.name ?? "—"}
        </strong>
        <br />
        Перетащи иконку флота на другую систему на карте.
      </p>
      <label className="field">
        <span>Тип флота</span>
        <select
          value={fleet.kind ?? "combat"}
          onChange={(e) =>
            updateFleet(fleet.id, {
              kind: e.target.value as FleetKind,
            })
          }
        >
          {(Object.keys(FLEET_KIND_LABELS) as FleetKind[]).map((k) => (
            <option key={k} value={k}>
              {FLEET_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Позиция</span>
        <select
          value={fleet.stance}
          onChange={(e) =>
            updateFleet(fleet.id, {
              stance: e.target.value as FleetStance,
            })
          }
        >
          {(Object.keys(FLEET_STANCE_LABELS) as FleetStance[]).map((k) => (
            <option key={k} value={k}>
              {FLEET_STANCE_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      <div className="block-title">Состав</div>
      {fleetComposition.map((c, i) => (
        <div key={`${c.type}-${i}`} className="comp-row">
          <select
            value={c.type}
            onChange={(e) => {
              const composition = fleetComposition.map((row, j) =>
                j === i ? { ...row, type: e.target.value } : row,
              );
              updateFleet(fleet.id, { composition });
            }}
          >
            {SHIP_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            value={c.count}
            onChange={(e) => {
              const composition = fleetComposition.map((row, j) =>
                j === i
                  ? { ...row, count: Number(e.target.value) || 0 }
                  : row,
              );
              updateFleet(fleet.id, { composition });
            }}
          />
        </div>
      ))}
      <button
        type="button"
        className="btn ghost block"
        onClick={() =>
          updateFleet(fleet.id, {
            composition: [
              ...fleetComposition,
              { type: SHIP_TYPES[0]!, count: 1 },
            ],
          })
        }
      >
        + Корабли
      </button>
      <button
        type="button"
        className="btn danger block"
        onClick={() => {
          if (confirm(`Удалить флот «${fleet.name}»?`)) deleteFleet(fleet.id);
        }}
      >
        Удалить флот
      </button>
    </section>
  );
}

function LegionPanel({
  legion,
  world,
  updateLegion,
  deleteLegion,
}: {
  legion: NonNullable<
    ReturnType<typeof useWorldStore.getState>["world"]["legions"][number]
  >;
  world: ReturnType<typeof useWorldStore.getState>["world"];
  updateLegion: (id: string, patch: Partial<typeof legion>) => void;
  deleteLegion: (id: string) => void;
}) {
  return (
    <section className="insp-sheet">
      <h3>Легион</h3>
      <label className="field">
        <span>Название</span>
        <input
          value={legion.name}
          onChange={(e) => updateLegion(legion.id, { name: e.target.value })}
        />
      </label>
      <p className="hint">
        Система:{" "}
        <strong>
          {world.systems.find((s) => s.id === legion.systemId)?.name ?? "—"}
        </strong>
      </p>
      <label className="field">
        <span>Численность</span>
        <input
          type="number"
          min={0}
          value={legion.strength}
          onChange={(e) =>
            updateLegion(legion.id, {
              strength: Number(e.target.value) || 0,
            })
          }
        />
      </label>
      <label className="field">
        <span>Статус</span>
        <select
          value={legion.status}
          onChange={(e) =>
            updateLegion(legion.id, {
              status: e.target.value as LegionStatus,
            })
          }
        >
          {(Object.keys(LEGION_STATUS_LABELS) as LegionStatus[]).map((st) => (
            <option key={st} value={st}>
              {LEGION_STATUS_LABELS[st]}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="btn danger block"
        onClick={() => {
          if (confirm(`Удалить легион «${legion.name}»?`)) {
            deleteLegion(legion.id);
          }
        }}
      >
        Удалить легион
      </button>
    </section>
  );
}

function LinkPanel({
  link,
  world,
  updateLink,
  deleteLink,
}: {
  link: NonNullable<
    ReturnType<typeof useWorldStore.getState>["world"]["links"][number]
  >;
  world: ReturnType<typeof useWorldStore.getState>["world"];
  updateLink: (id: string, patch: Partial<typeof link>) => void;
  deleteLink: (id: string) => void;
}) {
  return (
    <section className="insp-sheet">
      <h3>Гиперлинк</h3>
      <p className="hint">
        {world.systems.find((s) => s.id === link.fromId)?.name ?? "?"} ↔{" "}
        {world.systems.find((s) => s.id === link.toId)?.name ?? "?"}
      </p>
      <label className="field">
        <span>Тип связи</span>
        <select
          value={link.type}
          onChange={(e) =>
            updateLink(link.id, { type: e.target.value as LinkType })
          }
        >
          {(Object.keys(LINK_TYPE_LABELS) as LinkType[]).map((t) => (
            <option key={t} value={t}>
              {LINK_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      {link.type === "damyl_planet" && (
        <>
          <label className="field">
            <span>Планета (откуда)</span>
            <select
              value={link.fromPlanetId ?? ""}
              onChange={(e) =>
                updateLink(link.id, {
                  fromPlanetId: e.target.value || null,
                })
              }
            >
              <option value="">—</option>
              {(
                world.systems.find((s) => s.id === link.fromId)?.planets ?? []
              ).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Планета (куда)</span>
            <select
              value={link.toPlanetId ?? ""}
              onChange={(e) =>
                updateLink(link.id, {
                  toPlanetId: e.target.value || null,
                })
              }
            >
              <option value="">—</option>
              {(
                world.systems.find((s) => s.id === link.toId)?.planets ?? []
              ).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <p className="hint">Только пехота / легионы.</p>
        </>
      )}
      {link.type === "damyl_space" && (
        <p className="hint">Дамильские космические врата — флот и легионы.</p>
      )}
      <button
        type="button"
        className="btn danger block"
        onClick={() => {
          const a =
            world.systems.find((s) => s.id === link.fromId)?.name ?? "?";
          const b = world.systems.find((s) => s.id === link.toId)?.name ?? "?";
          if (confirm(`Удалить связь «${a} ↔ ${b}»?`)) deleteLink(link.id);
        }}
      >
        Удалить связь
      </button>
    </section>
  );
}

function SystemCard({
  system,
  onOpenDossier,
}: {
  system: StarSystem;
  onOpenDossier: () => void;
}) {
  const world = useWorldStore((s) => s.world);
  const selectedSystemIds = useWorldStore((s) => s.selectedSystemIds);
  const updateSelectedSystem = useWorldStore((s) => s.updateSelectedSystem);
  const openPolityEditor = useWorldStore((s) => s.openPolityEditor);
  const setGmShellMode = useWorldStore((s) => s.setGmShellMode);
  const upsertQuest = useWorldStore((s) => s.upsertQuest);
  const setOpenQuestId = useWorldStore((s) => s.setOpenQuestId);
  const addCaravan = useWorldStore((s) => s.addCaravan);
  const setGmLiveDomain = useWorldStore((s) => s.setGmLiveDomain);
  const [advanced, setAdvanced] = useState(false);
  const owner = world.factions.find((f) => f.id === system.ownerFactionId);
  const quests = (world.quests ?? []).filter((q) => q.systemId === system.id);
  const caravansHere = (world.caravans ?? []).filter(
    (c) => c.fromSystemId === system.id || c.toSystemId === system.id,
  );
  const localCount = quests.length + caravansHere.length;
  const planetCount = system.planets?.length ?? 0;

  return (
    <section className="insp-sheet">
      <label className="field">
        <span>Название</span>
        <input
          value={system.name}
          onChange={(e) => updateSelectedSystem({ name: e.target.value })}
        />
      </label>
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
              .filter((f) => resolvePolityKind(f) === "state")
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
          </optgroup>
          <optgroup label="Фракции">
            {world.factions
              .filter((f) => resolvePolityKind(f) === "faction")
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
          </optgroup>
        </select>
      </label>
      {owner && (
        <button
          type="button"
          className="btn ghost block"
          onClick={() => {
            openPolityEditor(owner.id);
            setGmShellMode("polities");
          }}
        >
          Держава · {owner.name}
        </button>
      )}
      <div className="insp-chips">
        {system.isCapital && <span className="insp-chip">Столица</span>}
        {system.contested && <span className="insp-chip">Спор</span>}
        {system.blockaded && <span className="insp-chip">Блокада</span>}
        <span className="insp-chip">{planetCount} планет</span>
        {selectedSystemIds.length > 1 && (
          <span className="insp-chip">{selectedSystemIds.length} выделено</span>
        )}
      </div>
      <div className="insp-actions">
        <button type="button" className="btn primary block" onClick={onOpenDossier}>
          Планеты и постройки
        </button>
      </div>

      <details className="insp-fold">
        <summary>Метки карты</summary>
        <div className="block-title">Космос</div>
        <div className="tag-row space-obj-tags">
        {SPACE_OBJECT_TYPES.map((tag) => {
          const on = hasSpaceObject(system, tag);
          return (
            <button
              key={tag}
              type="button"
              className={on ? "tag on" : "tag"}
              title={SYSTEM_POI_LABELS[tag]}
              onClick={() => {
                const ids =
                  selectedSystemIds.length > 1
                    ? selectedSystemIds
                    : [system.id];
                useWorldStore.getState().applySystemPoiMany(ids, tag);
              }}
            >
              {SYSTEM_POI_LABELS[tag]}
            </button>
          );
        })}
      </div>

        <div className="block-title">Ресурсы</div>
        <div className="tag-row">
          {paintTagList(system.resources).map((r) => {
          const on = resourcesHas(system.resources, r);
          return (
            <button
              key={r}
              type="button"
              className={on ? "tag on" : "tag"}
              onClick={() =>
                updateSelectedSystem({
                  resources: toggleDeposit(system.resources, r),
                })
              }
            >
              {resourceDisplayName(r)}
            </button>
          );
        })}
      </div>
      </details>

      <details className="insp-fold">
        <summary>Владение</summary>
      <label className="check">
        <input
          type="checkbox"
          checked={!!system.contested}
          onChange={(e) =>
            updateSelectedSystem({ contested: e.target.checked })
          }
        />
        Спорная система
      </label>
      <label className="field">
        <span>Совладелец</span>
        <select
          value={(system.coOwnerFactionIds ?? [])[0] ?? ""}
          onChange={(e) =>
            updateSelectedSystem({
              coOwnerFactionIds: e.target.value ? [e.target.value] : [],
            })
          }
        >
          <option value="">— нет —</option>
          {world.factions
            .filter((f) => f.id !== system.ownerFactionId)
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
          checked={!!system.isCapital}
          onChange={(e) =>
            updateSelectedSystem({ isCapital: e.target.checked })
          }
        />
        Столица
      </label>
      </details>

      <button
        type="button"
        className="btn ghost block"
        aria-expanded={advanced}
        onClick={() => setAdvanced((v) => !v)}
      >
        {advanced
          ? "Свернуть локальное"
          : localCount > 0
            ? `На системе · ${localCount}`
            : "На системе"}
      </button>
      {advanced && (
        <div className="insp-fold insp-fold--open">
          <p className="hint">
            Ситуация, квесты и караваны этой системы. Вся доска стола — F7
            Сессия.
          </p>
          <button
            type="button"
            className="btn ghost block"
            onClick={() => setGmLiveDomain("quests")}
          >
            Доска квестов · F7
          </button>
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
          <label className="check">
            <input
              type="checkbox"
              checked={!!system.blockaded}
              onChange={(e) =>
                updateSelectedSystem({ blockaded: e.target.checked })
              }
            />
            Блокада
          </label>
          <button
            type="button"
            className="btn ghost block"
            onClick={() => {
              const id = uuid();
              upsertQuest({
                id,
                name: `Квест · ${system.name}`,
                summary: "Описание задания для игроков / мастера.",
                detail: "",
                systemId: system.id,
                status: "active",
              });
              setOpenQuestId(id);
            }}
          >
            + Квест на систему
          </button>
          {quests.length === 0 && (
            <p className="hint">Нет квестов, привязанных к этой системе.</p>
          )}
          {quests.map((q) => (
            <button
              key={q.id}
              type="button"
              className="btn ghost block"
              onClick={() => setOpenQuestId(q.id)}
            >
              ◇ {q.name}
            </button>
          ))}
          {caravansHere.length > 0 && (
            <p className="hint">
              Караваны:{" "}
              {caravansHere
                .map((c) => {
                  const otherId =
                    c.fromSystemId === system.id ? c.toSystemId : c.fromSystemId;
                  const other =
                    world.systems.find((s) => s.id === otherId)?.name ?? otherId;
                  return `${c.name} → ${other}`;
                })
                .join("; ")}
            </p>
          )}
          <button
            type="button"
            className="btn ghost block"
            onClick={() => {
              const others = world.systems.filter((s) => s.id !== system.id);
              const to = others[Math.floor(Math.random() * others.length)];
              if (!to) return;
              if (
                !confirm(
                  `Караван из «${system.name}» в «${to.name}»? Цель случайная.`,
                )
              ) {
                return;
              }
              addCaravan({
                name: `Караван ${system.name.slice(0, 8)}`,
                fromSystemId: system.id,
                toSystemId: to.id,
                progress: 0,
                factionId: system.ownerFactionId,
              });
            }}
          >
            + Караван отсюда
          </button>
        </div>
      )}
    </section>
  );
}
