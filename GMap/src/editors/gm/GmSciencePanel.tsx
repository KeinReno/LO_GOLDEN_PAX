import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorldStore } from "../../state/worldStore";
import { useCampaignSessionCtx } from "../CampaignSessionContext";
import { getCachedContent } from "../../state/contentCatalog";
import { GM_LIVE_DOMAINS } from "./gmDomains";
import type { GmLiveDomainId } from "../../state/types";
import { GmPlayerVision } from "./GmPlayerVision";

type EcoSlice = {
  unlockedTechs?: string[];
  researchQueue?: string[];
  alchemy?: { discoveredRecipes?: string[] };
};

type EntityType = "faction" | "race" | "tech" | "building" | "unit";

const ENTITY_TYPES: { id: EntityType; label: string }[] = [
  { id: "faction", label: "Держава" },
  { id: "race", label: "Раса" },
  { id: "tech", label: "Технология" },
  { id: "building", label: "Здание" },
  { id: "unit", label: "Юнит" },
];

/** GM Science domain — grant research / view queue & alchemy for active faction. */
export function GmSciencePanel() {
  const world = useWorldStore((s) => s.world);
  const activeFactionId = useWorldStore((s) => s.activeFactionId);
  const { masterToken, setSyncMsg } = useCampaignSessionCtx();
  const content = getCachedContent();
  const facId = activeFactionId ?? world.factions[0]?.id;
  const faction = world.factions.find((f) => f.id === facId);

  const [eco, setEco] = useState<EcoSlice | null>(null);
  const [techId, setTechId] = useState("");
  const [recipeId, setRecipeId] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!facId) return;
    try {
      const res = await fetch("/api/ledger", {
        headers: { "X-Master-Token": masterToken },
      });
      if (!res.ok) return;
      const led = await res.json();
      const row = led?.factions?.[facId];
      setEco(row ?? null);
    } catch {
      /* quiet */
    }
  }, [facId, masterToken]);

  useEffect(() => {
    void refresh();
  }, [refresh, world.meta.turn, world.meta.tableRevision]);

  const techs = useMemo(() => {
    const bag = content?.technologies ?? {};
    return Object.values(bag).filter((t) => t?.id);
  }, [content]);

  const unlocked = new Set(eco?.unlockedTechs ?? []);
  const queue = eco?.researchQueue ?? [];
  const recipes = eco?.alchemy?.discoveredRecipes ?? [];
  const knownRecipes = new Set(recipes);

  const catalogRecipes = useMemo(() => {
    const bag = content?.tech_recipes ?? {};
    return Object.values(bag).filter((r) => r?.id);
  }, [content]);

  const grant = async () => {
    if (!facId || !techId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/economy/research", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Token": masterToken,
        },
        body: JSON.stringify({ factionId: facId, techId, free: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.reason || res.statusText);
      setSyncMsg(`Исследовано: ${data.tech?.name ?? techId}`);
      void refresh();
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const grantRecipe = async () => {
    if (!facId || !recipeId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/economy/alchemy/grant-recipe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Token": masterToken,
        },
        body: JSON.stringify({ factionId: facId, recipeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setSyncMsg(
        data.added
          ? `Рецепт: ${data.recipe?.name ?? recipeId}`
          : `Уже был: ${data.recipe?.name ?? recipeId}`,
      );
      void refresh();
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gm-domain-body">
      <p className="hint">
        Держава: <strong>{faction?.name ?? "—"}</strong>. Выдача через research
        API (мастер). Каталог/баланс — Atelier позже.
      </p>
      <button type="button" className="btn ghost" onClick={() => void refresh()}>
        Обновить пул
      </button>
      <div className="gm-domain-block">
        <h4>Открыто · {unlocked.size}</h4>
        <p className="hint gm-domain-chips">
          {[...unlocked].slice(0, 12).map((id) => (
            <span key={id} className="gm-pill">
              {id.replace(/^tech\./, "")}
            </span>
          ))}
          {unlocked.size === 0 && "нет"}
          {unlocked.size > 12 && ` +${unlocked.size - 12}`}
        </p>
      </div>
      <div className="gm-domain-block">
        <h4>Очередь · {queue.length}</h4>
        <p className="hint">
          {queue.length
            ? queue.map((id) => id.replace(/^tech\./, "")).join(" → ")
            : "пуста"}
        </p>
      </div>
      <div className="gm-domain-block">
        <h4>Алхимия · рецепты {recipes.length}</h4>
        <p className="hint gm-domain-chips">
          {recipes.length
            ? recipes.slice(0, 8).map((id) => (
                <span key={id} className="gm-pill">
                  {id.replace(/^recipe\./, "")}
                </span>
              ))
            : "ещё не открыто"}
          {recipes.length > 8 && ` +${recipes.length - 8}`}
        </p>
        <div className="gmsys-row" style={{ marginTop: 6 }}>
          <select
            className="gmsys-select"
            value={recipeId}
            onChange={(e) => setRecipeId(e.target.value)}
          >
            <option value="">— выдать рецепт —</option>
            {catalogRecipes
              .filter((r) => r.id && !knownRecipes.has(r.id))
              .slice(0, 300)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name ?? r.id}
                </option>
              ))}
          </select>
          <button
            type="button"
            className="btn primary"
            disabled={busy || !recipeId}
            onClick={() => void grantRecipe()}
          >
            Рецепт
          </button>
        </div>
      </div>
      <div className="gm-domain-block">
        <h4>Выдать технологию</h4>
        <div className="gmsys-row">
          <select
            className="gmsys-select"
            value={techId}
            onChange={(e) => setTechId(e.target.value)}
          >
            <option value="">— выбрать —</option>
            {techs
              .filter((t) => t.id && !unlocked.has(t.id))
              .slice(0, 400)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name ?? t.id}
                </option>
              ))}
          </select>
          <button
            type="button"
            className="btn primary"
            disabled={busy || !techId}
            onClick={() => void grant()}
          >
            Выдать
          </button>
        </div>
      </div>
    </div>
  );
}

