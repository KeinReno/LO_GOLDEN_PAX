import { useMemo, useState } from "react";
import { v4 as uuid } from "uuid";
import { useWorldStore } from "../state/worldStore";
import type {
  Faction,
  Planet,
  PlanetBuildingZone,
  Quest,
  QuestStatus,
  QuestType,
  ViewerPayload,
} from "../state/types";
import { getCachedContent } from "../state/contentCatalog";
import { patchFromCatalogDef } from "../state/gmCatalogBuildings";
import { CatalogIdSelect } from "./gm/CatalogIdSelect";
import { gmJsonError, gmMasterPost } from "./gm/gmAsFaction";
import { resolveShipOrUnitName } from "../state/displayLabels";

const QUEST_STATUS_LABELS: Record<QuestStatus, string> = {
  active: "активен",
  done: "завершён",
  hidden: "скрыт",
  expired: "истёк",
};

const QUEST_TYPE_LABELS: Record<QuestType, string> = {
  main: "Основной",
  side: "Сайд",
  faction: "Фракционный",
  foreign: "От державы",
  yearly: "Ежеходный",
};

function catalogOptions(
  bag: Record<string, { id?: string; name?: string } | undefined> | undefined,
) {
  return Object.values(bag ?? {})
    .filter((d): d is { id: string; name?: string } => Boolean(d?.id))
    .map((d) => ({ id: d.id, name: d.name ?? d.id }));
}

