import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useWorldStore } from "../state/worldStore";
import type { DiplomacyRelation, Faction, FactionTrait } from "../state/types";
import { DIPLOMACY_LABELS, DIPLOMACY_RELATIONS } from "../state/defaults";
import { resolvePolityKind, FACTION_NAME_FONT_OPTIONS } from "../state/territory";
import { fileToEmblemDataUrl } from "../io/emblemIo";
import {
  fetchContent,
  getCachedContent,
  type PublicContent,
} from "../state/contentCatalog";
import { IDEOLOGY_LABELS, ideologyLabel } from "../state/displayLabels";
import { listCultures, listFaiths } from "../state/societyRegistry";
import { traitLabel } from "../viewer/codex/codexResolve";
import {
  MAP_MODE_PRESETS,
  applyLayerPreset,
  type MapLayerFlags,
} from "../ui/mapLayers";

type PolityTab = "profile" | "territory" | "diplomacy" | "map";

const RELATIONS: DiplomacyRelation[] = [...DIPLOMACY_RELATIONS];

const TABS: { id: PolityTab; label: string }[] = [
  { id: "profile", label: "Профиль" },
  { id: "territory", label: "Территория" },
  { id: "diplomacy", label: "Дипломатия" },
  { id: "map", label: "На карте" },
];

