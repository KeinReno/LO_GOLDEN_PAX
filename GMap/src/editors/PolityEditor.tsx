import { useState } from "react";
import { useWorldStore } from "../state/worldStore";
import type { DiplomacyRelation, Faction } from "../state/types";
import { DIPLOMACY_LABELS } from "../state/defaults";
import { resolvePolityKind, FACTION_NAME_FONT_OPTIONS } from "../state/territory";
import { fileToEmblemDataUrl } from "../io/emblemIo";
import { LAYER_PRESETS } from "../ui/mapLayers";

type PolityTab = "profile" | "territory" | "diplomacy" | "map";

const RELATIONS: DiplomacyRelation[] = [
  "neutral",
  "alliance",
  "trade",
  "war",
  "vassal",
  "truce",
];

const TABS: { id: PolityTab; label: string }[] = [
  { id: "profile", label: "Профиль" },
  { id: "territory", label: "Территория" },
  { id: "diplomacy", label: "Дипломатия" },
  { id: "map", label: "На карте" },
];

export function PolityEditor() {
  const world = useWorldStore((s) => s.world);
  const dossierFactionId = useWorldStore((s) => s.dossierFactionId);
  const setActiveFaction = useWorldStore((s) => s.setActiveFaction);
  const openPolityEditor = useWorldStore((s) => s.openPolityEditor);
  const addFaction = useWorldStore((s) => s.addFaction);
  const removeFaction = useWorldStore((s) => s.removeFaction);
  const [tab, setTab] = useState<PolityTab>("profile");

  const states = world.factions.filter((f) => resolvePolityKind(f) === "state");
  const factions = world.factions.filter(
    (f) => resolvePolityKind(f) === "faction",
  );
  const selected =
    world.factions.find((f) => f.id === dossierFactionId) ?? null;

  const selectFaction = (id: string) => {
    setActiveFaction(id);
    openPolityEditor(id);
  };

  return (
    <div className="polity-layout">
      <aside className="polity-list">
        <div className="polity-list-section">
          <h4>Государства</h4>
          {states.map((f) => (
            <PolityListRow
              key={f.id}
              faction={f}
              active={f.id === dossierFactionId}
              soft={false}
              onClick={() => selectFaction(f.id)}
            />
          ))}
          <button
            type="button"
            className="btn ghost block"
            onClick={() => {
              addFaction({
                name: `Государство ${states.length + 1}`,
                color: randomColor(),
                password: String(1000 + Math.floor(Math.random() * 9000)),
                kind: "state",
              });
              const id = useWorldStore.getState().activeFactionId;
              if (id) openPolityEditor(id);
            }}
          >
            + Государство
          </button>
        </div>
        <div className="polity-list-section">
          <h4>Фракции</h4>
          {factions.map((f) => (
            <PolityListRow
              key={f.id}
              faction={f}
              active={f.id === dossierFactionId}
              soft
              onClick={() => selectFaction(f.id)}
            />
          ))}
          <button
            type="button"
            className="btn ghost block"
            onClick={() => {
              addFaction({
                name: `Фракция ${factions.length + 1}`,
                color: randomColor(),
                password: String(1000 + Math.floor(Math.random() * 9000)),
                kind: "faction",
              });
              const id = useWorldStore.getState().activeFactionId;
              if (id) openPolityEditor(id);
            }}
          >
            + Фракция
          </button>
        </div>
      </aside>

      <div className="polity-main">
        {!selected && (
          <p className="hint">Выберите державу слева или создайте новую.</p>
        )}
        {selected && (
          <>
            <div className="polity-main-head">
              {selected.emblemPath ? (
                <img
                  className="polity-head-emblem"
                  src={selected.emblemPath}
                  alt=""
                />
              ) : (
                <span
                  className="swatch polity-head-swatch"
                  style={{ background: selected.color }}
                />
              )}
              <div>
                <h3>{selected.name}</h3>
                <p className="hint">
                  {resolvePolityKind(selected) === "state"
                    ? "Государство"
                    : "Фракция"}
                </p>
              </div>
              <button
                type="button"
                className="btn danger"
                disabled={world.factions.length <= 1}
                onClick={() => {
                  if (
                    confirm(
                      `Удалить «${selected.name}»? Владение, флоты и дипломатия этой стороны будут очищены.`,
                    )
                  ) {
                    removeFaction(selected.id);
                  }
                }}
              >
                Удалить
              </button>
            </div>

            <nav className="polity-tabs" aria-label="Разделы державы">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={tab === t.id ? "polity-tab active" : "polity-tab"}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </nav>

            <div className="polity-tab-body">
              {tab === "profile" && <ProfileTab faction={selected} />}
              {tab === "territory" && <TerritoryTab faction={selected} />}
              {tab === "diplomacy" && <DiplomacyTab faction={selected} />}
              {tab === "map" && <MapTab faction={selected} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PolityListRow({
  faction,
  active,
  soft,
  onClick,
}: {
  faction: Faction;
  active: boolean;
  soft: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={
        active
          ? soft
            ? "faction-row active faction-row-soft"
            : "faction-row active"
          : soft
            ? "faction-row faction-row-soft"
            : "faction-row"
      }
      onClick={onClick}
    >
      {faction.emblemPath ? (
        <img className="faction-emblem-thumb" src={faction.emblemPath} alt="" />
      ) : (
        <span className="swatch" style={{ background: faction.color }} />
      )}
      <span className="faction-name">{faction.name}</span>
    </button>
  );
}

function ProfileTab({ faction }: { faction: Faction }) {
  const updateFaction = useWorldStore((s) => s.updateFaction);

  return (
    <div className="faction-edit polity-profile">
      <label className="field">
        <span>Тип</span>
        <select
          value={resolvePolityKind(faction)}
          onChange={(e) =>
            updateFaction(faction.id, {
              kind: e.target.value as "state" | "faction",
            })
          }
        >
          <option value="state">Государство (территория на карте)</option>
          <option value="faction">Фракция (без обводки)</option>
        </select>
      </label>
      <label className="field">
        <span>Название</span>
        <input
          value={faction.name}
          onChange={(e) => updateFaction(faction.id, { name: e.target.value })}
        />
      </label>
      <label className="field">
        <span>Основной цвет</span>
        <input
          type="color"
          value={faction.color}
          onChange={(e) => updateFaction(faction.id, { color: e.target.value })}
        />
      </label>
      <fieldset className="polity-colors">
        <legend>Цвета на карте</legend>
        <label className="field">
          <span>Границы</span>
          <input
            type="color"
            value={faction.borderColor || faction.color}
            onChange={(e) =>
              updateFaction(faction.id, { borderColor: e.target.value })
            }
          />
        </label>
        <label className="field">
          <span>Пространство</span>
          <input
            type="color"
            value={faction.fillColor || faction.color}
            onChange={(e) =>
              updateFaction(faction.id, { fillColor: e.target.value })
            }
          />
        </label>
        <label className="field">
          <span>Системы</span>
          <input
            type="color"
            value={faction.systemColor || faction.color}
            onChange={(e) =>
              updateFaction(faction.id, { systemColor: e.target.value })
            }
          />
        </label>
        <label className="field">
          <span>Название</span>
          <input
            type="color"
            value={faction.nameColor || "#e8c547"}
            onChange={(e) =>
              updateFaction(faction.id, { nameColor: e.target.value })
            }
          />
        </label>
        <button
          type="button"
          className="btn ghost block"
          onClick={() =>
            updateFaction(faction.id, {
              borderColor: undefined,
              fillColor: undefined,
              systemColor: undefined,
              nameColor: undefined,
            })
          }
        >
          Сбросить к основному цвету
        </button>
      </fieldset>
      <label className="field">
        <span>Шрифт названия</span>
        <select
          value={
            faction.nameFont || "Cinzel, Times New Roman, serif"
          }
          onChange={(e) =>
            updateFaction(faction.id, { nameFont: e.target.value })
          }
        >
          {FACTION_NAME_FONT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <p
        className="hint polity-font-preview"
        style={{
          fontFamily:
            faction.nameFont || "Cinzel, Times New Roman, serif",
          color: faction.nameColor || "#e8c547",
          fontSize: "1.15rem",
          letterSpacing: "0.06em",
        }}
      >
        {faction.name || "Название государства"}
      </p>
      <label className="field">
        <span>Пароль игрока</span>
        <input
          value={faction.password}
          onChange={(e) =>
            updateFaction(faction.id, { password: e.target.value })
          }
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={!!faction.fullMapVision}
          onChange={(e) =>
            updateFaction(faction.id, { fullMapVision: e.target.checked })
          }
        />
        Видит всю карту (без тумана)
      </label>
      <label className="field">
        <span>Репутация у нейтралов (−100…+100)</span>
        <input
          type="number"
          min={-100}
          max={100}
          value={faction.neutralReputation ?? 0}
          onChange={(e) =>
            updateFaction(faction.id, {
              neutralReputation: Number(e.target.value) || 0,
            })
          }
        />
      </label>
      <p className="hint">
        Вольница, пираты, нейтральные хабы: положительная — торги и проход,
        отрицательная — засады и отказы.
      </p>
      <label className="field">
        <span>Герб</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            void fileToEmblemDataUrl(file)
              .then((emblemPath) => updateFaction(faction.id, { emblemPath }))
              .catch(() => {
                /* ignore */
              });
            e.target.value = "";
          }}
        />
      </label>
      <p className="hint">
        PNG/WebP до ~128px. Слой «Имена / гербы» должен быть включён.
      </p>
      {faction.emblemPath && (
        <div className="emblem-preview">
          <img src={faction.emblemPath} alt="Герб" />
          <button
            type="button"
            className="btn ghost block"
            onClick={() => updateFaction(faction.id, { emblemPath: "" })}
          >
            Убрать герб
          </button>
        </div>
      )}
    </div>
  );
}

function TerritoryTab({ faction }: { faction: Faction }) {
  const world = useWorldStore((s) => s.world);
  const setTool = useWorldStore((s) => s.setTool);
  const setActiveFaction = useWorldStore((s) => s.setActiveFaction);
  const closePolityEditor = useWorldStore((s) => s.closePolityEditor);
  const beginAssignCapital = useWorldStore((s) => s.beginAssignCapital);
  const clearFactionOwnership = useWorldStore((s) => s.clearFactionOwnership);
  const focusCameraOnSystem = useWorldStore((s) => s.focusCameraOnSystem);
  const openSystemView = useWorldStore((s) => s.openSystemView);

  const owned = world.systems.filter((s) => s.ownerFactionId === faction.id);
  const capital = owned.find((s) => s.isCapital) ?? null;

  return (
    <div className="polity-territory">
      <p className="meta-line">
        Систем во владении: <strong>{owned.length}</strong>
      </p>
      <div className="sys-meta-row">
        <span>Столица</span>
        <strong>{capital ? capital.name : "не назначена"}</strong>
      </div>
      <div className="btn-col">
        {capital && (
          <>
            <button
              type="button"
              className="btn primary"
              onClick={() => focusCameraOnSystem(capital.id)}
            >
              На карте к столице
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => openSystemView(capital.id)}
            >
              Открыть систему столицы
            </button>
          </>
        )}
        <button
          type="button"
          className="btn"
          onClick={() => beginAssignCapital(faction.id)}
        >
          Назначить столицу кликом по системе
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            setActiveFaction(faction.id);
            setTool("paint_faction");
            closePolityEditor();
          }}
        >
          Кисть владения на карте
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
          Снять всё владение
        </button>
      </div>
      {owned.length > 0 && (
        <div className="polity-owned-list">
          <h4>Системы</h4>
          <ul>
            {owned
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name, "ru"))
              .map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => focusCameraOnSystem(s.id)}
                  >
                    {s.isCapital ? "★ " : ""}
                    {s.name}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DiplomacyTab({ faction }: { faction: Faction }) {
  const world = useWorldStore((s) => s.world);
  const setDiplomacy = useWorldStore((s) => s.setDiplomacy);
  const setDiplomacyPanelOpen = useWorldStore((s) => s.setDiplomacyPanelOpen);
  const closePolityEditor = useWorldStore((s) => s.closePolityEditor);
  const others = world.factions.filter((f) => f.id !== faction.id);

  const getRelation = (otherId: string): DiplomacyRelation => {
    const [x, y] =
      faction.id < otherId ? [faction.id, otherId] : [otherId, faction.id];
    return (
      world.diplomacy.find((d) => d.aId === x && d.bId === y)?.relation ??
      "neutral"
    );
  };

  return (
    <div className="polity-diplomacy">
      <p className="hint">Отношения выбранной державы с остальными.</p>
      <div className="polity-diplo-rows">
        {others.map((other) => (
          <label key={other.id} className="polity-diplo-row">
            <span className="polity-diplo-name">
              {other.emblemPath ? (
                <img
                  className="faction-emblem-thumb"
                  src={other.emblemPath}
                  alt=""
                />
              ) : (
                <span className="swatch" style={{ background: other.color }} />
              )}
              {other.name}
            </span>
            <select
              value={getRelation(other.id)}
              onChange={(e) =>
                setDiplomacy(
                  faction.id,
                  other.id,
                  e.target.value as DiplomacyRelation,
                )
              }
            >
              {RELATIONS.map((r) => (
                <option key={r} value={r}>
                  {DIPLOMACY_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <button
        type="button"
        className="btn block"
        onClick={() => {
          closePolityEditor();
          setDiplomacyPanelOpen(true);
        }}
      >
        Полная матрица дипломатии…
      </button>
    </div>
  );
}

function MapTab({ faction }: { faction: Faction }) {
  const world = useWorldStore((s) => s.world);
  const applyMapLayerFlags = useWorldStore((s) => s.applyMapLayerFlags);
  const showFactionLabels = useWorldStore((s) => s.showFactionLabels);
  const toggleShowFactionLabels = useWorldStore(
    (s) => s.toggleShowFactionLabels,
  );
  const showTerritory = useWorldStore((s) => s.showTerritory);
  const toggleShowTerritory = useWorldStore((s) => s.toggleShowTerritory);
  const showDiplomacy = useWorldStore((s) => s.showDiplomacy);
  const toggleShowDiplomacy = useWorldStore((s) => s.toggleShowDiplomacy);
  const focusCameraOnSystem = useWorldStore((s) => s.focusCameraOnSystem);
  const setActiveFaction = useWorldStore((s) => s.setActiveFaction);
  const closePolityEditor = useWorldStore((s) => s.closePolityEditor);

  const capital = world.systems.find(
    (s) => s.ownerFactionId === faction.id && s.isCapital,
  );

  return (
    <div className="polity-map-tab">
      <h4>Пресеты слоёв</h4>
      <div className="layer-preset-row">
        {LAYER_PRESETS.filter(
          (p) => p.id === "politics" || p.id === "overview",
        ).map((p) => (
          <button
            key={p.id}
            type="button"
            className="btn ghost"
            title={p.hint}
            onClick={() => applyMapLayerFlags(p.flags)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="btn-col" style={{ marginTop: 12 }}>
        <label className="check">
          <input
            type="checkbox"
            checked={showTerritory}
            onChange={toggleShowTerritory}
          />
          Территории
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={showFactionLabels}
            onChange={toggleShowFactionLabels}
          />
          Имена / гербы
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={showDiplomacy}
            onChange={toggleShowDiplomacy}
          />
          Линии дипломатии
        </label>
      </div>
      <div className="btn-col" style={{ marginTop: 12 }}>
        {capital && (
          <button
            type="button"
            className="btn primary"
            onClick={() => focusCameraOnSystem(capital.id)}
          >
            Фокус камеры на столицу
          </button>
        )}
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            setActiveFaction(faction.id);
            closePolityEditor();
          }}
        >
          Закрыть и сделать активной для инструментов
        </button>
      </div>
    </div>
  );
}

function randomColor(): string {
  const h = Math.floor(Math.random() * 360);
  return hslToHex(h, 65, 55);
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) =>
    Math.round(255 * x)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}
