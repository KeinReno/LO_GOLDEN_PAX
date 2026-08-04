import type { BuildingDef } from "./PlayerPlanetManage";
import { BuildingKindIcon, buildingKindColor } from "./BuildingKindIcon";
import { ResourceCostRow } from "../ui/ResourceCostRow";
import { HoldRevealButton } from "../ui/HoldRevealButton";
import {
  canBuildWithTech,
  techHintForBuilding,
  type TechEcoSlice,
} from "../state/techGate";
import { getCachedContent } from "../state/contentCatalog";
import { BUILD_DND_MIME } from "./system/types";

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
};

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
}: BuildDeckProps) {
  const techs = getCachedContent()?.technologies || {};

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
      <p className="build-deck__hint hint">
        {slotArmed
          ? "Зажми карту, чтобы построить в выбранный слот · или перетащи"
          : "Выбери слот на кольце, затем зажми карту · можно перетащить на слот / в очередь"}
      </p>
      <div className="build-deck__stack">
        {defs.length === 0 ? (
          <p className="hint">Нет доступных построек в этой зоне.</p>
        ) : (
          defs.map((def, i) => {
            const needAp = def.ap ?? 1;
            const affordAp = apLeft >= needAp;
            const techGate = canBuildWithTech(techEco, def);
            const hint = !techGate.ok
              ? techHintForBuilding(techEco, def, techs)
              : null;
            const metalNeed = def.cost?.["currency.metal"] ?? 0;
            const supplyNeed = def.cost?.["currency.supply"] ?? 0;
            const affordRes =
              (stocks["currency.metal"] ?? 0) >= metalNeed &&
              (stocks["currency.supply"] ?? 0) >= supplyNeed;
            const enabled = !busy && techGate.ok && affordAp && affordRes;
            const selected = selectedId === def.id;
            const dragging = dragId === def.id;
            const color = buildingKindColor(def.kind);
            const cat = def.category ? String(def.category) : null;
            const hot =
              (highlightCategory && cat === highlightCategory) ||
              !!highlightBuildingIds?.includes(def.id);
            return (
              <div
                key={def.id}
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
                  style={{
                    ["--deck-accent" as string]: color,
                    transform: `translateY(${Math.min(i, 6) * -2}px)`,
                    zIndex: defs.length - i,
                  }}
                  disabled={!enabled}
                  holdMs={720}
                  moveCancelPx={8}
                  title={
                    !techGate.ok
                      ? hint?.reason || techGate.error
                      : !enabled
                        ? "Не хватает ресурсов / AP"
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
                        {needAp} AP
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
          })
        )}
      </div>
    </aside>
  );
}