/** GM Intel Fog — set knowledge level + player vision lens. */
export function GmIntelPanel() {
  const world = useWorldStore((s) => s.world);
  const activeFactionId = useWorldStore((s) => s.activeFactionId);
  const { masterToken, setSyncMsg } = useCampaignSessionCtx();
  const content = getCachedContent();
  const facId = activeFactionId ?? world.factions[0]?.id;
  const faction = world.factions.find((f) => f.id === facId);

  const [entityType, setEntityType] = useState<EntityType>("faction");
  const [entityId, setEntityId] = useState("");
  const [level, setLevel] = useState(2);
  const [busy, setBusy] = useState(false);

  const options = useMemo(() => {
    if (entityType === "faction") {
      return world.factions
        .filter((f) => f.id !== facId)
        .map((f) => ({ id: f.id, name: f.name }));
    }
    if (entityType === "race") {
      const races = content?.races ?? {};
      return Object.values(races)
        .map((r) => ({ id: r.id ?? "", name: r.name ?? r.id ?? "" }))
        .filter((r) => r.id);
    }
    if (entityType === "tech") {
      const techs = content?.technologies ?? {};
      return Object.values(techs)
        .map((t) => ({ id: t.id ?? "", name: t.name ?? t.id ?? "" }))
        .filter((t) => t.id)
        .slice(0, 200);
    }
    if (entityType === "building") {
      const buildings = content?.buildings ?? {};
      return Object.values(buildings)
        .map((b) => ({ id: b.id, name: b.name ?? b.id }))
        .slice(0, 200);
    }
    return [];
  }, [entityType, world.factions, facId, content]);

  const apply = async () => {
    if (!facId || !entityId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/intel/set", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Token": masterToken,
        },
        body: JSON.stringify({
          factionId: facId,
          entityType,
          entityId,
          level,
          source: "gm",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setSyncMsg(
        data.changed
          ? `Intel ${entityType}/${entityId} → ${level}`
          : `Без изменений (уже ≥ ${level})`,
      );
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gm-domain-body">
      <GmPlayerVision />

      <div className="gm-domain-block">
        <h4>Intel · уровень знания</h4>
        <p className="hint">
          Для державы <strong>{faction?.name ?? "—"}</strong>. Уровень только
          растёт (0…4).
        </p>
      <div className="gmsys-row">
        <select
          className="gmsys-select"
          value={entityType}
          onChange={(e) => {
            setEntityType(e.target.value as EntityType);
            setEntityId("");
          }}
        >
          {ENTITY_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          className="gmsys-select"
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
        >
          <option value="">— сущность —</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
      <div className="gmsys-row">
        <label className="field" style={{ flex: 1 }}>
          <span>Уровень {level}</span>
          <input
            type="range"
            min={0}
            max={4}
            value={level}
            onChange={(e) => setLevel(Number(e.target.value))}
          />
        </label>
        <button
          type="button"
          className="btn primary"
          disabled={busy || !entityId}
          onClick={() => void apply()}
        >
          Применить
        </button>
      </div>
      </div>
    </div>
  );
}

export function GmDomainLauncher({
  onOpen,
  activeId,
}: {
  onOpen: (id: GmLiveDomainId) => void;
  activeId: GmLiveDomainId | null;
}) {
  return (
    <div className="gm-domain-launcher">
      <p className="hint">
        На карте: глаголы снизу → цель. Здесь — быстрый F-ключ / клик.
      </p>
      <div className="gm-domain-launcher-grid">
        {GM_LIVE_DOMAINS.map((d) => (
          <button
            key={d.id}
            type="button"
            className={`btn ghost gm-domain-launch ${activeId === d.id ? "active" : ""}`}
            title={d.hint}
            onClick={() => onOpen(d.id)}
          >
            <kbd>F{d.hotkey}</kbd>
            <span>{d.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
