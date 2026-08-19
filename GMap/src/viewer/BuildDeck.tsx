import { useEffect, useMemo, useState } from "react";
import type { BuildingDef } from "./PlayerPlanetManage";
import { BuildingKindIcon, buildingKindColor } from "./BuildingKindIcon";
import { ResourceCostRow } from "../ui/ResourceCostRow";
import { HoldRevealButton } from "../ui/HoldRevealButton";
import {
  canBuildWithTech,
  techHintForBuilding,
  type TechEcoSlice,
} from "../state/techGate";
import { getCachedContent, intentApCost } from "../state/contentCatalog";
import { BUILD_DND_MIME } from "./system/types";
import {
  BUILDING_CATALOG_GROUPS,
  buildingCatalogGroupId,
  type BuildingCatalogGroupId,
} from "../state/buildingCatalogGroups";

const ZONE_LABEL: Record<string, string> = {
  surface: "Поверхность",
  subsurface: "Недра",
  deep: "Глубина",
  orbital: "Орбита",
};

export type BuildDeckProps = {
  defs: BuildingDef[];
  stocks: Record<string, number>;
  apLeft: number;
  techEco?: TechEcoSlice;
  busy?: boolean;
  selectedId: string | null;
  dragId: string | null;
  zoneLabel?: string;
  /** True when an empty ring slot is armed — hold commits build. */
  slotArmed?: boolean;
  highlightCategory?: string | null;
  highlightBuildingIds?: string[];
  onSelect: (id: string) => void;
  /** Hold completed on a card while a slot is armed. */
  onHoldBuild: (id: string) => void;
  /** Fired after pointer moves past drag threshold. */
  onDragStart: (id: string, clientX: number, clientY: number) => void;
  onClose: () => void;
  /** When hosted inside FloatingPanel — no own chrome. */
  embedded?: boolean;
  onOpenResearch?: (techId: string) => void;
  /** GM: ignore AP, stocks, and tech gates. */
  freeBuild?: boolean;
};

type DeckCardProps = {
  def: BuildingDef;
  stocks: Record<string, number>;
  apLeft: number;
  techEco?: TechEcoSlice;
  busy?: boolean;
  selected: boolean;
  dragging: boolean;
  hot: boolean;
  slotArmed?: boolean;
  techs: Record<string, { name?: string }>;
  onSelect: (id: string) => void;
  onHoldBuild: (id: string) => void;
  onDragStart: (id: string, clientX: number, clientY: number) => void;
  onOpenResearch?: (techId: string) => void;
  freeBuild?: boolean;
};

