import { useEffect, useMemo, useState } from "react";
import type {
  Planet,
  PlanetBuilding,
  PlanetBuildingZone,
  StarSystem,
} from "../state/types";
import { COLONY_TYPE_LABELS } from "../state/defaults";
import { HABIT_LABELS, classifyPlanet } from "../state/planets";
import {
  CLIMATE_LABELS,
  PLANET_TYPE_LABELS,
} from "../state/defaults";
import {
  PlanetRadialSlots,
  type PlanetRadialInspect,
} from "./PlanetRadialSlots";
import {
  canFactionBuildDef,
  raceIdsFromComposition,
} from "../state/buildingAccess";
import { BuildingSlotsPanel } from "./BuildingSlotsPanel";
import { BuildingKindIcon } from "./BuildingKindIcon";
import { FloatingPanel } from "../ui/FloatingPanel";
import { HoldRevealButton } from "../ui/HoldRevealButton";
import type { MapResourceDef } from "../state/contentCatalog";
import { canBuildWithTech, type TechEcoSlice } from "../state/techGate";
import { InlineRename } from "../ui/InlineRename";
import { BuildDeck } from "./BuildDeck";
import {
  BuildPreview,
  BuildQueue,
  PlanetListSlots,
  planetsThatCanBuildCategory,
  type BuildPreviewResult,
  type BuildQueueItem,
  type SlotViewMode,
} from "./system";

export type BuildingSlotDef = {
  role: string;
  require: { category?: string; tier?: string; properties?: string[] };
  count: number;
};

export type BuildingDef = {
  id: string;
  kind: string;
  zone: PlanetBuildingZone;
  name: string;
  ap?: number;
  cost?: Record<string, number>;
  maxPerPlanet?: number;
  category?: string;
  tier?: number;
  faction?: string;
  prerequisites?: { race?: string };
  slots?: BuildingSlotDef[];
  upkeep_slots?: BuildingSlotDef[];
  effects?: Array<{ effect: string; args: Record<string, unknown> }>;
};

function resolveBuildingDef(
  buildings: Record<string, BuildingDef>,
  b: PlanetBuilding,
): BuildingDef | undefined {
  if (buildings[b.id]) return buildings[b.id];
  const byName = Object.values(buildings).find((d) => d.name === b.name);
  if (byName) return byName;
  return Object.values(buildings).find(
    (d) => d.kind === b.kind && (d.zone === b.zone || b.zone === "surface"),
  );
}

export type ColonyDef = {
  id: string;
  colonyType: string;
  name: string;
  colonizeAp?: number;
  colonizeCost?: Record<string, number>;
  setTypeAp?: number;
  setTypeCost?: Record<string, number>;
};

export type PlanetActionRequest = {
  action:
    | "build"
    | "demolish"
    | "colonize"
    | "set_colony_type"
    | "fill_slot"
    | "rename";
  systemId: string;
  planetId: string;
  buildingId?: string;
  instanceId?: string;
  colonyType?: string;
  slotRole?: string;
  slotResourceId?: string;
  name?: string;
};

function formatCost(cost?: Record<string, number>): string {
  if (!cost) return "—";
  const parts: string[] = [];
  if (cost["currency.metal"]) parts.push(`M${cost["currency.metal"]}`);
  if (cost["currency.supply"]) parts.push(`S${cost["currency.supply"]}`);
  return parts.join(" · ") || "—";
}

function normalizeColonyType(t?: string | null): string {
  if (!t || t === "none") return "none";
  if (t === "capital") return "core";
  return t;
}

function preferListView(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 768px)").matches;
}

