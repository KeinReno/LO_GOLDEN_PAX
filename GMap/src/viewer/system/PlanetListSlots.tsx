import type { Planet } from "../../state/types";
import type { BuildingDef, PlanetActionRequest } from "../PlayerPlanetManage";
import { BuildingKindIcon, buildingKindColor } from "../BuildingKindIcon";
import { LaborPips, laborPipStyle } from "../LaborPips";
import { buildingStaffedUnits, consumesLabor } from "../../state/planetLabor";
import { HoldRevealButton } from "../../ui/HoldRevealButton";
import { PLANET_BUILDING_KIND_LABELS } from "../../state/defaults";
import { GESTURE } from "../../ui/gestureMap";

type Props = {
  planet: Planet;
  systemId: string;
  planetId: string;
  buildings: Record<string, BuildingDef>;
  busy?: boolean;
  highlightCategory?: string | null;
  highlightBuildingIds?: string[];
  onAction: (req: PlanetActionRequest) => void;
  onInspect: (instanceId: string, kind: string) => void;
  onRequestBuild: (zone: "surface" | "orbital") => void;
  laborPickFrom?: string | null;
  laborDragging?: boolean;
  onLaborPickBuilding?: (instanceId: string, amount: number) => void;
  onLaborDragBuilding?: (
    instanceId: string,
    x: number,
    y: number,
    amount: number,
  ) => void;
  onLaborTapBuilding?: (instanceId: string) => void;
};

function resolveDef(
  buildings: Record<string, BuildingDef>,
  b: { buildingId?: string; kind?: string; zone?: string; name?: string },
): BuildingDef | undefined {
  if (b.buildingId && buildings[b.buildingId]) return buildings[b.buildingId];
  if (b.name) {
    const byName = Object.values(buildings).find((d) => d.name === b.name);
    if (byName) return byName;
  }
  return Object.values(buildings).find(
    (d) =>
      d.kind === b.kind &&
      (d.zone || "surface") === (b.zone || "surface"),
  );
}

