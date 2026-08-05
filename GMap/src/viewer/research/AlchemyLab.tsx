import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type DragEvent,
  type MouseEvent,
} from "react";
import { getCachedContent, type TechnologyDef } from "../../state/contentCatalog";
import { useSpotlight, useTilt } from "../../ui/aceternityFx";
import { BackgroundBeamsLite } from "../../ui/BackgroundBeamsLite";
import { StatefulButton } from "../../ui/StatefulButton";
import { TECH_DND_MIME } from "./constants";

type AlchemyPreview = {
  ok: boolean;
  error?: string;
  mode?: string;
  cost?: number;
  attemptsLeft?: number;
  attemptsPerTurn?: number;
  recipe?: {
    id: string;
    name: string;
    discovered: boolean;
    era?: number;
  } | null;
  results?: Array<{
    id: string;
    name: string;
    category: string;
    era: number;
    alreadyUnlocked: boolean;
  }>;
  blindHit?: number;
};

const CAT_COLOR: Record<string, string> = {
  A: "var(--eco-cat-a)",
  B: "var(--eco-cat-b)",
  C: "var(--eco-cat-c)",
  D: "var(--eco-cat-d)",
  E: "var(--eco-cat-e)",
  F: "var(--eco-cat-f)",
};

function techLabel(id: string, byId: Map<string, TechnologyDef>) {
  return byId.get(id)?.name || id;
}

function categoriesAdjacent(a: string, b: string) {
  if (a === b) return true;
  const ring = "ABCDEF";
  const i = ring.indexOf(a);
  const j = ring.indexOf(b);
  if (i < 0 || j < 0) return false;
  return Math.abs(i - j) === 1 || (i === 0 && j === 5) || (i === 5 && j === 0);
}

function StatPill({
  label,
  value,
  spotColor,
}: {
  label: string;
  value: string | number;
  spotColor: string;
}) {
  const spot = useSpotlight();
  return (
    <li
      className="alchemy-stat fx-spotlight"
      style={{ "--fx-spot-color": spotColor } as CSSProperties}
      {...spot.bind}
    >
      <span>{label}</span>
      <strong className="tabular">{value}</strong>
    </li>
  );
}