export function PolityScienceMaster({
  factionId,
  masterToken,
  eco,
  onEco,
}: {
  factionId: string;
  masterToken: string;
  eco?: ViewerPayload["economy"] | null;
  onEco: (next?: ViewerPayload["economy"] | null) => void;
}) {
  const content = getCachedContent();
  const techs = useMemo(
    () => catalogOptions(content?.technologies),
    [content],
  );
  const recipes = useMemo(
    () => catalogOptions(content?.tech_recipes),
    [content],
  );
  const unlocked = new Set(eco?.unlockedTechs ?? []);
  const knownRecipes = new Set(eco?.alchemy?.discoveredRecipes ?? []);
  const [grantId, setGrantId] = useState("");
  const [revokeId, setRevokeId] = useState("");
  const [recipeGrant, setRecipeGrant] = useState("");
  const [recipeRevoke, setRecipeRevoke] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const post = async (url: string, extra: Record<string, unknown>) => {
    setBusy(true);
    setMsg(null);
    try {
      const result = await gmMasterPost(url, masterToken, {
        factionId,
        ...extra,
      });
      if (!result.ok) throw new Error(gmJsonError(result, String(result.status)));
      const economy = result.data.economy as ViewerPayload["economy"] | undefined;
      if (economy) onEco(economy);
      const tech = result.data.tech as { name?: string; id?: string } | undefined;
      const recipe = result.data.recipe as { name?: string; id?: string } | undefined;
      setMsg(tech?.name || recipe?.name || "Готово");
      setGrantId("");
      setRevokeId("");
      setRecipeGrant("");
      setRecipeRevoke("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="polity-master" open>
      <summary>Мастер · наука</summary>
      <p className="hint">
        Выдать или забрать без очереди и оплаты — игрок этого не может.
      </p>
      <div className="polity-hold-toolbar">
        <CatalogIdSelect
          value={grantId}
          onChange={setGrantId}
          options={techs.filter((t) => !unlocked.has(t.id))}
          emptyLabel="— выдать технологию —"
        />
        <button
          type="button"
          className="btn primary"
          disabled={busy || !grantId}
          onClick={() =>
            void post("/api/economy/research", { techId: grantId, free: true })
          }
        >
          Выдать
        </button>
        <CatalogIdSelect
          value={revokeId}
          onChange={setRevokeId}
          options={techs.filter((t) => unlocked.has(t.id))}
          emptyLabel="— забрать технологию —"
        />
        <button
          type="button"
          className="btn danger"
          disabled={busy || !revokeId}
          onClick={() =>
            void post("/api/economy/research/revoke", { techId: revokeId })
          }
        >
          Забрать
        </button>
      </div>
      <div className="polity-hold-toolbar">
        <CatalogIdSelect
          value={recipeGrant}
          onChange={setRecipeGrant}
          options={recipes.filter((r) => !knownRecipes.has(r.id))}
          emptyLabel="— выдать рецепт —"
        />
        <button
          type="button"
          className="btn"
          disabled={busy || !recipeGrant}
          onClick={() =>
            void post("/api/economy/alchemy/grant-recipe", {
              recipeId: recipeGrant,
            })
          }
        >
          Рецепт
        </button>
        <CatalogIdSelect
          value={recipeRevoke}
          onChange={setRecipeRevoke}
          options={recipes.filter((r) => knownRecipes.has(r.id))}
          emptyLabel="— забрать рецепт —"
        />
        <button
          type="button"
          className="btn danger ghost"
          disabled={busy || !recipeRevoke}
          onClick={() =>
            void post("/api/economy/alchemy/revoke-recipe", {
              recipeId: recipeRevoke,
            })
          }
        >
          Забрать рецепт
        </button>
      </div>
      {msg ? <p className="hint">{msg}</p> : null}
    </details>
  );
}

export function PolityForcesMaster({ faction }: { faction: Faction }) {
  const world = useWorldStore((s) => s.world);
  const setActiveFaction = useWorldStore((s) => s.setActiveFaction);
  const placeFleetOnSystem = useWorldStore((s) => s.placeFleetOnSystem);
  const placeLegionOnSystem = useWorldStore((s) => s.placeLegionOnSystem);
  const updateFleet = useWorldStore((s) => s.updateFleet);
  const updateLegion = useWorldStore((s) => s.updateLegion);
  const relocateFleet = useWorldStore((s) => s.relocateFleet);
  const relocateLegion = useWorldStore((s) => s.relocateLegion);
  const deleteFleet = useWorldStore((s) => s.deleteFleet);
  const deleteLegion = useWorldStore((s) => s.deleteLegion);
  const selectedFleetId = useWorldStore((s) => s.selectedFleetId);
  const selectedLegionId = useWorldStore((s) => s.selectedLegionId);

  const [dropSys, setDropSys] = useState(
    () =>
      world.systems.find((s) => s.ownerFactionId === faction.id)?.id ??
      world.systems[0]?.id ??
      "",
  );
  const [shipId, setShipId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [dropGroup, setDropGroup] = useState("");

  const content = getCachedContent();
  const sysOpts = world.systems.map((s) => ({ id: s.id, name: s.name }));
  const ships = useMemo(() => catalogOptions(content?.ships), [content]);
  const units = useMemo(() => catalogOptions(content?.units), [content]);

  const fleet = world.fleets.find(
    (f) => f.id === selectedFleetId && f.factionId === faction.id,
  );
  const legion = world.legions.find(
    (l) => l.id === selectedLegionId && l.factionId === faction.id,
  );

  const addToFleet = () => {
    if (!fleet || !shipId) return;
    const def = ships.find((s) => s.id === shipId);
    updateFleet(fleet.id, {
      composition: [
        ...fleet.composition,
        { type: def?.name || shipId, defId: shipId, count: 1 },
      ],
    });
    setShipId("");
  };

  const addToLegion = () => {
    if (!legion || !unitId) return;
    const def = units.find((u) => u.id === unitId);
    const prev = legion.composition ?? [];
    updateLegion(legion.id, {
      composition: [
        ...prev,
        { type: def?.name || unitId, defId: unitId, count: 1 },
      ],
    });
    setUnitId("");
  };

  const removeGroup = () => {
    if (!dropGroup) return;
    if (fleet) {
      updateFleet(fleet.id, {
        composition: fleet.composition.filter(
          (g) => (g.defId || g.type) !== dropGroup,
        ),
      });
    } else if (legion) {
      updateLegion(legion.id, {
        composition: (legion.composition ?? []).filter(
          (g) => (g.defId || g.type) !== dropGroup,
        ),
      });
    }
    setDropGroup("");
  };

  const groups = (fleet?.composition ?? legion?.composition ?? [])
    .map((g) => {
      const id = String(g.defId || g.type || "");
      return {
        id,
        name: `${g.count}× ${resolveShipOrUnitName(id)}`,
      };
    })
    .filter((g) => g.id);

  return (
    <details className="polity-master" open>
      <summary>Мастер · силы</summary>
      <p className="hint">
        Появление и состав без верфи, казарм и оплаты. Оснащение слотов — в колоде
        справа; запасы — во вкладке Экономика.
      </p>
      <div className="polity-hold-toolbar">
        <CatalogIdSelect
          value={dropSys}
          onChange={setDropSys}
          options={sysOpts}
          emptyLabel="— система появления —"
          allowEmpty={false}
        />
        <button
          type="button"
          className="btn"
          disabled={!dropSys}
          onClick={() => {
            setActiveFaction(faction.id);
            placeFleetOnSystem(dropSys);
          }}
        >
          Новый флот
        </button>
        <button
          type="button"
          className="btn"
          disabled={!dropSys}
          onClick={() => {
            setActiveFaction(faction.id);
            placeLegionOnSystem(dropSys);
          }}
        >
          Новый легион
        </button>
      </div>
      {fleet ? (
        <div className="polity-hold-toolbar">
          <span className="hint">Флот «{fleet.name}»</span>
          <CatalogIdSelect
            value={shipId}
            onChange={setShipId}
            options={ships}
            emptyLabel="— корабль в состав —"
          />
          <button type="button" className="btn primary" disabled={!shipId} onClick={addToFleet}>
            Добавить
          </button>
          <CatalogIdSelect
            value={fleet.systemId}
            onChange={(id) => relocateFleet(fleet.id, id)}
            options={sysOpts}
            emptyLabel="— переместить —"
            allowEmpty={false}
          />
          <button
            type="button"
            className="btn danger ghost"
            onClick={() => {
              if (confirm(`Распустить флот «${fleet.name}»?`)) deleteFleet(fleet.id);
            }}
          >
            Распустить
          </button>
        </div>
      ) : (
        <p className="hint">Выберите флот в колоде, чтобы править состав.</p>
      )}
      {legion ? (
        <div className="polity-hold-toolbar">
          <span className="hint">Легион «{legion.name}»</span>
          <CatalogIdSelect
            value={unitId}
            onChange={setUnitId}
            options={units}
            emptyLabel="— отряд в состав —"
          />
          <button type="button" className="btn primary" disabled={!unitId} onClick={addToLegion}>
            Добавить
          </button>
          <CatalogIdSelect
            value={legion.systemId}
            onChange={(id) => relocateLegion(legion.id, id)}
            options={sysOpts}
            emptyLabel="— переместить —"
            allowEmpty={false}
          />
          <button
            type="button"
            className="btn danger ghost"
            onClick={() => {
              if (confirm(`Распустить легион «${legion.name}»?`)) deleteLegion(legion.id);
            }}
          >
            Распустить
          </button>
        </div>
      ) : null}
      {groups.length > 0 ? (
        <div className="polity-hold-toolbar">
          <CatalogIdSelect
            value={dropGroup}
            onChange={setDropGroup}
            options={groups}
            emptyLabel="— убрать из состава —"
          />
          <button type="button" className="btn danger" disabled={!dropGroup} onClick={removeGroup}>
            Убрать группу
          </button>
        </div>
      ) : null}
    </details>
  );
}

export function PolityPlanetBuildings({ planet }: { planet: Planet }) {
  const updatePlanet = useWorldStore((s) => s.updatePlanet);
  const content = getCachedContent();
  const [buildingId, setBuildingId] = useState("");
  const [zone, setZone] = useState<PlanetBuildingZone>("surface");

  const buildings = useMemo(
    () =>
      catalogOptions(content?.buildings).filter((b) => {
        const def = content?.buildings?.[b.id];
        const z = def?.zone || "surface";
        return zone === "orbital" ? z === "orbital" : z !== "orbital";
      }),
    [content, zone],
  );

  const list =
    zone === "orbital"
      ? planet.orbitalBuildings ?? []
      : planet.surfaceBuildings ?? [];

  const add = () => {
    const def = content?.buildings?.[buildingId];
    if (!def?.id) return;
    const next = [
      ...list,
      { id: uuid(), ...patchFromCatalogDef(def) },
    ];
    updatePlanet(
      planet.id,
      zone === "orbital" ? { orbitalBuildings: next } : { surfaceBuildings: next },
    );
    setBuildingId("");
  };

  const patchList = (
    next: typeof list,
  ) => {
    updatePlanet(
      planet.id,
      zone === "orbital" ? { orbitalBuildings: next } : { surfaceBuildings: next },
    );
  };

  return (
    <div className="polity-master polity-master--inline">
      <div className="polity-hold-toolbar">
        <select value={zone} onChange={(e) => setZone(e.target.value as PlanetBuildingZone)}>
          <option value="surface">Поверхность</option>
          <option value="orbital">Орбита</option>
        </select>
        <CatalogIdSelect
          value={buildingId}
          onChange={setBuildingId}
          options={buildings}
          emptyLabel="— здание из каталога —"
        />
        <button type="button" className="btn primary" disabled={!buildingId} onClick={add}>
          Поставить
        </button>
      </div>
      {list.length === 0 ? (
        <p className="hint">Нет построек в этой зоне.</p>
      ) : (
        <ul className="polity-force-list">
          {list.map((b) => (
            <li key={b.id} className="polity-hold-toolbar">
              <span>
                {b.name}
                {b.disabled ? " · откл." : ""}
              </span>
              <button
                type="button"
                className="btn tiny ghost"
                onClick={() =>
                  patchList(
                    list.map((x) =>
                      x.id === b.id ? { ...x, disabled: !x.disabled } : x,
                    ),
                  )
                }
              >
                {b.disabled ? "Включить" : "Отключить"}
              </button>
              <button
                type="button"
                className="btn tiny danger ghost"
                onClick={() => patchList(list.filter((x) => x.id !== b.id))}
              >
                Снести
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PolityQuestsTab({ faction }: { faction: Faction }) {
  const world = useWorldStore((s) => s.world);
  const upsertQuest = useWorldStore((s) => s.upsertQuest);
  const removeQuest = useWorldStore((s) => s.removeQuest);
  const jumpToGmMap = useWorldStore((s) => s.jumpToGmMap);
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [type, setType] = useState<QuestType>("faction");
  const [systemId, setSystemId] = useState(
    world.systems.find((s) => s.ownerFactionId === faction.id)?.id ?? "",
  );

  const ownedIds = new Set(
    world.systems
      .filter((s) => s.ownerFactionId === faction.id)
      .map((s) => s.id),
  );
  const quests = (world.quests ?? []).filter(
    (q) =>
      q.sourceFactionId === faction.id ||
      (q.systemId && ownedIds.has(q.systemId)),
  );
  const sysOpts = world.systems.map((s) => ({ id: s.id, name: s.name }));

  const create = () => {
    if (!name.trim()) return;
    const q: Quest = {
      id: `quest_${uuid().slice(0, 8)}`,
      name: name.trim(),
      summary: summary.trim(),
      detail: "",
      systemId: systemId || null,
      status: "active",
      type,
      sourceFactionId: faction.id,
      history: [
        {
          at: new Date().toISOString(),
          turn: world.meta.turn,
          kind: "message",
          body: "Создан мастером в досье державы",
        },
      ],
    };
    upsertQuest(q);
    setName("");
    setSummary("");
  };

  return (
    <div className="polity-hold">
      <p className="hint">
        Квесты этой державы и якоря на её системах. Каталог шаблонов — Мастерская →
        Каталоги.
      </p>
      <div className="polity-hold-toolbar">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as QuestType)}
        >
          {(Object.keys(QUEST_TYPE_LABELS) as QuestType[]).map((t) => (
            <option key={t} value={t}>
              {QUEST_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <CatalogIdSelect
          value={systemId}
          onChange={setSystemId}
          options={sysOpts}
          emptyLabel="— без системы —"
        />
        <button type="button" className="btn primary" disabled={!name.trim()} onClick={create}>
          Создать
        </button>
      </div>
      <label className="field">
        <span>Кратко</span>
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} />
      </label>
      {quests.length === 0 ? (
        <p className="hint">Нет квестов у этой державы.</p>
      ) : (
        <ul className="polity-force-list">
          {quests.map((q) => (
            <li key={q.id} className="polity-force-card">
              <strong>{q.name}</strong>
              <p className="hint">{q.summary || "—"}</p>
              <div className="polity-hold-toolbar">
                <select
                  value={q.status}
                  onChange={(e) =>
                    upsertQuest({
                      ...q,
                      status: e.target.value as QuestStatus,
                    })
                  }
                >
                  {(Object.keys(QUEST_STATUS_LABELS) as QuestStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {QUEST_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
                <CatalogIdSelect
                  value={q.systemId ?? ""}
                  onChange={(id) => upsertQuest({ ...q, systemId: id || null })}
                  options={sysOpts}
                  emptyLabel="— без якоря —"
                />
                {q.systemId ? (
                  <button
                    type="button"
                    className="btn tiny ghost"
                    onClick={() =>
                      jumpToGmMap({
                        factionId: faction.id,
                        systemId: q.systemId,
                        dive: "galaxy",
                      })
                    }
                  >
                    На карте
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn tiny danger ghost"
                  onClick={() => {
                    if (confirm(`Удалить квест «${q.name}»?`)) removeQuest(q.id);
                  }}
                >
                  Удалить
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