const MAX_FACTION_TRAITS = 3;
const BUDGET_MIN = -2;
const BUDGET_MAX = 2;

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
  const [catalog, setCatalog] = useState<PublicContent | null>(
    () => getCachedContent(),
  );

  useEffect(() => {
    void fetchContent().then((c) => {
      if (c) setCatalog(c);
    });
  }, []);

  const traitDefs = Object.values(catalog?.faction_traits?.traits || {});
  const selected = faction.traits ?? [];
  const selectedIds = new Set(selected.map((t) => t.id));
  const budgetSum = selected.reduce(
    (s, t) => s + (Number(t.balanceBudget) || 0),
    0,
  );
  const budgetOutOfRange = budgetSum < BUDGET_MIN || budgetSum > BUDGET_MAX;

  const toggleTrait = (def: {
    id: string;
    name: string;
    ideology?: string;
    balanceBudget: number;
    effects?: FactionTrait["effects"];
    conditions?: FactionTrait["conditions"];
  }) => {
    const exists = selectedIds.has(def.id);
    let next: FactionTrait[];
    if (exists) {
      next = selected.filter((t) => t.id !== def.id);
    } else {
      if (selected.length >= MAX_FACTION_TRAITS) return;
      next = [
        ...selected,
        {
          id: def.id,
          label: def.name,
          ideology: def.ideology,
          balanceBudget: def.balanceBudget ?? 0,
          effects: (def.effects || []).map((e) => ({
            effect: e.effect,
            args: e.args ? { ...e.args } : {},
          })),
          conditions: def.conditions,
        },
      ];
    }
    updateFaction(faction.id, { traits: next });
  };

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

      <fieldset className="polity-traits">
        <legend>Черты державы</legend>
        <p className="hint">
          До {MAX_FACTION_TRAITS} одновременно. Бюджет баланса:{" "}
          <strong
            className={
              budgetOutOfRange ? "polity-budget-warn" : "polity-budget-ok"
            }
          >
            {budgetSum > 0 ? `+${budgetSum}` : String(budgetSum)}
          </strong>{" "}
          (норма [{BUDGET_MIN}…{BUDGET_MAX}])
        </p>
        {budgetOutOfRange ? (
          <p className="hint polity-budget-warn" role="alert">
            Сумма balanceBudget вне диапазона — комбинация несбалансирована.
          </p>
        ) : null}
        {traitDefs.length === 0 ? (
          <p className="hint">Каталог черт не загружен (нужен API /content).</p>
        ) : (
          <ul className="polity-trait-list">
            {traitDefs.map((def) => {
              const on = selectedIds.has(def.id);
              const disabled = !on && selected.length >= MAX_FACTION_TRAITS;
              const budget = def.balanceBudget ?? 0;
              return (
                <li key={def.id}>
                  <label
                    className={
                      on
                        ? "polity-trait-row selected"
                        : disabled
                          ? "polity-trait-row disabled"
                          : "polity-trait-row"
                    }
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={disabled}
                      onChange={() => toggleTrait(def)}
                    />
                    <span className="polity-trait-body">
                      <span className="polity-trait-name">{def.name}</span>
                      <span className="hint">
                        {ideologyLabel(def.ideology)}{" "}
                        · бюджет {budget > 0 ? `+${budget}` : budget}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      <label className="field">
        <span>Основная раса</span>
        <select
          value={faction.primaryRaceId || ""}
          onChange={(e) =>
            updateFaction(faction.id, {
              primaryRaceId: e.target.value || undefined,
            })
          }
        >
          <option value="">— не задана —</option>
          {Object.values(catalog?.races || {}).map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Культура колоний по умолчанию</span>
        <select
          value={faction.defaultCultureId ?? "culture.baseline"}
          onChange={(e) =>
            updateFaction(faction.id, {
              defaultCultureId: e.target.value || "culture.baseline",
            })
          }
        >
          {listCultures().map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Государственная вера</span>
        <select
          value={faction.primaryFaith ?? "faith.secular"}
          onChange={(e) =>
            updateFaction(faction.id, {
              primaryFaith: e.target.value || "faith.secular",
            })
          }
        >
          {listFaiths().map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Доминирующая идеология</span>
        <select
          value={faction.dominantIdeology ?? ""}
          onChange={(e) =>
            updateFaction(faction.id, {
              dominantIdeology: e.target.value || undefined,
            })
          }
        >
          <option value="">— не задана —</option>
          {Object.keys(IDEOLOGY_LABELS).map((id) => (
            <option key={id} value={id}>
              {ideologyLabel(id)}
            </option>
          ))}
        </select>
      </label>

      {faction.primaryRaceId && catalog?.races?.[faction.primaryRaceId] ? (
        <fieldset className="polity-traits polity-race-traits">
          <legend>
            Черты расы · {catalog.races[faction.primaryRaceId].name}
          </legend>
          <p className="hint">
            Бюджет расы:{" "}
            <strong>
              {(catalog.races[faction.primaryRaceId].traits || []).reduce(
                (s, t) => s + (Number(t.balanceBudget) || 0),
                0,
              )}
            </strong>
          </p>
          <ul className="polity-trait-list">
            {(catalog.races[faction.primaryRaceId].traits || []).map((t) => (
              <li key={t.id}>
                <div className="polity-trait-row">
                  <span className="polity-trait-body">
                    <span className="polity-trait-name">{traitLabel(t.id, catalog)}</span>
                    <span className="hint">
                      бюджет{" "}
                      {(t.balanceBudget ?? 0) > 0
                        ? `+${t.balanceBudget}`
                        : String(t.balanceBudget ?? 0)}{" "}
                      · эффектов {(t.effects || []).length}
                    </span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}

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
        <span>Доктрина / заметки (игроку)</span>
        <textarea
          rows={5}
          value={faction.notes ?? ""}
          onChange={(e) => updateFaction(faction.id, { notes: e.target.value })}
        />
      </label>
      <label className="field">
        <span>GM notes (скрыто от игрока)</span>
        <textarea
          rows={3}
          value={faction.gmNotes ?? ""}
          onChange={(e) =>
            updateFaction(faction.id, { gmNotes: e.target.value })
          }
        />
      </label>
      {(faction.npcs?.length ?? 0) > 0 && (
        <div className="field">
          <span>Двор (NPC)</span>
          <ul className="hq-npc-list">
            {faction.npcs!.map((n) => (
              <li key={n.id} className="hq-npc-item">
                <strong>{n.name}</strong>
                {n.title ? <span className="hint"> — {n.title}</span> : null}
                {n.gmNotes ? (
                  <p className="hint" style={{ margin: "0.2rem 0 0" }}>
                    GM: {n.gmNotes}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="hint">
            Редактирование списка NPC — через JSON / скрипт сида (пока
            read-only в UI).
          </p>
        </div>
      )}
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
  const layerFlags = useWorldStore(
    useShallow(
      (s): MapLayerFlags => ({
        showLinks: s.showLinks,
        showOwnership: s.showOwnership,
        showTerritory: s.showTerritory,
        showSectors: s.showSectors,
        showFactionLabels: s.showFactionLabels,
        showLabels: s.showLabels,
        showFleets: s.showFleets,
        showLegions: s.showLegions,
        showOrders: s.showOrders,
        showDiplomacy: s.showDiplomacy,
        showFogPreview: s.showFogPreview,
        gmOmniscientView: s.gmOmniscientView,
        showJumpRange: s.showJumpRange,
        showSupply: s.showSupply,
        showCaravans: s.showCaravans,
        showBlockades: s.showBlockades,
        showDeadZones: s.showDeadZones,
        showTraffic: s.showTraffic,
        showQuests: s.showQuests,
        showLoyalty: s.showLoyalty,
      }),
    ),
  );
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
        {MAP_MODE_PRESETS.map((mode) => (
          <button
            key={mode.id}
            type="button"
            className="btn ghost"
            title={`${mode.hint} · ${mode.hotkey}`}
            onClick={() =>
              applyMapLayerFlags(applyLayerPreset(layerFlags, mode.id))
            }
          >
            {mode.label}
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