function SlotCard({
  which,
  techId,
  byId,
  onClear,
  onDrop,
}: {
  which: "A" | "B";
  techId: string | null;
  byId: Map<string, TechnologyDef>;
  onClear: () => void;
  onDrop: (e: DragEvent) => void;
}) {
  const spot = useSpotlight();
  const tilt = useTilt(7);
  const tech = techId ? byId.get(techId) : null;
  const filled = Boolean(tech);
  const color = tech ? CAT_COLOR[tech.category] : "var(--accent-holo, var(--accent))";

  const onMouseMove = (e: MouseEvent<HTMLElement>) => {
    spot.bind.onMouseMove(e);
    tilt.bind.onMouseMove(e);
  };
  const onMouseLeave = (e: MouseEvent<HTMLElement>) => {
    spot.bind.onMouseLeave(e);
    tilt.bind.onMouseLeave(e);
  };

  return (
    <div
      className={[
        "alchemy-slot",
        "fx-spotlight",
        "fx-tilt",
        filled ? "is-filled" : "is-empty",
      ].join(" ")}
      style={
        {
          "--fx-spot-color": color,
          "--slot-accent": color,
        } as CSSProperties
      }
      onDragOver={(e) => {
        e.preventDefault();
        e.currentTarget.classList.add("is-dragover");
      }}
      onDragLeave={(e) => e.currentTarget.classList.remove("is-dragover")}
      onDrop={(e) => {
        e.currentTarget.classList.remove("is-dragover");
        onDrop(e);
      }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      <div className="fx-tilt-inner alchemy-slot-inner">
        <span className="alchemy-slot-label">{which}</span>
        {filled && tech ? (
          <>
            <span className="alchemy-slot-cat" aria-hidden>
              {tech.category}
            </span>
            <strong className="alchemy-slot-name">{tech.name}</strong>
            <span className="alchemy-slot-meta tabular">Era {tech.era}</span>
            <button type="button" className="alchemy-slot-clear" onClick={onClear}>
              очистить
            </button>
          </>
        ) : (
          <>
            <strong className="alchemy-slot-placeholder">Перетащите tech</strong>
            <span className="hint">или выберите ниже</span>
          </>
        )}
      </div>
    </div>
  );
}

export function AlchemyLab({
  unlockedIds,
  cognitio,
  alchemy,
  busy,
  onExperiment,
  msg,
  initialSlots,
  seedKey,
  compact = false,
}: {
  unlockedIds: string[];
  cognitio: number;
  alchemy?: {
    attemptsUsedThisTurn?: number;
    discoveredRecipes?: string[];
  } | null;
  busy?: boolean;
  onExperiment: (techA: string, techB: string) => void;
  msg?: string | null;
  initialSlots?: { a?: string | null; b?: string | null } | null;
  seedKey?: number | string | null;
  compact?: boolean;
}) {
  const [slotA, setSlotA] = useState<string | null>(initialSlots?.a ?? null);
  const [slotB, setSlotB] = useState<string | null>(initialSlots?.b ?? null);
  const [filter, setFilter] = useState("");
  const [focusChip, setFocusChip] = useState<string | null>(null);
  const previewSpot = useSpotlight();

  useEffect(() => {
    if (!initialSlots) return;
    if (initialSlots.a) setSlotA(initialSlots.a);
    if (initialSlots.b !== undefined) setSlotB(initialSlots.b ?? null);
  }, [seedKey, initialSlots?.a, initialSlots?.b]);

  const { byId, unlockedTechs, recipes, rules } = useMemo(() => {
    const c = getCachedContent();
    const techs = { ...(c?.technologies || {}), ...(c?.tech_combos || {}) };
    const idMap = new Map(
      Object.values(techs).map((t) => [t.id, t as TechnologyDef]),
    );
    const unlocked = unlockedIds
      .map((id) => idMap.get(id))
      .filter(Boolean) as TechnologyDef[];
    unlocked.sort(
      (a, b) =>
        a.category.localeCompare(b.category) ||
        a.era - b.era ||
        a.name.localeCompare(b.name, "ru"),
    );
    return {
      byId: idMap,
      unlockedTechs: unlocked,
      recipes: c?.tech_recipes || {},
      rules: c?.rules?.alchemy,
    };
  }, [unlockedIds]);

  const attemptsUsed = alchemy?.attemptsUsedThisTurn ?? 0;
  const attemptsPerTurn = Number(rules?.attemptsPerTurn ?? 3);
  const attemptsLeft = Math.max(0, attemptsPerTurn - attemptsUsed);
  const discovered = useMemo(
    () => new Set(alchemy?.discoveredRecipes || []),
    [alchemy?.discoveredRecipes],
  );

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return unlockedTechs;
    return unlockedTechs.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        t.category.toLowerCase() === q,
    );
  }, [unlockedTechs, filter]);

  const view = useMemo((): AlchemyPreview | null => {
    if (!slotA || !slotB || slotA === slotB) return null;
    const a = byId.get(slotA);
    const b = byId.get(slotB);
    if (!a || !b) return null;
    if (!categoriesAdjacent(a.category, b.category)) {
      return {
        ok: false,
        error: `Категории ${a.category}+${b.category} не смежные`,
      };
    }
    const pair = [slotA, slotB].slice().sort();
    let recipe: {
      id: string;
      name: string;
      era?: number;
      results?: string[];
    } | null = null;
    for (const r of Object.values(recipes)) {
      const ings = [...(r.ingredients || [])].sort();
      if (ings[0] === pair[0] && ings[1] === pair[1]) {
        recipe = r;
        break;
      }
    }
    const base = Number(rules?.baseCost ?? 8);
    const gapCost = Number(rules?.eraGapCost ?? 4);
    const cost = base + Math.abs((a.era || 1) - (b.era || 1)) * gapCost;
    const known = recipe ? discovered.has(recipe.id) : false;
    const resultId = recipe?.results?.[0];
    const result = resultId ? byId.get(resultId) : null;
    const error =
      attemptsLeft <= 0
        ? "Нет попыток в этом ходу"
        : cognitio < cost
          ? "Мало cognitio"
          : undefined;
    return {
      ok: !error,
      error,
      mode: known ? "known" : "blind",
      cost,
      attemptsLeft,
      attemptsPerTurn,
      recipe: recipe
        ? {
            id: recipe.id,
            name: recipe.name,
            discovered: known,
            era: recipe.era,
          }
        : null,
      results: result
        ? [
            {
              id: result.id,
              name: result.name,
              category: result.category,
              era: result.era,
              alreadyUnlocked: unlockedIds.includes(result.id),
            },
          ]
        : [],
      blindHit: Number(rules?.blindHit ?? 0.25),
    };
  }, [
    slotA,
    slotB,
    byId,
    recipes,
    rules,
    discovered,
    attemptsLeft,
    attemptsPerTurn,
    cognitio,
    unlockedIds,
  ]);

  const fillSlot = (id: string) => {
    if (!slotA || (slotA && slotB)) {
      setSlotA(id);
      setSlotB(null);
      return;
    }
    if (slotA === id) return;
    setSlotB(id);
  };

  const onDropSlot = (e: DragEvent, which: "A" | "B") => {
    e.preventDefault();
    const id =
      e.dataTransfer.getData(TECH_DND_MIME) ||
      e.dataTransfer.getData("text/plain");
    if (!id || !unlockedIds.includes(id)) return;
    if (which === "A") setSlotA(id);
    else setSlotB(id);
  };

  const canRun = Boolean(slotA && slotB && slotA !== slotB && view?.ok && !busy);
  const bothFilled = Boolean(slotA && slotB && slotA !== slotB);
  const successMsg = Boolean(
    msg &&
      (msg.includes("Открыто") ||
        msg.includes("success") ||
        msg.startsWith("Алхимия")),
  );

  return (
    <div className={`alchemy-lab${compact ? " alchemy-lab--compact" : ""}`}>
      {!compact ? (
        <div className="alchemy-lab__bg" aria-hidden>
          <span className="alchemy-lab__dotgrid" />
          <span className="alchemy-lab__aurora" />
          <BackgroundBeamsLite className="alchemy-lab__beams" />
        </div>
      ) : null}

      <header className="alchemy-lab-head">
        <div>
          <h3 className="alchemy-lab-title">Лаборатория</h3>
          <p className="hint">Синтез из двух изученных технологий · A–B … F–A</p>
        </div>
        <ul className="alchemy-stat-pills" aria-label="Статус лаборатории">
          <StatPill
            label="Попытки"
            value={`${attemptsLeft}/${attemptsPerTurn}`}
            spotColor="var(--accent)"
          />
          <StatPill label="Cognitio" value={cognitio} spotColor="var(--eco-cat-f)" />
          <StatPill
            label="Рецепты"
            value={discovered.size}
            spotColor="var(--accent-holo, var(--accent))"
          />
        </ul>
      </header>

      <div className={`alchemy-lab-bench ${bothFilled ? "is-armed" : ""}`}>
        <SlotCard
          which="A"
          techId={slotA}
          byId={byId}
          onClear={() => setSlotA(null)}
          onDrop={(e) => onDropSlot(e, "A")}
        />
        <div className={`alchemy-lab-plus ${bothFilled ? "is-hot" : ""}`} aria-hidden>
          <span className="alchemy-lab-plus-ring" />
          <span>×</span>
        </div>
        <SlotCard
          which="B"
          techId={slotB}
          byId={byId}
          onClear={() => setSlotB(null)}
          onDrop={(e) => onDropSlot(e, "B")}
        />
      </div>

      {view ? (
        <div
          className={[
            "alchemy-preview",
            "fx-spotlight",
            view.ok ? "is-ok" : "is-blocked",
            view.mode === "blind" ? "is-blind" : "",
          ].join(" ")}
          style={
            {
              "--fx-spot-color": view.ok
                ? "var(--signal-build, var(--ok))"
                : "var(--signal-warning, var(--warn))",
            } as CSSProperties
          }
          {...previewSpot.bind}
        >
          {view.error ? (
            <p className="hint">{view.error}</p>
          ) : (
            <div className="alchemy-preview-grid">
              <div>
                <span className="alchemy-kicker">
                  {view.mode === "known" ? "Известный рецепт" : "Слепой эксперимент"}
                </span>
                <p className="alchemy-preview-cost">
                  <strong className="tabular">{view.cost}</strong>
                  <span> cognitio</span>
                  {view.mode === "blind" && view.blindHit != null ? (
                    <span className="hint">
                      {" "}
                      · шанс ≈ {Math.round(view.blindHit * 100)}%
                    </span>
                  ) : null}
                </p>
              </div>
              <div>
                {view.recipe ? (
                  <p>
                    <span className="alchemy-kicker">Рецепт</span>
                    <strong>
                      {view.recipe.name}
                      {view.recipe.discovered ? "" : " · скрыт"}
                    </strong>
                  </p>
                ) : (
                  <p className="hint alchemy-preview-cipher">
                    Нет записи в архиве — только flavor / провал
                  </p>
                )}
                {view.results && view.results.length > 0 ? (
                  <p>
                    <span className="alchemy-kicker">Результат</span>
                    <strong
                      className={
                        view.mode === "blind" && !view.recipe?.discovered
                          ? "alchemy-cipher"
                          : undefined
                      }
                    >
                      {view.results.map((r) => r.name).join(", ")}
                    </strong>
                    {view.results.some((r) => r.alreadyUnlocked) ? (
                      <span className="hint"> · уже есть → refund</span>
                    ) : null}
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="alchemy-empty hint">
          Выберите две изученные технологии смежных категорий.
        </p>
      )}

      <div className="alchemy-lab-actions">
        <div className={canRun ? "fx-moving-border alchemy-cta-wrap" : "alchemy-cta-wrap"}>
          <StatefulButton
            className="btn primary alchemy-cta"
            disabled={!canRun}
            busy={busy}
            success={successMsg && !busy}
            successLabel="Синтез"
            onClick={() => {
              if (!slotA || !slotB) return;
              onExperiment(slotA, slotB);
            }}
          >
            Эксперимент
          </StatefulButton>
        </div>
        <button
          type="button"
          className="btn ghost alchemy-reset"
          disabled={!slotA && !slotB}
          onClick={() => {
            setSlotA(null);
            setSlotB(null);
          }}
        >
          Сбросить
        </button>
      </div>

      {msg ? (
        <p
          className={`alchemy-lab-msg ${successMsg ? "is-ok" : "is-info"}`}
          role="status"
        >
          {msg}
        </p>
      ) : null}

      <label className="alchemy-lab-filter">
        <span className="sr-only">Фильтр технологий</span>
        <input
          type="search"
          placeholder="Фильтр изученных…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </label>

      <ul
        className={`alchemy-tech-list ${focusChip ? "has-focus" : ""}`}
        aria-label="Изученные технологии"
        onMouseLeave={() => setFocusChip(null)}
      >
        {filtered.length === 0 ? (
          <li className="hint">Нет изученных технологий под фильтр.</li>
        ) : (
          filtered.map((t) => (
            <Chip
              key={t.id}
              tech={t}
              selected={slotA === t.id || slotB === t.id}
              dim={Boolean(focusChip && focusChip !== t.id)}
              onFocus={() => setFocusChip(t.id)}
              onPick={() => fillSlot(t.id)}
            />
          ))
        )}
      </ul>

      {discovered.size > 0 ? (
        <div className="alchemy-recipes diplo-timeline--beam">
          <h4>Открытые рецепты</h4>
          <ul>
            {[...discovered].map((id) => {
              const r = recipes[id];
              return (
                <li key={id} className="diplo-timeline__item">
                  <strong>{r?.name || id}</strong>
                  {r?.results?.[0] ? (
                    <span className="hint"> → {techLabel(r.results[0], byId)}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Chip({
  tech,
  selected,
  dim,
  onFocus,
  onPick,
}: {
  tech: TechnologyDef;
  selected: boolean;
  dim: boolean;
  onFocus: () => void;
  onPick: () => void;
}) {
  const spot = useSpotlight();
  return (
    <li>
      <button
        type="button"
        className={[
          "alchemy-tech-chip",
          "fx-spotlight",
          dim ? "is-dim" : "",
          selected ? "is-selected" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={
          {
            "--fx-spot-color": CAT_COLOR[tech.category],
            "--chip-accent": CAT_COLOR[tech.category],
          } as CSSProperties
        }
        draggable
        onMouseEnter={onFocus}
        onDragStart={(e) => {
          e.dataTransfer.setData(TECH_DND_MIME, tech.id);
          e.dataTransfer.setData("text/plain", tech.id);
          e.dataTransfer.effectAllowed = "copy";
        }}
        onClick={onPick}
        {...spot.bind}
      >
        <span className="alchemy-tech-cat">{tech.category}</span>
        <span>{tech.name}</span>
        <span className="tabular">E{tech.era}</span>
      </button>
    </li>
  );
}