function DeckCard({
  def,
  stocks,
  apLeft,
  techEco,
  busy,
  selected,
  dragging,
  hot,
  slotArmed,
  techs,
  onSelect,
  onHoldBuild,
  onDragStart,
  onOpenResearch,
  freeBuild,
}: DeckCardProps) {
  const needAp = intentApCost("intent.build");
  const affordAp = needAp <= 0 || apLeft >= needAp;
  const techGate = canBuildWithTech(techEco, def);
  const hint = !techGate.ok
    ? techHintForBuilding(techEco, def, techs)
    : null;
  const metalNeed = def.cost?.["currency.metal"] ?? 0;
  const supplyNeed = def.cost?.["currency.supply"] ?? 0;
  const affordRes =
    (stocks["currency.metal"] ?? 0) >= metalNeed &&
    (stocks["currency.supply"] ?? 0) >= supplyNeed;
  const enabled = freeBuild || (!busy && techGate.ok && affordAp && affordRes);
  const color = buildingKindColor(def.kind);
  const cat = def.category ? String(def.category) : null;
  return (
    <div
      className={`build-deck-card-wrap${hot ? " is-hot" : ""}`}
      draggable={enabled}
      onDragStart={(e) => {
        e.dataTransfer.setData(BUILD_DND_MIME, def.id);
        e.dataTransfer.setData("text/plain", def.id);
        e.dataTransfer.effectAllowed = "copyMove";
        onSelect(def.id);
      }}
    >
      <HoldRevealButton
        className={[
          "build-deck-card",
          selected ? "is-selected" : "",
          dragging ? "is-dragging" : "",
          !enabled ? "is-disabled" : "",
          hot ? "is-hot" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ ["--deck-accent" as string]: color }}
        disabled={!enabled}
        holdMs={720}
        moveCancelPx={8}
        title={
          !techGate.ok
            ? hint?.reason || techGate.error
            : !enabled
              ? "Не хватает ресурсов или ОД"
              : slotArmed
                ? `${def.name} — зажми, чтобы построить`
                : `${def.name} — выбери слот, затем зажми`
        }
        onPressStart={() => onSelect(def.id)}
        onMoveCancel={(x, y) => onDragStart(def.id, x, y)}
        onHoldComplete={() => {
          if (!slotArmed) {
            onSelect(def.id);
            return;
          }
          onHoldBuild(def.id);
        }}
      >
        <span className="build-deck-card__icon">
          <BuildingKindIcon kind={def.kind} size={18} />
        </span>
        <span className="build-deck-card__body">
          <span className="build-deck-card__name">{def.name}</span>
          <span className="build-deck-card__meta">
            {ZONE_LABEL[def.zone] ?? def.zone}
            {def.tier != null ? ` · T${def.tier}` : ""}
            {cat ? ` · ${cat}` : ""}
            {" · "}
            <span
              className={
                affordAp
                  ? "build-deck-card__ap"
                  : "build-deck-card__ap insufficient"
              }
            >
              {needAp > 0 ? `${needAp} ОД` : "без ОД"}
            </span>
          </span>
          <ResourceCostRow
            cost={def.cost ?? {}}
            stocks={stocks}
            size={12}
          />
        </span>
      </HoldRevealButton>
      {!techGate.ok && hint?.techId && onOpenResearch ? (
        <button
          type="button"
          className="build-deck-tech-link"
          onClick={() => onOpenResearch(hint.techId)}
        >
          {hint.reason} → Наука
        </button>
      ) : !techGate.ok ? (
        <p className="hint build-deck-tech-link">
          {hint?.reason || techGate.error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Build deck: drag onto a ring slot to aim, hold card to commit build.
 */
export function BuildDeck({
  defs,
  stocks,
  apLeft,
  techEco,
  busy,
  selectedId,
  dragId,
  zoneLabel,
  slotArmed,
  highlightCategory,
  highlightBuildingIds,
  onSelect,
  onHoldBuild,
  onDragStart,
  onClose,
  embedded,
  onOpenResearch,
  freeBuild,
}: BuildDeckProps) {
  const techs = getCachedContent()?.technologies || {};
  const [groupId, setGroupId] = useState<BuildingCatalogGroupId | "all">(
    "all",
  );

  const groups = useMemo(() => {
    const counts = new Map<BuildingCatalogGroupId, BuildingDef[]>();
    for (const def of defs) {
      const id = buildingCatalogGroupId(def.kind);
      const list = counts.get(id);
      if (list) list.push(def);
      else counts.set(id, [def]);
    }
    return BUILDING_CATALOG_GROUPS.filter((g) => counts.has(g.id)).map(
      (g) => ({ ...g, defs: counts.get(g.id)! }),
    );
  }, [defs]);

  const visible = useMemo(() => {
    if (groupId === "all") return groups;
    return groups.filter((g) => g.id === groupId);
  }, [groups, groupId]);

  useEffect(() => {
    if (groupId === "all") return;
    if (!groups.some((g) => g.id === groupId)) setGroupId("all");
  }, [groups, groupId]);

  return (
    <aside
      className={`build-deck${embedded ? " build-deck--embedded" : ""}`}
      aria-label="Колода строительства"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {!embedded && (
        <header className="build-deck__head">
          <div>
            <strong>Колода</strong>
            <span className="hint">
              {zoneLabel ? `${zoneLabel} · ` : ""}
              {defs.length} доступно
            </span>
          </div>
          <button
            type="button"
            className="btn ghost build-deck__close"
            onClick={onClose}
          >
            ✕
          </button>
        </header>
      )}
      {embedded && (
        <p className="hint build-deck__meta">
          {zoneLabel ? `${zoneLabel} · ` : ""}
          {defs.length} доступно
        </p>
      )}
      {groups.length > 1 ? (
        <div className="build-deck__cats" role="tablist" aria-label="Категории построек">
          <button
            type="button"
            role="tab"
            aria-selected={groupId === "all"}
            className={`build-deck__cat${groupId === "all" ? " is-on" : ""}`}
            onClick={() => setGroupId("all")}
          >
            Все
          </button>
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={groupId === g.id}
              className={`build-deck__cat${groupId === g.id ? " is-on" : ""}`}
              onClick={() => setGroupId(g.id)}
            >
              {g.label}
              <span className="build-deck__cat-n">{g.defs.length}</span>
            </button>
          ))}
        </div>
      ) : null}
      <p className="build-deck__hint hint">
        {slotArmed
          ? "Зажми карту, чтобы построить в выбранный слот · или перетащи"
          : "Выбери слот на кольце, затем зажми карту · можно перетащить на слот / в очередь"}
      </p>
      <div className="build-deck__stack">
        {defs.length === 0 ? (
          <p className="hint">Нет доступных построек в этой зоне.</p>
        ) : (
          visible.map((g) => (
            <section key={g.id} className="build-deck__group" aria-label={g.label}>
              <div className="build-deck__group-label">{g.label}</div>
              {g.defs.map((def) => {
                const cat = def.category ? String(def.category) : null;
                const hot =
                  (highlightCategory && cat === highlightCategory) ||
                  !!highlightBuildingIds?.includes(def.id);
                return (
                  <DeckCard
                    key={def.id}
                    def={def}
                    stocks={stocks}
                    apLeft={apLeft}
                    techEco={techEco}
                    busy={busy}
                    selected={selectedId === def.id}
                    dragging={dragId === def.id}
                    hot={hot}
                    slotArmed={slotArmed}
                    techs={techs}
                    onSelect={onSelect}
                    onHoldBuild={onHoldBuild}
                    onDragStart={onDragStart}
                    onOpenResearch={onOpenResearch}
                    freeBuild={freeBuild}
                  />
                );
              })}
            </section>
          ))
        )}
      </div>
    </aside>
  );
}
