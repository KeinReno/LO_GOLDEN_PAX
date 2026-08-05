import { useMemo, useState } from "react";
import { useWorldStore } from "../../state/worldStore";
import { useCampaignSessionCtx } from "../CampaignSessionContext";
import {
  GM_SEED_PRESETS,
  applyGmSeedColony,
  type GmSeedPresetId,
  type GmSeedTargetScope,
} from "./gmSeedColony";

export function GmSeedPanel() {
  const world = useWorldStore((s) => s.world);
  const activeFactionId = useWorldStore((s) => s.activeFactionId);
  const selectedSystemId = useWorldStore((s) => s.selectedSystemId);
  const mapFocus = useWorldStore((s) => s.mapFocus);
  const { setSyncMsg } = useCampaignSessionCtx();

  const [systemId, setSystemId] = useState<string>("");
  const [planetId, setPlanetId] = useState<string>("");
  const [scope, setScope] = useState<GmSeedTargetScope>("best");
  const [presetId, setPresetId] = useState<GmSeedPresetId>("colony");
  const [overwrite, setOverwrite] = useState(false);
  const [claimSystem, setClaimSystem] = useState(true);

  const resolvedSystemId =
    systemId ||
    (mapFocus.level !== "galaxy" ? mapFocus.systemId : null) ||
    selectedSystemId ||
    "";

  const system = world.systems.find((s) => s.id === resolvedSystemId) ?? null;
  const faction =
    world.factions.find((f) => f.id === activeFactionId) ?? null;

  const planets = system?.planets ?? [];

  const resolvedPlanetId = useMemo(() => {
    if (scope !== "planet") return null;
    if (planetId) return planetId;
    if (mapFocus.level === "planet" && mapFocus.systemId === resolvedSystemId) {
      return mapFocus.planetId;
    }
    return planets[0]?.id ?? null;
  }, [scope, planetId, mapFocus, resolvedSystemId, planets]);

  const preview = useMemo(() => {
    if (!system || !faction) return null;
    const preset = GM_SEED_PRESETS.find((p) => p.id === presetId);
    if (!preset) return null;
    const surface = preset.buildings.filter((b) => b.zone !== "orbital");
    const orbital = preset.buildings.filter((b) => b.zone === "orbital");
    return { preset, surface, orbital };
  }, [system, faction, presetId]);

  const apply = () => {
    if (!system) {
      setSyncMsg("Выберите систему на карте");
      return;
    }
    if (!faction) {
      setSyncMsg("Выберите державу в фокусе ГМ");
      return;
    }
    if (scope === "planet" && !resolvedPlanetId) {
      setSyncMsg("Выберите планету");
      return;
    }

    const result = applyGmSeedColony({
      world,
      factionId: faction.id,
      systemId: system.id,
      planetId: resolvedPlanetId,
      scope,
      presetId,
      overwrite,
      claimSystem,
    });

    if (result.touchedPlanets.length === 0) {
      setSyncMsg(result.summary);
      return;
    }

    useWorldStore.setState({ world: result.world });
    setSyncMsg(`GM seed · ${result.summary}. Бесплатно · сохраните стол.`);
  };

  return (
    <section className="gm-seed-panel">
      <header className="gm-seed-head">
        <p className="panel-kicker">ГМ · быстрый старт</p>
        <h3>Колония и постройки</h3>
        <p className="hint">
          Бесплатно выдаёт базовое население и здания выбранной державе. Не
          тратит ресурсы и AP игрока.
        </p>
      </header>

      <label className="field">
        <span>Держава</span>
        <select
          value={activeFactionId ?? ""}
          disabled
          title="Меняется в блоке «Фокус» слева"
        >
          {world.factions.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Система</span>
        <select
          value={resolvedSystemId}
          onChange={(e) => {
            setSystemId(e.target.value);
            setPlanetId("");
          }}
        >
          <option value="">— выберите —</option>
          {world.systems.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.ownerFactionId
                ? ` · ${world.factions.find((f) => f.id === s.ownerFactionId)?.name ?? "?"}`
                : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Куда применить</span>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as GmSeedTargetScope)}
        >
          <option value="best">Лучшая планета (пустая → первая обитаемая)</option>
          <option value="planet">Конкретная планета</option>
          <option value="all_habitable">Все обитаемые в системе</option>
        </select>
      </label>

      {scope === "planet" && system && (
        <label className="field">
          <span>Планета</span>
          <select
            value={resolvedPlanetId ?? ""}
            onChange={(e) => setPlanetId(e.target.value)}
          >
            {planets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {(p.population ?? 0) > 0
                  ? ` · ${Math.round((p.population ?? 0) / 1000)}K`
                  : " · пусто"}
              </option>
            ))}
          </select>
        </label>
      )}

      <fieldset className="gm-seed-presets">
        <legend className="hint">Пресет</legend>
        {GM_SEED_PRESETS.map((p) => (
          <label key={p.id} className="gm-seed-preset">
            <input
              type="radio"
              name="gm-seed-preset"
              checked={presetId === p.id}
              onChange={() => setPresetId(p.id)}
            />
            <span>
              <strong>{p.label}</strong>
              <span className="hint">{p.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {preview && (
        <div className="gm-seed-preview order-card">
          <strong>{preview.preset.label}</strong>
          <span className="hint">
            тип {preview.preset.colonyType} · нас. ~
            {Math.round(preview.preset.population / 1000)}K
          </span>
          <ul className="gm-seed-build-list hint">
            {preview.surface.map((b) => (
              <li key={`${b.buildingId}-s`}>
                {b.count}× {b.kind} (поверхность)
              </li>
            ))}
            {preview.orbital.map((b) => (
              <li key={`${b.buildingId}-o`}>
                {b.count}× {b.kind} (орбита)
              </li>
            ))}
          </ul>
        </div>
      )}

      <label className="check">
        <input
          type="checkbox"
          checked={claimSystem}
          onChange={(e) => setClaimSystem(e.target.checked)}
        />
        Закрепить систему за державой, если никому не принадлежит
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={overwrite}
          onChange={(e) => setOverwrite(e.target.checked)}
        />
        Перезаписать постройки и население (иначе — только пустые миры)
      </label>

      <button
        type="button"
        className="btn primary block"
        disabled={!system || !faction}
        onClick={apply}
      >
        Выдать бесплатно
      </button>
    </section>
  );
}