export function PlayerPlanetManage({
  system,
  planet,
  factionId,
  stocks,
  reservedAp,
  apMax,
  buildings,
  colonies,
  mapResources,
  techEco,
  busy,
  message,
  onAction,
  onBack,
  onOpenResearch,
  buildQueue,
  onChangeBuildQueue,
  onPreviewBuild,
  highlightCategory,
  onShowInEconomy,
}: {
  system: StarSystem;
  planet: Planet;
  factionId: string;
  stocks: Record<string, number>;
  reservedAp: number;
  apMax: number;
  buildings: Record<string, BuildingDef>;
  colonies: Record<string, ColonyDef>;
  mapResources?: Record<string, MapResourceDef>;
  techEco?: TechEcoSlice;
  busy?: boolean;
  message?: string | null;
  onAction: (req: PlanetActionRequest) => void;
  onBack: () => void;
  onOpenResearch?: (techId: string) => void;
  buildQueue?: BuildQueueItem[];
  onChangeBuildQueue?: (next: BuildQueueItem[]) => void;
  onPreviewBuild?: (buildingId: string) => Promise<BuildPreviewResult | null>;
  highlightCategory?: string | null;
  onShowInEconomy?: (category: string) => void;
}) {
  const habit = classifyPlanet(planet);
  const ownerId = planet.ownerFactionId || system.ownerFactionId || null;
  const managed = ownerId === factionId;
  const empty =
    (planet.population ?? 0) <= 0 &&
    normalizeColonyType(planet.colonyType) === "none";
  const canColonize =
    system.ownerFactionId === factionId &&
    empty &&
    planet.colonizable !== false &&
    (!planet.ownerFactionId || planet.ownerFactionId === factionId);

  const surface = planet.surfaceBuildings ?? [];
  const orbital = planet.orbitalBuildings ?? [];
  const surfaceMax = planet.surfaceSlots ?? 8;
  const orbitalMax = planet.orbitalSlots ?? 4;

  const colonyOptions = useMemo(() => Object.values(colonies), [colonies]);
  const apLeft = Math.max(0, apMax - reservedAp);
  const [inspect, setInspect] = useState<PlanetRadialInspect | null>(null);
  const [viewMode, setViewMode] = useState<SlotViewMode>(() =>
    preferListView() ? "list" : "radial",
  );
  const [preview, setPreview] = useState<BuildPreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [listDeckZone, setListDeckZone] = useState<"surface" | "orbital" | null>(
    null,
  );

  useEffect(() => {
    setInspect(null);
    setPreview(null);
    setListDeckZone(null);
  }, [planet.id]);

  const highlightBuildingIds = useMemo(() => {
    if (!highlightCategory) return [];
    const match = planetsThatCanBuildCategory(
      system,
      factionId,
      highlightCategory,
      buildings,
    ).find((m) => m.planetId === planet.id);
    return match?.buildingIds ?? [];
  }, [highlightCategory, system, factionId, buildings, planet.id]);

  const inspectBuilding = useMemo(() => {
    if (!inspect) return null;
    const all = [...surface, ...orbital];
    const inst = all.find((b) => b.id === inspect.instanceId);
    if (!inst) return null;
    const def = resolveBuildingDef(buildings, inst);
    return { inst, def };
  }, [inspect, surface, orbital, buildings]);

  const requestPreview = async (buildingId: string) => {
    if (!onPreviewBuild) return;
    setPreviewLoading(true);
    try {
      setPreview(await onPreviewBuild(buildingId));
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="planet-detail planet-detail--manage">
      <div className="planet-detail-head">
        <button type="button" className="btn ghost" onClick={onBack}>
          ← К системе
        </button>
        <span className={`habit-badge ${habit}`}>{HABIT_LABELS[habit]}</span>
      </div>
      <h3 className="planet-detail-title">
        {managed ? (
          <InlineRename
            value={planet.name}
            title="Переименовать планету"
            onCommit={(name) =>
              onAction({
                action: "rename",
                systemId: system.id,
                planetId: planet.id,
                name,
              })
            }
          />
        ) : (
          planet.name
        )}
      </h3>

      <div
        className="planet-manage-metrics planet-manage-metrics--slim"
        aria-label="Сводка планеты"
      >
        <div className="planet-manage-metric">
          <span className="hint">Тип</span>
          <strong>
            {PLANET_TYPE_LABELS[planet.type]} · {CLIMATE_LABELS[planet.climate]}
          </strong>
        </div>
        <div className="planet-manage-metric">
          <span className="hint">Колония</span>
          <strong>
            {COLONY_TYPE_LABELS[normalizeColonyType(planet.colonyType)] ??
              planet.colonyType ??
              "—"}
            {planet.population > 0 ? ` · ${planet.population}` : ""}
          </strong>
        </div>
        <div className="planet-manage-metric">
          <span className="hint">Слоты</span>
          <strong>
            пов. {surface.length}/{surfaceMax} · орб. {orbital.length}/
            {orbitalMax}
          </strong>
        </div>
      </div>

      {highlightCategory && (
        <div className="sys-eco-hint fx-glow" role="status">
          <strong>Дефицит категории {highlightCategory}</strong>
          <em>
            Подсвечены слоты, где можно построить производство{" "}
            {highlightCategory}
          </em>
        </div>
      )}

      {message && <p className="hint planet-manage-msg">{message}</p>}

      {canColonize && (
        <section className="planet-manage-block">
          <h4>Колонизация</h4>
          <p className="hint">
            Зажми карту: списывает ресурсы и AP, колония появляется сразу.
          </p>
          <div className="planet-manage-grid">
            {colonyOptions.map((c) => (
              <HoldRevealButton
                key={c.id}
                className="btn ghost planet-manage-card"
                disabled={busy || apLeft < (c.colonizeAp ?? 1)}
                holdMs={800}
                title={`${c.name} — зажми, чтобы колонизировать`}
                onHoldComplete={() =>
                  onAction({
                    action: "colonize",
                    systemId: system.id,
                    planetId: planet.id,
                    colonyType: c.colonyType,
                  })
                }
              >
                <strong>{c.name}</strong>
                <span className="hint">
                  {formatCost(c.colonizeCost)} · {c.colonizeAp ?? 1} AP · зажми
                </span>
              </HoldRevealButton>
            ))}
          </div>
        </section>
      )}

      {!canColonize && !managed && (
        <p className="hint">Чужая или недоступная планета — только осмотр.</p>
      )}

      {managed && !empty && (
        <>
          <section className="planet-manage-block">
            <h4>Тип колонии</h4>
            <div className="order-type-chips">
              {colonyOptions.map((c) => {
                const on =
                  normalizeColonyType(planet.colonyType) === c.colonyType;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`order-type-chip ${on ? "on" : ""}`}
                    disabled={busy || on || apLeft < (c.setTypeAp ?? 1)}
                    title={`${formatCost(c.setTypeCost)} · ${c.setTypeAp ?? 1} AP`}
                    onClick={() =>
                      onAction({
                        action: "set_colony_type",
                        systemId: system.id,
                        planetId: planet.id,
                        colonyType: c.colonyType,
                      })
                    }
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="planet-manage-block">
            <div className="planet-detail-head" style={{ marginBottom: 8 }}>
              <h4 style={{ margin: 0 }}>Строительство</h4>
              <div className="planet-radial-stats">
                <span className="hint">
                  AP {reservedAp}/{apMax}
                  {apLeft === 0 ? " · нет AP" : ""}
                </span>
                <div
                  className="sys-view-toggle"
                  role="group"
                  aria-label="Вид слотов"
                >
                  <button
                    type="button"
                    className={viewMode === "radial" ? "is-on" : ""}
                    onClick={() => setViewMode("radial")}
                  >
                    Радиал
                  </button>
                  <button
                    type="button"
                    className={viewMode === "list" ? "is-on" : ""}
                    onClick={() => setViewMode("list")}
                  >
                    Список
                  </button>
                </div>
              </div>
            </div>

            {onChangeBuildQueue && (
              <BuildQueue
                queue={buildQueue ?? []}
                buildings={buildings}
                systemId={system.id}
                planetId={planet.id}
                stocks={stocks}
                busy={busy}
                onChangeQueue={onChangeBuildQueue}
              />
            )}

            {(preview || previewLoading) && (
              <BuildPreview
                preview={preview}
                loading={previewLoading}
                stocks={stocks}
                onCancel={() => setPreview(null)}
              />
            )}

            {viewMode === "radial" ? (
              <PlanetRadialSlots
                planet={planet}
                systemId={system.id}
                planetId={planet.id}
                factionId={factionId}
                raceIds={raceIdsFromComposition(planet.raceComposition)}
                buildings={buildings}
                stocks={stocks}
                reservedAp={reservedAp}
                apMax={apMax}
                techEco={techEco}
                busy={busy}
                onAction={onAction}
                onInspect={setInspect}
                onOpenResearch={onOpenResearch}
                highlightCategory={highlightCategory}
                highlightBuildingIds={highlightBuildingIds}
                onSelectBuilding={(id) => void requestPreview(id)}
              />
            ) : (
              <PlanetListSlots
                planet={planet}
                systemId={system.id}
                planetId={planet.id}
                buildings={buildings}
                busy={busy}
                highlightCategory={highlightCategory}
                highlightBuildingIds={highlightBuildingIds}
                onAction={onAction}
                onInspect={(instanceId, kind) => {
                  const all = [...surface, ...orbital];
                  const inst = all.find((b) => b.id === instanceId);
                  setInspect({
                    instanceId,
                    name: inst?.name ?? kind,
                    kind,
                    zone: inst?.zone === "orbital" ? "orbital" : "surface",
                  });
                }}
                onRequestBuild={(zone) => setListDeckZone(zone)}
              />
            )}

            {viewMode === "list" && listDeckZone && (
              <FloatingPanel
                open
                onClose={() => setListDeckZone(null)}
                title={`Колода · ${listDeckZone === "orbital" ? "Орбита" : "Поверхность"}`}
                storageKey="gmap-planet-build-deck-list"
                defaultGeom={{ x: 20, y: 120, w: 270, h: 420 }}
                minW={220}
                minH={200}
                zIndex={370}
                className="gmap-float-panel--build-deck"
              >
                <BuildDeck
                  embedded
                  defs={Object.values(buildings).filter(
                    (b) =>
                      (listDeckZone === "orbital"
                        ? b.zone === "orbital"
                        : b.zone !== "orbital") &&
                      canFactionBuildDef(b, factionId, {
                        raceIds: raceIdsFromComposition(planet.raceComposition),
                      }) &&
                      canBuildWithTech(techEco, b).ok,
                  )}
                  stocks={stocks}
                  apLeft={apLeft}
                  techEco={techEco}
                  busy={busy}
                  selectedId={null}
                  dragId={null}
                  zoneLabel={
                    listDeckZone === "orbital" ? "Орбита" : "Поверхность"
                  }
                  slotArmed
                  highlightCategory={highlightCategory}
                  highlightBuildingIds={highlightBuildingIds}
                  onSelect={(id) => void requestPreview(id)}
                  onHoldBuild={(id) => {
                    onAction({
                      action: "build",
                      systemId: system.id,
                      planetId: planet.id,
                      buildingId: id,
                    });
                    setListDeckZone(null);
                  }}
                  onDragStart={(id) => void requestPreview(id)}
                  onClose={() => setListDeckZone(null)}
                  onOpenResearch={onOpenResearch}
                />
              </FloatingPanel>
            )}
          </section>

          {inspectBuilding?.def && inspectBuilding.inst && (
            <FloatingPanel
              open={!!inspect}
              onClose={() => setInspect(null)}
              title={inspectBuilding.def.name}
              storageKey="gmap-planet-inspect"
              defaultGeom={{ x: 320, y: 100, w: 340, h: 460 }}
              minW={260}
              minH={220}
              zIndex={372}
              className="gmap-float-panel--inspect"
            >
              <div className="planet-manage-inspect-head">
                <BuildingKindIcon kind={inspect!.kind} size={18} />
                <div>
                  <strong>{inspectBuilding.def.name}</strong>
                  <div className="hint" style={{ fontSize: 10 }}>
                    {inspectBuilding.def.zone} · {inspectBuilding.def.kind}
                    {inspectBuilding.def.tier != null
                      ? ` · T${inspectBuilding.def.tier}`
                      : ""}
                  </div>
                </div>
              </div>
              {inspectBuilding.def.category && onShowInEconomy && (
                <button
                  type="button"
                  className="btn ghost"
                  style={{ marginBottom: 8 }}
                  onClick={() =>
                    onShowInEconomy(String(inspectBuilding.def!.category))
                  }
                >
                  В экономике ({inspectBuilding.def.category})
                </button>
              )}
              <p className="hint">
                Слоты ресурсов: tier режет узкое место. Тап по кольцу выбирает
                постройку.
              </p>
              <BuildingSlotsPanel
                building={inspectBuilding.inst}
                buildingDef={inspectBuilding.def}
                mapResources={mapResources}
                localResourceNames={planet.resources}
                techEco={techEco}
                busy={busy}
                onFill={(role, resourceId) =>
                  onAction({
                    action: "fill_slot",
                    systemId: system.id,
                    planetId: planet.id,
                    instanceId: inspectBuilding.inst.id,
                    slotRole: role,
                    slotResourceId: resourceId,
                  })
                }
                onUnfill={(role) =>
                  onAction({
                    action: "fill_slot",
                    systemId: system.id,
                    planetId: planet.id,
                    instanceId: inspectBuilding.inst.id,
                    slotRole: role,
                    slotResourceId: "",
                  })
                }
              />
            </FloatingPanel>
          )}
        </>
      )}
    </div>
  );
}