function startLaborPointer(
  e: React.PointerEvent,
  instanceId: string,
  busy: boolean | undefined,
  laborPickFrom: string | null | undefined,
  onPick?: (id: string, amount: number) => void,
  onDrag?: (id: string, x: number, y: number, amount: number) => void,
  onTap?: (id: string) => void,
) {
  if (busy || e.button !== 0) return;
  e.stopPropagation();
  const amount = e.shiftKey ? 5 : 1;
  const startX = e.clientX;
  const startY = e.clientY;
  const onMove = (ev: PointerEvent) => {
    if (
      Math.hypot(ev.clientX - startX, ev.clientY - startY) <
      GESTURE.dragThresholdPx
    )
      return;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    onDrag?.(instanceId, ev.clientX, ev.clientY, amount);
  };
  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    if (laborPickFrom && laborPickFrom !== instanceId) {
      onTap?.(instanceId);
      return;
    }
    onPick?.(instanceId, amount);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

function SlotSection({
  title,
  used,
  max,
  items,
  emptyCount,
  zone,
  busy,
  highlightCategory,
  highlightBuildingIds,
  buildings,
  systemId,
  planetId,
  onAction,
  onInspect,
  onRequestBuild,
  planet,
  laborPickFrom,
  laborDragging,
  onLaborPickBuilding,
  onLaborDragBuilding,
  onLaborTapBuilding,
}: {
  title: string;
  used: number;
  max: number;
  items: NonNullable<Planet["surfaceBuildings"]>;
  emptyCount: number;
  zone: "surface" | "orbital";
  busy?: boolean;
  highlightCategory?: string | null;
  highlightBuildingIds?: string[];
  buildings: Record<string, BuildingDef>;
  systemId: string;
  planetId: string;
  onAction: (req: PlanetActionRequest) => void;
  onInspect: (instanceId: string, kind: string) => void;
  onRequestBuild: (zone: "surface" | "orbital") => void;
  planet: Planet;
  laborPickFrom?: string | null;
  laborDragging?: boolean;
  onLaborPickBuilding?: (instanceId: string, amount: number) => void;
  onLaborDragBuilding?: (
    instanceId: string,
    x: number,
    y: number,
    amount: number,
  ) => void;
  onLaborTapBuilding?: (instanceId: string) => void;
}) {
  return (
    <div className="sys-list-slots__section">
      <h4>
        {title}{" "}
        <span className="hint tabular">
          ({used}/{max})
        </span>
      </h4>
      <ul className="sys-list-slots__list">
        {items.map((b) => {
          const def = resolveDef(buildings, b);
          const cat = def?.category ? String(def.category) : null;
          const hot =
            (highlightCategory && cat === highlightCategory) ||
            (def && highlightBuildingIds?.includes(def.id));
          const laborOk = !!def && consumesLabor(def);
          const laborInfo = laborOk
            ? buildingStaffedUnits(planet, b, buildings)
            : null;
          const laborArmed = laborPickFrom === b.id;
          const laborDrop =
            laborOk &&
            !!laborPickFrom &&
            laborPickFrom !== b.id;
          const laborGlow = laborOk && (laborDragging || laborDrop);
          return (
            <li
              key={b.id}
              className={`sys-list-slots__card${hot ? " is-hot" : ""}${laborArmed ? " is-labor-armed" : ""}${laborGlow ? " is-labor-drop" : ""}`}
              data-labor-drop={laborOk ? b.id : undefined}
              style={
                {
                  ["--slot-accent" as string]: buildingKindColor(b.kind),
                } as React.CSSProperties
              }
              onClick={() => {
                if (laborPickFrom && laborOk) onLaborTapBuilding?.(b.id);
              }}
            >
              <div className="sys-list-slots__card-head">
                <BuildingKindIcon kind={b.kind} size={16} />
                <div>
                  <strong>{b.name || def?.name || b.kind}</strong>
                  <div className="hint">
                    {PLANET_BUILDING_KIND_LABELS[b.kind as keyof typeof PLANET_BUILDING_KIND_LABELS] ??
                      b.kind}
                    {def?.tier != null ? ` · T${def.tier}` : ""}
                    {cat ? ` · ${cat}` : ""}
                  </div>
                </div>
                {laborInfo ? (
                  <span
                    className="sys-list-slots__pips"
                    style={laborPipStyle(buildingKindColor(b.kind))}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) =>
                      startLaborPointer(
                        e,
                        b.id,
                        busy,
                        laborPickFrom,
                        onLaborPickBuilding,
                        onLaborDragBuilding,
                        onLaborTapBuilding,
                      )
                    }
                  >
                    <LaborPips
                      staffed={laborInfo.staffed}
                      slots={laborInfo.slots}
                      pinned={laborInfo.pinned}
                    />
                  </span>
                ) : null}
              </div>
              <div
                className="sys-list-slots__card-actions"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="btn ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    onInspect(b.id, b.kind);
                  }}
                >
                  Инфо
                </button>
                <HoldRevealButton
                  className="btn ghost"
                  disabled={busy}
                  holdMs={800}
                  title="Зажми, чтобы снести"
                  onHoldComplete={() =>
                    onAction({
                      action: "demolish",
                      systemId,
                      planetId,
                      instanceId: b.id,
                    })
                  }
                >
                  Снести
                </HoldRevealButton>
              </div>
            </li>
          );
        })}
        {Array.from({ length: emptyCount }).map((_, i) => {
          const hot =
            !!highlightCategory &&
            (highlightBuildingIds?.length ?? 0) > 0;
          return (
            <li
              key={`empty-${zone}-${i}`}
              className={`sys-list-slots__card is-empty${hot ? " is-hot" : ""}`}
            >
              <div className="sys-list-slots__card-head">
                <strong>Пустой слот</strong>
                <span className="hint">
                  {hot
                    ? `Можно построить категорию ${highlightCategory}`
                    : "Свободно для постройки"}
                </span>
              </div>
              <div className="sys-list-slots__card-actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy}
                  onClick={() => onRequestBuild(zone)}
                >
                  Построить
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PlanetListSlots({
  planet,
  systemId,
  planetId,
  buildings,
  busy,
  highlightCategory,
  highlightBuildingIds,
  onAction,
  onInspect,
  onRequestBuild,
  laborPickFrom,
  laborDragging,
  onLaborPickBuilding,
  onLaborDragBuilding,
  onLaborTapBuilding,
}: Props) {
  const surface = planet.surfaceBuildings ?? [];
  const orbital = planet.orbitalBuildings ?? [];
  const surfaceMax = planet.surfaceSlots ?? 8;
  const orbitalMax = planet.orbitalSlots ?? 4;

  return (
    <div className="sys-list-slots" aria-label="Слоты планеты — список">
      <SlotSection
        title="Поверхность"
        used={surface.length}
        max={surfaceMax}
        items={surface}
        emptyCount={Math.max(0, surfaceMax - surface.length)}
        zone="surface"
        busy={busy}
        highlightCategory={highlightCategory}
        highlightBuildingIds={highlightBuildingIds}
        buildings={buildings}
        systemId={systemId}
        planetId={planetId}
        onAction={onAction}
        onInspect={onInspect}
        onRequestBuild={onRequestBuild}
        planet={planet}
        laborPickFrom={laborPickFrom}
        laborDragging={laborDragging}
        onLaborPickBuilding={onLaborPickBuilding}
        onLaborDragBuilding={onLaborDragBuilding}
        onLaborTapBuilding={onLaborTapBuilding}
      />
      <SlotSection
        title="Орбита"
        used={orbital.length}
        max={orbitalMax}
        items={orbital}
        emptyCount={Math.max(0, orbitalMax - orbital.length)}
        zone="orbital"
        busy={busy}
        highlightCategory={highlightCategory}
        highlightBuildingIds={highlightBuildingIds}
        buildings={buildings}
        systemId={systemId}
        planetId={planetId}
        onAction={onAction}
        onInspect={onInspect}
        onRequestBuild={onRequestBuild}
        planet={planet}
        laborPickFrom={laborPickFrom}
        laborDragging={laborDragging}
        onLaborPickBuilding={onLaborPickBuilding}
        onLaborDragBuilding={onLaborDragBuilding}
        onLaborTapBuilding={onLaborTapBuilding}
      />
    </div>
  );
}
